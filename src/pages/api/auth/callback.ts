/**
 * GET /api/auth/callback
 * Handles Supabase auth redirects (Google OAuth, magic link, email verification).
 *
 * Scenarios:
 *   - Success: ?code=... → exchange for session → set cookies → redirect home
 *   - Error: ?error=...&error_description=... → redirect to error page
 *   - No code: redirect to home
 *
 * Error codes from Supabase:
 *   - access_denied (user clicked "Deny" on Google consent)
 *   - invalid_request
 *   - server_error
 *   - temporarily_unavailable
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getLangFromHeaders, defaultLang } from '@/i18n/utils';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorCode = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const next = url.searchParams.get('next') ?? '/';
  const authParam = url.searchParams.get('auth');

  // Detect language from headers, fallback to default
  const lang = getLangFromHeaders(request.headers) ?? defaultLang;

  // Handle error from auth provider (e.g., user denied Google consent)
  if (errorCode) {
    console.error('[auth/callback] Auth provider error:', errorCode, errorDescription);
    const errorSlug = mapAuthError(errorCode);
    return redirect(`/${lang}/?auth=error&code=${errorSlug}`, 302);
  }

  // Handle error flag from previous redirect (when we redirect back to home with ?auth=error)
  if (authParam === 'error') {
    return redirect(`/${lang}/`, 302);
  }

  // No code = invalid request
  if (!code) {
    console.warn('[auth/callback] No code in callback URL');
    return redirect(`/${lang}/?auth=error&code=no_code`, 302);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[auth/callback] Missing Supabase env vars');
    return redirect(`/${lang}/?auth=error&code=config_error`, 302);
  }

  // Create server-side client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('[auth/callback] Session exchange error:', error?.message);
      const errorSlug = mapSupabaseError(error?.message ?? '');
      return redirect(`/${lang}/?auth=error&code=${errorSlug}`, 302);
    }

    // Set session cookies (httpOnly, secure)
    const { access_token, refresh_token } = data.session;
    const isProd = url.hostname !== 'localhost';

    cookies.set('sb-access-token', access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    cookies.set('sb-refresh-token', refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Redirect to user's preferred language home or 'next' param
    const safeNext = sanitizeNext(next, lang);
    return redirect(safeNext, 302);
  } catch (err) {
    console.error('[auth/callback] Unexpected error:', err);
    return redirect(`/${lang}/?auth=error&code=server_error`, 302);
  }
};

function mapAuthError(errorCode: string): string {
  const map: Record<string, string> = {
    access_denied: 'access_denied',
    invalid_request: 'invalid_request',
    server_error: 'server_error',
    temporarily_unavailable: 'temporarily_unavailable',
    unauthorized_client: 'unauthorized_client',
    unsupported_response_type: 'unsupported_response_type',
  };
  return map[errorCode] ?? 'unknown_error';
}

function mapSupabaseError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('expired')) return 'token_expired';
  if (lower.includes('invalid')) return 'invalid_token';
  if (lower.includes('already been used')) return 'token_used';
  if (lower.includes('rate limit')) return 'rate_limited';
  return 'exchange_failed';
}

function sanitizeNext(next: string, lang: string): string {
  // Only allow internal paths, prevent open redirect
  if (!next.startsWith('/') || next.startsWith('//')) {
    return `/${lang}/`;
  }
  // If next doesn't start with /id/ or /en/, prepend lang
  if (!next.match(/^\/(id|en)\//)) {
    return `/${lang}${next === '/' ? '/' : next}`;
  }
  return next;
}
