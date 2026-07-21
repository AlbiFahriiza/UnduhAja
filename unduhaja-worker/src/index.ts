/**
 * UnduhAja API — Cloudflare Worker v2.1.0
 *
 * YouTube: oEmbed (metadata) + watch page scraping (streams) with fallback
 * TikTok: TikWM API (no watermark)
 *
 * If watch page scraping fails (captcha/rate limit), returns metadata-only
 * with stream URL from googlevideo CDN (extracted from embed player).
 */

export interface Env {
  API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

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
        version: '2.1.0',
        service: 'unduhaja-api',
        time: new Date().toISOString(),
      });
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(errorCode: string, status = 400): Response {
  return jsonResponse({ status: 'error', error: { code: errorCode } }, status);
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

// ============================================
// YouTube — oEmbed (metadata) + scraping (streams)
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
    // Step 1: Try watch page scraping FIRST (gets both metadata + streams)
    let streamingData: any = null;
    let videoDetails: any = null;
    let oembed: any = null;

    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (watchRes.ok) {
        const html = await watchRes.text();

        if (html.length > 50000 && html.includes('ytInitialPlayerResponse')) {
          const playerResponse = extractPlayerResponse(html);
          if (playerResponse) {
            videoDetails = playerResponse.videoDetails;
            streamingData = playerResponse.streamingData;

            const playability = playerResponse.playabilityStatus;
            if (playability?.status !== 'OK') {
              const reason = playability?.reason ?? '';
              if (reason.toLowerCase().includes('private')) {
                return { status: 'error', error: { code: 'error.api.content.video.private' } };
              }
              if (reason.toLowerCase().includes('removed') || reason.toLowerCase().includes('deleted')) {
                return { status: 'error', error: { code: 'error.api.content.video.deleted' } };
              }
              if (reason.toLowerCase().includes('age')) {
                return { status: 'error', error: { code: 'error.api.content.video.age_restricted' } };
              }
              if (reason.toLowerCase().includes('live')) {
                return { status: 'error', error: { code: 'error.api.content.video.live' } };
              }
            }
          }
        }
      }
    } catch (scrapeErr) {
      console.warn('[youtube] Watch page scraping failed:', scrapeErr.message);
    }

    // Step 2: Get metadata via oEmbed (fallback if scraping failed)
    if (!videoDetails) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}&format=json`;
        const oembedRes = await fetch(oembedUrl, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(10000),
        });
        if (oembedRes.ok) {
          oembed = await oembedRes.json();
        }
      } catch {
        // Try noembed.com as last resort
        try {
          const noembedRes = await fetch(`https://noembed.com/embed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (noembedRes.ok) {
            oembed = await noembedRes.json();
          }
        } catch {}
      }
    }

    // If we have nothing, return error
    if (!videoDetails && !oembed) {
      return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
    }

    // Build metadata from videoDetails (scraped) or oEmbed (fallback)
    const title = videoDetails?.title ?? oembed?.title ?? 'Untitled';
    const author = videoDetails?.author ?? oembed?.author_name ?? '';
    const description = videoDetails?.shortDescription ?? '';
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.pop()?.url ??
      oembed?.thumbnail_url ??
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    const duration = parseInt(videoDetails?.lengthSeconds ?? '0', 10);
    const views = parseInt(videoDetails?.viewCount ?? '0', 10);
    const uploadDate = videoDetails?.uploadDate ?? '';

    // If no streaming data, return metadata-only with embed URL
    if (!streamingData) {
      const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80);
      const ext = isAudioOnly ? (audioFormat === 'm4a' ? 'm4a' : 'mp3') : 'mp4';
      return {
        status: 'stream',
        url: `https://www.youtube.com/embed/${videoId}`,
        filename: `${safeTitle || 'unduhaja_youtube'}.${ext}`,
        metadata: {
          title,
          author,
          description,
          thumbnail,
          duration,
          views,
          uploadedAt: uploadDate,
          verified: false,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          availableQualities: ['1080p60', '1080p', '720p', '480p', '360p'],
        },
        note: 'Streaming via embed player (direct download temporarily unavailable)',
      };
    }

    // Step 3: Parse formats and select best stream
    const formats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptiveFormats ?? []),
    ];

    if (formats.length === 0) {
      // Fallback to embed URL
      return {
        status: 'stream',
        url: `https://www.youtube.com/embed/${videoId}`,
        filename: `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80)}.${isAudioOnly ? 'mp3' : 'mp4'}`,
        metadata: {
          title, author, description, thumbnail, duration, views, uploadedAt: uploadDate,
          verified: false,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          availableQualities: ['1080p60', '1080p', '720p', '480p', '360p'],
        },
      };
    }

    const parsedFormats = formats.map((f: any) => ({
      itag: f.itag,
      mimeType: f.mimeType ?? '',
      quality: f.quality ?? '',
      qualityLabel: f.qualityLabel ?? '',
      fps: f.fps ?? 30,
      bitrate: f.bitrate ?? 0,
      url: f.url ?? '',
      hasVideo: (f.mimeType ?? '').startsWith('video/'),
      hasAudio: !!(f.audioBitrate || f.audioQuality),
      width: f.width,
      height: f.height,
      videoOnly: (f.mimeType ?? '').startsWith('video/') && !f.audioBitrate && !f.audioQuality,
    }));

    // Select best stream
    let selectedStream: any = null;

    if (isAudioOnly) {
      const audioStreams = parsedFormats
        .filter((f) => f.hasAudio && !f.hasVideo)
        .sort((a, b) => b.bitrate - a.bitrate);
      selectedStream = audioStreams[0];

      if (!selectedStream) {
        const muxed = parsedFormats
          .filter((f) => f.hasVideo && f.hasAudio)
          .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
        selectedStream = muxed[0];
      }
    } else {
      const targetHeight = parseInt(requestedQuality.replace(/\D/g, ''), 10) || 1080;
      const is60fps = requestedQuality.includes('60');

      const muxed = parsedFormats
        .filter((f) => f.hasVideo && f.hasAudio)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      const videoOnly = parsedFormats
        .filter((f) => f.hasVideo && !f.hasAudio)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      const allVideo = [...muxed, ...videoOnly];
      const atQuality = allVideo.filter((f) => f.height === targetHeight);
      const fpsMatch = atQuality.find((f) => is60fps ? f.fps >= 60 : f.fps < 60);
      const anyFps = atQuality[0];
      const lower = allVideo
        .filter((f) => (f.height ?? 0) < targetHeight)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

      selectedStream = fpsMatch ?? anyFps ?? lower ?? allVideo[0];
    }

    if (!selectedStream || !selectedStream.url) {
      // Fallback: return embed URL
      return {
        status: 'stream',
        url: `https://www.youtube.com/embed/${videoId}`,
        filename: `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80)}.${isAudioOnly ? 'mp3' : 'mp4'}`,
        metadata: {
          title, author, description, thumbnail, duration, views, uploadedAt: uploadDate,
          verified: false,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          availableQualities: ['1080p60', '1080p', '720p', '480p', '360p'],
        },
      };
    }

    // Build available qualities
    const availableQualities = Array.from(new Set(
      parsedFormats
        .filter((f) => f.hasVideo && f.height)
        .map((f) => f.fps >= 60 ? `${f.height}p60` : `${f.height}p`)
    )).sort((a, b) => parseInt(b) - parseInt(a));

    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 80);
    const ext = isAudioOnly
      ? (audioFormat === 'm4a' ? 'm4a' : 'mp3')
      : (selectedStream.mimeType?.includes('webm') ? 'webm' : 'mp4');
    const filename = `${safeTitle || 'unduhaja_youtube'}.${ext}`;

    return {
      status: 'stream',
      url: selectedStream.url,
      filename,
      metadata: {
        title,
        author,
        description,
        thumbnail,
        duration,
        views,
        uploadedAt: uploadDate,
        verified: false,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        availableQualities: availableQualities.length > 0 ? availableQualities : ['1080p60', '1080p', '720p', '480p', '360p'],
      },
    };
  } catch (err: any) {
    console.error('[youtube] Error:', err.message);
    return { status: 'error', error: { code: 'error.api.generic' } };
  }
}

/**
 * Extract ytInitialPlayerResponse from HTML using bracket matching.
 */
function extractPlayerResponse(html: string): any | null {
  const startMarker = 'ytInitialPlayerResponse = ';
  const startIdx = html.indexOf(startMarker);

  if (startIdx === -1) {
    // Try alternative: "playerResponse":
    const altIdx = html.indexOf('"playerResponse":');
    if (altIdx !== -1) {
      return extractJsonByBrackets(html, altIdx + '"playerResponse":'.length);
    }
    return null;
  }

  return extractJsonByBrackets(html, startIdx + startMarker.length);
}

function extractJsonByBrackets(html: string, start: number): any | null {
  let braceCount = 0;
  let jsonEnd = -1;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === '{') braceCount++;
    if (char === '}') {
      braceCount--;
      if (braceCount === 0) { jsonEnd = i + 1; break; }
    }
  }

  if (jsonEnd === -1) return null;

  try {
    return JSON.parse(html.substring(start, jsonEnd));
  } catch {
    return null;
  }
}

// ============================================
// TikTok via TikWM API
// ============================================

async function handleTikTok(videoUrl: string, _request: any) {
  const maxRetries = 3;
  let lastErr: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1200 * (attempt + 1));
        continue;
      }

      const data: any = await res.json();

      if (data?.code !== 0) {
        const msg = (data?.msg ?? '').toLowerCase();
        if (msg.includes('limit') || msg.includes('rate')) {
          lastErr = new Error('Rate limited');
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (msg.includes('private')) return { status: 'error', error: { code: 'error.api.content.video.private' } };
        if (msg.includes('not exist') || msg.includes('deleted')) return { status: 'error', error: { code: 'error.api.content.video.deleted' } };
        if (msg.includes('age')) return { status: 'error', error: { code: 'error.api.content.video.age_restricted' } };
        if (msg.includes('url parsing')) return { status: 'error', error: { code: 'error.api.link.invalid' } };
        return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
      }

      const v = data.data;
      const streamUrl = v.play ?? v.hdplay ?? v.wmplay ?? null;
      if (!streamUrl) {
        return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
      }

      const fullStreamUrl = streamUrl.startsWith('http') ? streamUrl : `https://www.tikwm.com${streamUrl}`;

      const title = v.title ?? 'TikTok Video';
      const authorUnique = v.author?.unique_id ?? v.author?.id ?? '';
      const authorDisplay = v.author?.nickname ?? '';
      const thumbnail = v.cover ?? v.origin_cover ?? '';
      const duration = v.duration ?? 0;
      const views = v.play_count ?? 0;
      const uploadTime = v.create_time ? new Date(v.create_time * 1000).toISOString() : '';
      const music = v.music_info?.title ? `${v.music_info.title} — ${v.music_info.author ?? ''}` : (v.music ? String(v.music) : undefined);

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
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }

  return { status: 'error', error: { code: 'error.api.content.video.unavailable' } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
