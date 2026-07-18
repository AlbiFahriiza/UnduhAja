// ============================================
// UnduhAja Edge Function: extract
// POST /functions/v1/extract
// Body: { "url": "https://youtube.com/..." }
// Returns: { "metadata": {...} } or { "error": "..." }
// ============================================

import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  getClientIP,
  hashIP,
  verifyAuth,
  detectPlatform,
  checkRateLimit,
  isIPBlocked,
  RATE_LIMITS,
} from '../_shared/index.ts';

// Supabase auto-injects these env vars in Edge Functions:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (deprecated but available)
// - SUPABASE_ANON_KEY (deprecated but available)
// See: https://supabase.com/docs/guides/functions/secrets
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COBALT_API_URL = Deno.env.get('COBALT_API_URL')!;
const UNDAJA_API_KEY = Deno.env.get('UNDAJA_API_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json();
    const url: string = body?.url;

    if (!url || typeof url !== 'string') {
      return errorResponse('invalidUrl', 400);
    }

    const platform = detectPlatform(url);
    if (!platform) {
      return errorResponse('unsupportedUrl', 400);
    }

    // Check if live stream
    if (platform === 'youtube' && /\/live\//i.test(url)) {
      return errorResponse('liveStream', 400);
    }

    // Get client IP and check if blocked
    const ip = getClientIP(req);
    const ipHash = await hashIP(ip);

    const blocked = await isIPBlocked(SUPABASE_URL, SERVICE_ROLE_KEY, ipHash);
    if (blocked) {
      return errorResponse('rateLimited', 403);
    }

    // Verify auth (optional - can be guest)
    const userId = await verifyAuth(req);
    const identifier = userId ?? ipHash;
    const identifierType: 'ip' | 'user' = userId ? 'user' : 'ip';
    const limit = userId ? RATE_LIMITS.userExtract : RATE_LIMITS.guestExtract;

    // Check rate limit
    const rateLimit = await checkRateLimit(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      identifier,
      identifierType,
      'extract',
      limit
    );

    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(rateLimit.reset),
    };

    if (!rateLimit.success) {
      return errorResponse('rateLimited', 429, rateLimitHeaders);
    }

    // Call UnduhAja Worker (Cloudflare) to extract metadata
    let cobaltResponse: Response;
    try {
      cobaltResponse = await fetch(`${COBALT_API_URL}/api/json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Key': UNDAJA_API_KEY,
        },
        body: JSON.stringify({
          url,
          // Just metadata extraction — download stream happens later
        }),
      });
    } catch (fetchErr) {
      console.error('[extract] Worker fetch error:', fetchErr?.message ?? fetchErr);
      return errorResponse('serverError', 502, rateLimitHeaders);
    }

    if (!cobaltResponse.ok) {
      const errText = await cobaltResponse.text().catch(() => 'no body');
      console.error('[extract] Worker error:', cobaltResponse.status, errText);

      // Map common errors
      if (cobaltResponse.status === 400) return errorResponse('invalidUrl', 400, rateLimitHeaders);
      if (cobaltResponse.status === 404) return errorResponse('videoNotFound', 404, rateLimitHeaders);
      if (cobaltResponse.status === 429) return errorResponse('rateLimited', 429, rateLimitHeaders);

      return errorResponse('serverError', 502, rateLimitHeaders);
    }

    const cobaltData = await cobaltResponse.json();

    // Parse Cobalt response into UnduhAja metadata format
    // Cobalt v7 response format:
    // {
    //   "status": "stream" | "redirect" | "picker" | "error",
    //   "url": "https://stream-url",
    //   "filename": "video.mp4",
    //   "metadata": { title, author, thumbnail, ... }
    // }

    if (cobaltData.status === 'error') {
      const errCode = mapCobaltError(cobaltData.error?.code);
      return errorResponse(errCode, 400, rateLimitHeaders);
    }

    // Extract metadata from Cobalt response
    const metadata = {
      platform,
      videoId: extractVideoId(url, platform),
      title: cobaltData.metadata?.title ?? cobaltData.filename ?? 'Untitled Video',
      description: cobaltData.metadata?.description ?? '',
      channel: cobaltData.metadata?.author ?? cobaltData.metadata?.channel ?? '',
      channelVerified: cobaltData.metadata?.verified ?? false,
      channelAvatar: cobaltData.metadata?.authorAvatar ?? null,
      thumbnail: cobaltData.metadata?.thumbnail ?? cobaltData.metadata?.preview ?? null,
      duration: cobaltData.metadata?.duration ? formatDuration(cobaltData.metadata.duration) : undefined,
      viewCount: cobaltData.metadata?.views ?? undefined,
      uploadDate: cobaltData.metadata?.uploadedAt ?? undefined,
      sourceUrl: url,
      music: cobaltData.metadata?.audioTrack ?? null,
      embedUrl: platform === 'youtube' ? `https://www.youtube.com/embed/${extractVideoId(url, platform)}` : null,
      availableQualities: cobaltData.metadata?.availableQualities ?? getDefaultQualities(platform),
      // Cobalt stream URL (used by /download function)
      streamUrl: cobaltData.url ?? null,
      filename: cobaltData.filename ?? null,
    };

    return jsonResponse({ metadata }, 200, {
      ...rateLimitHeaders,
      'Cache-Control': 'private, no-store',
    });
  } catch (err) {
    console.error('[extract] Error:', err);
    return errorResponse('serverError', 500);
  }
});

function mapCobaltError(code?: string): string {
  if (!code) return 'serverError';
  const map: Record<string, string> = {
    'error.api.link.unsupported': 'unsupportedUrl',
    'error.api.link.invalid': 'invalidUrl',
    'error.api.content.video.unavailable': 'videoNotFound',
    'error.api.content.video.private': 'videoPrivate',
    'error.api.content.video.deleted': 'videoDeleted',
    'error.api.content.video.age_restricted': 'ageRestricted',
    'error.api.content.video.live': 'liveStream',
    'error.api.rate_exceeded': 'rateLimited',
    'error.api.generic': 'serverError',
  };
  return map[code] ?? 'serverError';
}

function extractVideoId(url: string, platform: 'youtube' | 'tiktok'): string {
  if (platform === 'youtube') {
    const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? '';
  }
  const match = url.match(/\/video\/(\d+)/);
  return match?.[1] ?? '';
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getDefaultQualities(platform: 'youtube' | 'tiktok'): string[] {
  if (platform === 'youtube') {
    return ['1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
  }
  return ['1080p', '720p', '480p', '360p'];
}
