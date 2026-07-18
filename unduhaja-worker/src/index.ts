/**
 * UnduhAja API — Cloudflare Worker
 *
 * YouTube via Piped API (open-source, public instances)
 * TikTok via HTML scraping (JSON-LD + SIGI_STATE)
 *
 * Endpoints:
 *   GET  /api/health           — Health check
 *   POST /api/json             — Cobalt-compatible JSON API
 *
 * Security:
 *   - API key required (X-API-Key header)
 *   - CORS open (Supabase Edge Function calls this server-to-server)
 */

export interface Env {
  API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

// Multiple Piped instances for failover (ordered by reliability)
// Note: Piped instances often go down or get blocked by YouTube.
// We try them in order and fall back to next on failure.
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.ducks.party',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.leptons.xyz',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method === 'GET' && path === '/api/health') {
      return jsonResponse({
        status: 'ok',
        version: '1.1.0',
        service: 'unduhaja-api',
        time: new Date().toISOString(),
      });
    }

    // Debug endpoint — test TikWM connectivity from Worker
    if (request.method === 'GET' && path === '/api/debug/tikwm') {
      const apiKey = request.headers.get('X-API-Key');
      if (!env.API_KEY || apiKey !== env.API_KEY) {
        return errorResponse('error.api.auth.unauthorized', 401);
      }
      try {
        const testUrl = 'https://www.tikwm.com/api/?url=https://www.tiktok.com/@tiktok/video/7106594312292453675';
        const res = await fetch(testUrl, {
          headers: { 'User-Agent': UA, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        return jsonResponse({
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: text.substring(0, 1000),
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message, cause: err.cause?.message });
      }
    }

    if (request.method !== 'POST' || path !== '/api/json') {
      return errorResponse('error.api.route.not_found', 404);
    }

    const apiKey = request.headers.get('X-API-Key');
    if (!env.API_KEY || apiKey !== env.API_KEY) {
      return errorResponse('error.api.auth.unauthorized', 401);
    }

    try {
      const body = await request.json() as any;
      const videoUrl: string = body?.url;

      if (!videoUrl || typeof videoUrl !== 'string') {
        return errorResponse('error.api.link.invalid', 400);
      }

      const platform = detectPlatform(videoUrl);
      if (!platform) {
        return errorResponse('error.api.link.unsupported', 400);
      }

      let result;
      if (platform === 'youtube') {
        result = await handleYouTube(videoUrl, body);
      } else {
        result = await handleTikTok(videoUrl, body);
      }

      return jsonResponse(result);
    } catch (err: any) {
      console.error('[unduhaja-api] Error:', err);
      return errorResponse('error.api.generic', 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ============================================
// Helpers
// ============================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(errorCode: string, status = 400): Response {
  return jsonResponse({
    status: 'error',
    error: { code: errorCode },
  }, status);
}

function detectPlatform(url: string): 'youtube' | 'tiktok' | null {
  const t = url.trim();
  if (/^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i.test(t)) return 'youtube';
  if (/^https?:\/\/youtu\.be\//i.test(t)) return 'youtube';
  if (/^https?:\/\/(www\.)?youtube\.com\/shorts\//i.test(t)) return 'youtube';
  if (/^https?:\/\/(www\.)?youtube\.com\/embed\//i.test(t)) return 'youtube';
  if (/^https?:\/\/(www\.)?tiktok\.com\//i.test(t)) return 'tiktok';
  if (/^https?:\/\/vm\.tiktok\.com\//i.test(t)) return 'tiktok';
  if (/^https?:\/\/vt\.tiktok\.com\//i.test(t)) return 'tiktok';
  return null;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchWithFailover(
  path: string,
  maxAttempts = 3
): Promise<{ data: any; instanceIndex: number }> {
  let lastErr: any = null;
  for (let i = 0; i < maxAttempts && i < PIPED_INSTANCES.length; i++) {
    const instance = PIPED_INSTANCES[i];
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
        },
        // 8 second timeout per instance
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return { data, instanceIndex: i };
      }
      lastErr = new Error(`HTTP ${res.status} from ${instance}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('All Piped instances failed');
}

// ============================================
// YouTube via Piped API
// ============================================

async function handleYouTube(videoUrl: string, request: any) {
  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    return { status: 'error', error: { code: 'error.api.link.invalid' } };
  }

  const isAudioOnly: boolean = request?.isAudioOnly ?? false;
  const requestedQuality: string = request?.videoQuality ?? '1080';
  const audioFormat: string = request?.audioFormat ?? 'mp3';

  try {
    // Piped streams endpoint: GET /streams/{videoId}
    const { data } = await fetchWithFailover(`/streams/${videoId}`);

    // Check error
    if (data?.error) {
      const msg = (data.message ?? '').toLowerCase();
      if (msg.includes('private')) return { status: 'error', error: { code: 'error.api.content.video.private' } };
      if (msg.includes('not exist') || msg.includes('deleted') || msg.includes('removed')) return { status: 'error', error: { code: 'error.api.content.video.deleted' } };
      if (msg.includes('age')) return { status: 'error', error: { code: 'error.api.content.video.age_restricted' } };
      if (msg.includes('live')) return { status: 'error', error: { code: 'error.api.content.video.live' } };
      return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
    }

    // Extract metadata
    const metadata = {
      title: data.title ?? 'Untitled',
      author: data.uploader ?? '',
      authorUrl: data.uploaderUrl ?? '',
      description: data.description ?? '',
      thumbnail: data.thumbnailUrl ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      duration: data.duration ?? 0,
      views: data.views ?? 0,
      uploadedAt: data.uploadDate ?? '',
      verified: data.uploaderVerified ?? false,
      availableQualities: extractYouTubeQualities(data),
    };

    // Pick best stream
    let selectedStream: any = null;

    if (isAudioOnly) {
      // Get highest bitrate audio stream
      const audioStreams = (data.audioStreams ?? []).sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      selectedStream = audioStreams[0];

      // Fallback: if no audio-only streams, use lowest quality muxed video (has audio)
      // Filter out LBRY (huge 4K files) and HLS (not downloadable directly)
      if (!selectedStream) {
        const muxedStreams = (data.videoStreams ?? [])
          .filter((s: any) =>
            s.videoOnly === false &&
            s.quality !== 'LBRY' &&
            s.quality !== 'LBRY HLS' &&
            s.quality !== 'HLS' &&
            !String(s.quality).includes('LBRY')
          )
          .sort((a: any, b: any) => {
            const qa = parseInt(String(a.quality).replace(/\D/g, ''), 10) || 9999;
            const qb = parseInt(String(b.quality).replace(/\D/g, ''), 10) || 9999;
            return qa - qb; // lowest quality first (smaller file)
          });
        selectedStream = muxedStreams[0];
        if (selectedStream) {
          console.warn('[youtube] No audio-only streams, falling back to muxed video (will return MP4 not MP3)');
        }
      }
    } else {
      // Find video stream matching requested quality
      // Filter out LBRY (huge 4K files) and HLS (not downloadable directly)
      const videoStreams = (data.videoStreams ?? []).filter((s: any) =>
        s.quality !== 'LBRY' &&
        s.quality !== 'LBRY HLS' &&
        s.quality !== 'HLS' &&
        !String(s.quality).includes('LBRY')
      );

      // Prefer muxed streams (video+audio) at the target quality
      const muxedStreams = videoStreams.filter((s: any) => s.videoOnly === false);
      const videoOnlyStreams = videoStreams.filter((s: any) => s.videoOnly === true);

      const targetHeight = parseInt(requestedQuality.replace(/\D/g, ''), 10) || 1080;
      const is60fps = requestedQuality.includes('60') || requestedQuality.endsWith('p60');

      // Try muxed first at exact quality
      const muxedAtQuality = muxedStreams.find((s: any) =>
        s.quality === String(targetHeight) && (is60fps ? (s.fps ?? 30) >= 60 : (s.fps ?? 30) < 60)
      );
      const muxedAtAnyFps = muxedStreams.find((s: any) => s.quality === String(targetHeight));

      // Try video-only at exact quality (if no muxed)
      const videoOnlyAtQuality = videoOnlyStreams.find((s: any) =>
        s.quality === String(targetHeight) && (is60fps ? (s.fps ?? 30) >= 60 : (s.fps ?? 30) < 60)
      );
      const videoOnlyAtAnyFps = videoOnlyStreams.find((s: any) => s.quality === String(targetHeight));

      // Fallback: closest lower quality
      const lowerMuxed = muxedStreams
        .filter((s: any) => parseInt(s.quality, 10) < targetHeight)
        .sort((a: any, b: any) => parseInt(b.quality, 10) - parseInt(a.quality, 10))[0];
      const lowerVideoOnly = videoOnlyStreams
        .filter((s: any) => parseInt(s.quality, 10) < targetHeight)
        .sort((a: any, b: any) => parseInt(b.quality, 10) - parseInt(a.quality, 10))[0];

      selectedStream = muxedAtQuality ?? muxedAtAnyFps ?? videoOnlyAtQuality ?? videoOnlyAtAnyFps ?? lowerMuxed ?? lowerVideoOnly ?? videoStreams[0];
    }

    if (!selectedStream || !selectedStream.url) {
      return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
    }

    // Build filename
    const safeTitle = metadata.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80);
    const ext = isAudioOnly
      ? (audioFormat === 'm4a' ? 'm4a' : 'mp3')
      : (selectedStream.mimeType?.includes('webm') ? 'webm' : 'mp4');
    const filename = `${safeTitle || 'unduhaja_youtube'}.${ext}`;

    return {
      status: 'stream',
      url: selectedStream.url,
      filename,
      metadata,
    };
  } catch (err: any) {
    console.error('[youtube] Error:', err.message);
    return { status: 'error', error: { code: 'error.api.generic' } };
  }
}

function extractYouTubeQualities(data: any): string[] {
  const qualities = new Set<string>();
  for (const s of (data.videoStreams ?? [])) {
    // Piped returns quality as a string like "360" or "720"
    // Filter out LBRY / HLS special types
    if (!s.quality || s.quality === 'LBRY' || s.quality === 'HLS') continue;
    const qNum = String(s.quality).replace(/\D/g, '');
    if (!qNum) continue;
    const fps = s.fps ?? 30;
    const key = fps >= 60 ? `${qNum}p60` : `${qNum}p`;
    qualities.add(key);
  }
  // Sort descending by quality number
  const order = ['1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
  const result = Array.from(qualities).sort((a, b) => {
    const ha = parseInt(a);
    const hb = parseInt(b);
    if (ha !== hb) return hb - ha;
    // Higher fps first
    const fa = a.endsWith('60') ? 60 : 30;
    const fb = b.endsWith('60') ? 60 : 30;
    return fb - fa;
  });
  return result.length > 0 ? result : order;
}

// ============================================
// TikTok via TikWM API (third-party, free, no auth)
// TikTok blocks Cloudflare Workers IPs directly, so we use TikWM as proxy.
// ============================================

async function handleTikTok(videoUrl: string, _request: any) {
  // TikWM has rate limit 1 req/sec per IP. Retry with backoff.
  const maxRetries = 3;
  let lastErr: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // POST with form data — TikWM docs recommend POST
      const formData = new URLSearchParams();
      formData.append('url', videoUrl);

      const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.tikwm.com',
          'Referer': 'https://www.tikwm.com/',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error('[tiktok] TikWM HTTP error:', res.status);
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1200 * (attempt + 1));
        continue;
      }

      const data: any = await res.json();

      // Check for rate limit error
      if (data?.code !== 0) {
        const msg = (data?.msg ?? '').toLowerCase();
        if (msg.includes('limit') || msg.includes('rate')) {
          // Rate limited — wait and retry
          console.error(`[tiktok] TikWM rate limit, attempt ${attempt + 1}`);
          lastErr = new Error('Rate limited');
          await sleep(1500 * (attempt + 1));
          continue;
        }
        // Real error from TikWM
        if (msg.includes('private')) return { status: 'error', error: { code: 'error.api.content.video.private' } };
        if (msg.includes('not exist') || msg.includes('deleted')) return { status: 'error', error: { code: 'error.api.content.video.deleted' } };
        if (msg.includes('age')) return { status: 'error', error: { code: 'error.api.content.video.age_restricted' } };
        if (msg.includes('url parsing')) return { status: 'error', error: { code: 'error.api.link.invalid' } };
        console.error('[tiktok] TikWM error:', data?.msg);
        return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
      }

      const v = data.data;
      const streamUrl = v.play ?? v.hdplay ?? v.wmplay ?? null;
      if (!streamUrl) {
        return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
      }

      const fullStreamUrl = streamUrl.startsWith('http')
        ? streamUrl
        : `https://www.tikwm.com${streamUrl}`;

      const title = v.title ?? 'TikTok Video';
      const authorUnique = v.author?.unique_id ?? v.author?.id ?? '';
      const authorDisplay = v.author?.nickname ?? '';
      const thumbnail = v.cover ?? v.origin_cover ?? '';
      const duration = v.duration ?? 0;
      const views = v.play_count ?? 0;
      const uploadTime = v.create_time ? new Date(v.create_time * 1000).toISOString() : '';
      const music = v.music_info?.title
        ? `${v.music_info.title} — ${v.music_info.author ?? ''}`
        : (v.music ? String(v.music) : undefined);

      const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80);
      const filename = `${safeTitle || 'tiktok_unduhaja'}.mp4`;

      return {
        status: 'stream',
        url: fullStreamUrl,
        filename,
        metadata: {
          title,
          author: authorUnique ? `@${authorUnique}` : authorDisplay,
          authorAvatar: v.author?.avatar ?? null,
          description: title,
          thumbnail,
          duration,
          views,
          uploadedAt: uploadTime,
          music,
          verified: v.author?.verified ?? false,
          availableQualities: [],
        },
      };
    } catch (err: any) {
      console.error(`[tiktok] Attempt ${attempt + 1} error:`, err.message);
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }

  console.error('[tiktok] All retries failed:', lastErr?.message);
  return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseISO8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (parseInt(h ?? '0', 10) * 3600) + (parseInt(min ?? '0', 10) * 60) + parseInt(s ?? '0', 10);
}
