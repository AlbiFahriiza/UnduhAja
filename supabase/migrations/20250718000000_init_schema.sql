-- ============================================
-- UnduhAja v1.0.0 — Database Schema
-- Migration: 20250718000000_init_schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- Table: rate_limits
-- Purpose: Atomic rate limiting counter per IP/user per endpoint
-- Auto-cleaned via pg_cron every hour
-- ============================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'user')),
  endpoint TEXT NOT NULL CHECK (endpoint IN ('extract', 'download', 'verify-turnstile')),
  count INTEGER NOT NULL DEFAULT 1,
  window_expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_limits_unique UNIQUE (identifier, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits (identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_expires ON public.rate_limits (window_expires);

-- ============================================
-- Table: user_preferences
-- Purpose: User-specific settings
-- RLS: User only access own row
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  language TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id', 'en')),
  default_quality TEXT NOT NULL DEFAULT '1080p60',
  default_format TEXT NOT NULL DEFAULT 'mp4' CHECK (default_format IN ('mp4', 'mp3', 'm4a')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Table: download_stats
-- Purpose: Anonymous analytics (NO URL stored - privacy first)
-- RLS: Insert only, no read access for users
-- ============================================
CREATE TABLE IF NOT EXISTS public.download_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
  format TEXT NOT NULL,
  quality TEXT,
  file_size_bytes BIGINT,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_download_stats_created_at ON public.download_stats (created_at);
CREATE INDEX IF NOT EXISTS idx_download_stats_platform ON public.download_stats (platform);
CREATE INDEX IF NOT EXISTS idx_download_stats_user_id ON public.download_stats (user_id);

-- ============================================
-- Table: blocked_ips
-- Purpose: Manual IP blacklist for abuse handling
-- ============================================
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  ip_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  blocked_by UUID REFERENCES auth.users(id),
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- user_preferences: user only CRUD own row
DROP POLICY IF EXISTS "users_manage_own_preferences" ON public.user_preferences;
CREATE POLICY "users_manage_own_preferences"
  ON public.user_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- download_stats: insert only (no read for users)
DROP POLICY IF EXISTS "users_insert_download_stats" ON public.download_stats;
CREATE POLICY "users_insert_download_stats"
  ON public.download_stats
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- rate_limits: service role only (no public access needed)
-- blocked_ips: service role only

-- ============================================
-- Function: check_rate_limit (atomic)
-- Returns: JSON with success, limit, remaining, reset
-- SECURITY DEFINER: runs as superuser to bypass RLS
-- ============================================
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_endpoint TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER DEFAULT 3600
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_count INTEGER;
  v_expires TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_existing
  FROM public.rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
  FOR UPDATE;

  IF v_existing IS NULL OR v_existing.window_expires < v_now THEN
    v_expires := v_now + make_interval(secs => p_window_seconds);
    INSERT INTO public.rate_limits (identifier, identifier_type, endpoint, count, window_expires)
    VALUES (p_identifier, p_identifier_type, p_endpoint, 1, v_expires)
    ON CONFLICT (identifier, endpoint) DO UPDATE
      SET count = 1, window_expires = v_expires, updated_at = v_now;
    v_count := 1;
  ELSE
    UPDATE public.rate_limits
    SET count = count + 1, updated_at = v_now
    WHERE identifier = p_identifier AND endpoint = p_endpoint;
    v_count := v_existing.count + 1;
    v_expires := v_existing.window_expires;
  END IF;

  RETURN json_build_object(
    'success', v_count <= p_limit,
    'limit', p_limit,
    'remaining', GREATEST(0, p_limit - v_count),
    'reset', extract(epoch from v_expires)::bigint * 1000
  );
END;
$$;

-- Grant execute on check_rate_limit to anon and authenticated
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- ============================================
-- Function: is_ip_blocked
-- Returns: BOOLEAN
-- ============================================
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_hash TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.blocked_ips
    WHERE ip_hash = p_ip_hash
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ip_blocked(TEXT) TO anon, authenticated;

-- ============================================
-- Auto-cleanup via pg_cron
-- ============================================
SELECT cron.schedule(
  'cleanup-rate-limits',
  '0 * * * *',
  'DELETE FROM public.rate_limits WHERE window_expires < now();'
);

SELECT cron.schedule(
  'cleanup-download-stats-90d',
  '0 3 * * *',
  'DELETE FROM public.download_stats WHERE created_at < now() - INTERVAL ''90 days'';'
);

-- ============================================
-- Function: handle_new_user
-- Auto-create user_preferences row on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Grant permissions
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT INSERT ON public.download_stats TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO service_role;
