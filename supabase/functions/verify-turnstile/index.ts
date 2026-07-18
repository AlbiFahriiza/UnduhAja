// ============================================
// UnduhAja Edge Function: verify-turnstile
// POST /functions/v1/verify-turnstile
// Body: { "token": "turnstile-token-from-frontend" }
// Returns: { "success": true } or { "success": false, "error": "..." }
// ============================================

import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  getClientIP,
  checkRateLimit,
  RATE_LIMITS,
} from '../_shared/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json();
    const token: string = body?.token;

    if (!token || typeof token !== 'string') {
      return errorResponse('Token required', 400);
    }

    // Rate limit (10 verifications per hour per IP)
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      ip,
      'ip',
      'verify-turnstile',
      RATE_LIMITS.verifyTurnstile
    );

    if (!rateLimit.success) {
      return errorResponse('rateLimited', 429);
    }

    // Verify token with Cloudflare
    const formData = new FormData();
    formData.append('secret', TURNSTILE_SECRET);
    formData.append('response', token);
    formData.append('remoteip', ip);

    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    if (!verifyResponse.ok) {
      console.error('[verify-turnstile] Cloudflare error:', verifyResponse.status);
      return jsonResponse({ success: false, error: 'verification_failed' }, 502);
    }

    const result = await verifyResponse.json();

    if (!result.success) {
      return jsonResponse({
        success: false,
        error: result['error-codes']?.[0] ?? 'verification_failed',
      }, 400);
    }

    return jsonResponse({
      success: true,
      challenge_ts: result.challenge_ts,
      hostname: result.hostname,
    });
  } catch (err) {
    console.error('[verify-turnstile] Error:', err);
    return errorResponse('serverError', 500);
  }
});
