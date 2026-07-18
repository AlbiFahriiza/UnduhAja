// ============================================
// UnduhAja Edge Functions — Shared helpers
// ============================================

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function handleCORS(req: Request): Response {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405 });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  error: string,
  status = 400,
  extraHeaders: Record<string, string> = {}
): Response {
  return jsonResponse({ error }, status, extraHeaders);
}

/**
 * Get client IP from request headers.
 * Vercel/Cloudflare proxy headers are handled.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = req.headers.get('x-real-ip');
  if (realIP) return realIP;
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  if (cfConnectingIP) return cfConnectingIP;
  return 'unknown';
}

/**
 * Hash IP address with SHA-256 for privacy (we don't store raw IPs).
 */
export async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + Deno.env.get('AUTH_SECRET') ?? '');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify Supabase JWT token.
 * Returns user_id or null.
 */
export async function verifyAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return null;

  try {
    // Use Supabase's auth API to verify token
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Detect platform from URL.
 */
export function detectPlatform(url: string): 'youtube' | 'tiktok' | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const ytPatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i,
    /^https?:\/\/youtu\.be\//i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
    /^https?:\/\/(www\.)?youtube\.com\/embed\//i,
  ];
  if (ytPatterns.some((p) => p.test(trimmed))) {
    if (/[?&]list=/i.test(trimmed)) return null; // reject playlists
    return 'youtube';
  }

  const ttPatterns = [
    /^https?:\/\/(www\.)?tiktok\.com\//i,
    /^https?:\/\/vm\.tiktok\.com\//i,
    /^https?:\/\/vt\.tiktok\.com\//i,
  ];
  if (ttPatterns.some((p) => p.test(trimmed))) return 'tiktok';

  return null;
}

/**
 * Check rate limit via Postgres function.
 */
export async function checkRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  identifier: string,
  identifierType: 'ip' | 'user',
  endpoint: 'extract' | 'download' | 'verify-turnstile',
  limit: number,
  windowSeconds: number = 3600
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      p_identifier: identifier,
      p_identifier_type: identifierType,
      p_endpoint: endpoint,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  });

  if (!res.ok) {
    return { success: true, limit, remaining: limit, reset: Date.now() + windowSeconds * 1000 };
  }

  return await res.json();
}

/**
 * Check if IP is blocked.
 */
export async function isIPBlocked(
  supabaseUrl: string,
  serviceRoleKey: string,
  ipHash: string
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/is_ip_blocked`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ p_ip_hash: ipHash }),
  });

  if (!res.ok) return false;
  const result = await res.json();
  return result === true;
}

export const RATE_LIMITS = {
  guestExtract: 20,
  userExtract: 100,
  guestDownload: 5,
  userDownload: 50,
  verifyTurnstile: 10,
} as const;
