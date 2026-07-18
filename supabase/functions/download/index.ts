// ============================================
// UnduhAja Edge Function: download
// GET /functions/v1/download?url=...&format=...&type=video|audio
// Streams the file from Cobalt to client
// ============================================

import {
  CORS_HEADERS,
  errorResponse,
  getClientIP,
  hashIP,
  verifyAuth,
  detectPlatform,
  checkRateLimit,
  isIPBlocked,
  RATE_LIMITS,
} from '../_shared/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const COBALT_API_URL = Deno.env.get('COBALT_API_URL')!;
const UNDAJA_API_KEY = Deno.env.get('UNDAJA_API_KEY')!;

const MAX_FILESIZE = 5 * 1024 * 1024 * 1024; // 5GB

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const reqUrl = new URL(req.url);
    const videoUrl = reqUrl.searchParams.get('url');
    const format = reqUrl.searchParams.get('format') ?? '1080p60';
    const type = (reqUrl.searchParams.get('type') ?? 'video') as 'video' | 'audio';

    if (!videoUrl) {
      return errorResponse('invalidUrl', 400);
    }

    if (type !== 'video' && type !== 'audio') {
      return errorResponse('invalidUrl', 400);
    }

    const platform = detectPlatform(videoUrl);
    if (!platform) {
      return errorResponse('unsupportedUrl', 400);
    }

    // Get client IP
    const ip = getClientIP(req);
    const ipHash = await hashIP(ip);

    const blocked = await isIPBlocked(SUPABASE_URL, SERVICE_ROLE_KEY, ipHash);
    if (blocked) {
      return errorResponse('rateLimited', 403);
    }

    // Verify auth
    const userId = await verifyAuth(req);
    const identifier = userId ?? ipHash;
    const identifierType: 'ip' | 'user' = userId ? 'user' : 'ip';
    const limit = userId ? RATE_LIMITS.userDownload : RATE_LIMITS.guestDownload;

    // Check rate limit
    const rateLimit = await checkRateLimit(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      identifier,
      identifierType,
      'download',
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

    // Map UnduhAja quality format to Cobalt format
    const cobaltRequest: Record<string, unknown> = {
      url: videoUrl,
      isAudioOnly: type === 'audio',
    };

    if (type === 'video') {
      // Cobalt uses different quality strings: "1080" or "1080p60"
      // Convert "1080p60" -> "1080" + isYoutubeHls=true (for 60fps)
      const qualityMatch = format.match(/^(\d+)/);
      if (qualityMatch) {
        cobaltRequest.videoQuality = qualityMatch[1];
      }
      // For 60fps, Cobalt handles automatically based on source
    } else {
      cobaltRequest.audioFormat = format === 'm4a' ? 'm4a' : 'mp3';
      cobaltRequest.audioBitrate = '320'; // source max
    }

    // Call UnduhAja Worker (Cloudflare) to get stream URL
    const cobaltResponse = await fetch(`${COBALT_API_URL}/api/json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': UNDAJA_API_KEY,
      },
      body: JSON.stringify(cobaltRequest),
    });

    if (!cobaltResponse.ok) {
      console.error('[download] Cobalt error:', cobaltResponse.status);
      return errorResponse('serverError', 502, rateLimitHeaders);
    }

    const cobaltData = await cobaltResponse.json();

    if (cobaltData.status === 'error' || !cobaltData.url) {
      const errCode = cobaltData.error?.code ?? 'serverError';
      return errorResponse(errCode, 400, rateLimitHeaders);
    }

    // Fetch the actual file and stream to client
    const upstream = await fetch(cobaltData.url, {
      headers: {
        'User-Agent': 'UnduhAja/1.0.0',
      },
    });

    if (!upstream.ok) {
      console.error('[download] Upstream error:', upstream.status);
      return errorResponse('serverError', 502, rateLimitHeaders);
    }

    // Check file size
    const contentLength = parseInt(upstream.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_FILESIZE) {
      return errorResponse('videoTooLarge', 413, rateLimitHeaders);
    }

    // Sanitize filename
    const ext = type === 'audio' ? (format === 'm4a' ? 'm4a' : 'mp3') : 'mp4';
    const safeFilename = sanitizeFilename(cobaltData.filename ?? 'unduhaja', ext);

    // Build response headers
    const responseHeaders = new Headers({
      'Content-Type': getContentType(ext),
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(rateLimit.reset),
    });

    if (contentLength > 0) {
      responseHeaders.set('Content-Length', String(contentLength));
    }

    // Insert anonymous stat (async, don't block response)
    insertDownloadStat(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      userId,
      ipHash,
      platform,
      type === 'audio' ? format : 'mp4',
      type === 'audio' ? null : format,
      contentLength,
      true,
      null
    ).catch((err) => console.error('[download] Stat insert error:', err));

    // Stream response
    return new Response(upstream.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('[download] Error:', err);
    return errorResponse('serverError', 500);
  }
});

function sanitizeFilename(filename: string, ext: string): string {
  const base = filename.replace(/\.[^/.]+$/, '');
  const safe = base.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 100);
  return `${safe || 'unduhaja'}.${ext}`;
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
  };
  return types[ext] ?? 'application/octet-stream';
}

async function insertDownloadStat(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | null,
  ipHash: string,
  platform: 'youtube' | 'tiktok',
  format: string,
  quality: string | null,
  fileSize: number,
  success: boolean,
  errorCode: string | null
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/download_stats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      ip_hash: ipHash,
      platform,
      format,
      quality,
      file_size_bytes: fileSize > 0 ? fileSize : null,
      duration_ms: null, // could track if needed
      success,
      error_code: errorCode,
    }),
  });
}
