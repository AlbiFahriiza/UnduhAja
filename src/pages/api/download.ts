/**
 * GET /api/download?url=...&format=...&type=video|audio
 *
 * Streams the video/audio file from yt-dlp to the client.
 * Sets Content-Disposition for browser download.
 *
 * Rate limited: 5/hr (guest), 50/hr (auth).
 * Max file size: 5GB (enforced via Content-Length check).
 */
import type { APIRoute } from 'astro';
import { getDownloadStream, YtdlpError } from '@/lib/yt-dlp';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit';
import { getSession } from '@/lib/supabase';

const MAX_FILESIZE = 5 * 1024 * 1024 * 1024; // 5GB

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const videoUrl = url.searchParams.get('url');
    const format = url.searchParams.get('format') ?? '1080p60';
    const type = (url.searchParams.get('type') ?? 'video') as 'video' | 'audio';

    if (!videoUrl) {
      return json({ error: 'invalidUrl' }, 400);
    }

    if (type !== 'video' && type !== 'audio') {
      return json({ error: 'invalidUrl' }, 400);
    }

    // Auth check for higher rate limit
    const session = locals.session ?? null;
    const ip = getClientIP(request);
    const identifier = session?.user?.id ?? ip;
    const limit = session ? RATE_LIMITS.userDownload : RATE_LIMITS.guestDownload;

    const rateLimit = await checkRateLimit(`download:${identifier}`, limit, 3600);
    if (!rateLimit.success) {
      return json({ error: 'rateLimited' }, 429);
    }

    // Get stream URL from yt-dlp
    const { streamUrl, filename } = await getDownloadStream(videoUrl, format, type);

    // Fetch the actual file and stream to client
    const upstream = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'UnduhAja/1.0.0 (https://unduhaja.vercel.app)',
      },
    });

    if (!upstream.ok) {
      console.error('[api/download] Upstream error:', upstream.status, upstream.statusText);
      return json({ error: 'serverError' }, 502);
    }

    // Check file size limit
    const contentLength = parseInt(upstream.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_FILESIZE) {
      return json({ error: 'videoTooLarge' }, 413);
    }

    // Build sanitized filename
    const ext = type === 'audio' ? (format === 'm4a' ? 'm4a' : 'mp3') : 'mp4';
    const safeFilename = sanitizeFilename(filename, ext);

    // Stream the response
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': getContentType(ext),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': contentLength > 0 ? String(contentLength) : '',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-RateLimit-Limit': String(rateLimit.limit),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (err) {
    if (err instanceof YtdlpError) {
      const statusCode = err.code === 'RATE_LIMITED' ? 429 : 400;
      return json({ error: err.code }, statusCode);
    }
    console.error('[api/download] Error:', err);
    return json({ error: 'serverError' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeFilename(filename: string, ext: string): string {
  // Remove extension if present
  const base = filename.replace(/\.[^/.]+$/, '');
  // Replace problematic chars
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
