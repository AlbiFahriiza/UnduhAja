/**
 * POST /api/extract
 *
 * Body: { url: string }
 * Returns: { metadata: YtdlpMetadata } or { error: string }
 *
 * Rate limited: 20/hr (guest), 100/hr (auth).
 */
import type { APIRoute } from 'astro';
import { extractMetadata, YtdlpError } from '@/lib/yt-dlp';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';
import { getSession } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const body = await request.json();
    const url: string = body?.url;

    if (!url || typeof url !== 'string') {
      return json({ error: 'invalidUrl' }, 400);
    }

    // Check auth for higher rate limit
    const session = locals.session ?? null;
    const ip = getClientIP(request);
    const identifier = session?.user?.id ?? ip;
    const limit = session ? RATE_LIMITS.userExtract : RATE_LIMITS.guestExtract;

    const rateLimit = await checkRateLimit(`extract:${identifier}`, limit, 3600);
    if (!rateLimit.success) {
      return json(
        { error: 'rateLimited' },
        429,
        {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.reset),
        }
      );
    }

    const metadata = await extractMetadata(url);

    return json({ metadata }, 200, {
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(rateLimit.reset),
      'Cache-Control': 'private, no-store',
    });
  } catch (err) {
    if (err instanceof YtdlpError) {
      const statusCode = err.code === 'RATE_LIMITED' ? 429 : 400;
      return json({ error: err.code }, statusCode);
    }
    console.error('[api/extract] Error:', err);
    return json({ error: 'serverError' }, 500);
  }
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
