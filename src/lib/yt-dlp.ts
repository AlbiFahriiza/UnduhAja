/**
 * yt-dlp wrapper — server-side utility.
 *
 * Spawns yt-dlp binary as child process, parses JSON output.
 * Falls back gracefully when binary is not available (dev mode).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const YTDLP_PATH = process.env.YTDLP_PATH ?? 'yt-dlp';

export interface YtdlpMetadata {
  platform: 'youtube' | 'tiktok';
  videoId: string;
  title: string;
  description: string;
  channel: string;
  channelVerified?: boolean;
  channelAvatar?: string;
  thumbnail: string;
  duration?: string;
  viewCount?: number;
  uploadDate?: string;
  sourceUrl: string;
  music?: string;
  embedUrl?: string;
  availableQualities?: string[];
  formats?: YtdlpFormat[];
}

export interface YtdlpFormat {
  formatId: string;
  ext: string;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  tbr?: number;
}

export class YtdlpError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'PRIVATE' | 'DELETED' | 'AGE_RESTRICTED' | 'LIVE' | 'UNSUPPORTED' | 'RATE_LIMITED' | 'UNKNOWN'
  ) {
    super(message);
  }
}

/**
 * Check if yt-dlp is available.
 */
export function isYtdlpAvailable(): boolean {
  if (existsSync(YTDLP_PATH)) return true;
  // Try path lookup
  try {
    const { execSync } = require('node:child_process');
    execSync(`which ${YTDLP_PATH}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract video metadata using yt-dlp.
 */
export async function extractMetadata(url: string): Promise<YtdlpMetadata> {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new YtdlpError('Unsupported URL', 'UNSUPPORTED');
  }

  // Reject playlists
  if (platform === 'youtube' && /[?&]list=/i.test(url)) {
    throw new YtdlpError('Playlists not supported', 'UNSUPPORTED');
  }

  // Detect live stream URLs
  if (platform === 'youtube' && /\/live\//i.test(url)) {
    throw new YtdlpError('Live streams not supported', 'LIVE');
  }

  if (!isYtdlpAvailable()) {
    // Dev mode: return mock data
    return getMockMetadata(url, platform);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--socket-timeout', '20',
      '--retries', '2',
      '--no-check-certificate',
      url,
    ];

    const proc = spawn(YTDLP_PATH, args, {
      timeout: 30000,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new YtdlpError(`Failed to spawn yt-dlp: ${err.message}`, 'UNKNOWN'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const error = parseYtdlpError(stderr);
        reject(error);
        return;
      }

      try {
        const json = JSON.parse(stdout);
        resolve(parseYtdlpOutput(json, url, platform));
      } catch (err) {
        reject(new YtdlpError(`Failed to parse yt-dlp output: ${err}`, 'UNKNOWN'));
      }
    });
  });
}

/**
 * Get download stream URL from yt-dlp.
 * Returns a URL that can be streamed to the client.
 */
export async function getDownloadStream(
  url: string,
  formatId: string,
  type: 'video' | 'audio'
): Promise<{ streamUrl: string; filename: string; filesize?: number }> {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new YtdlpError('Unsupported URL', 'UNSUPPORTED');
  }

  if (!isYtdlpAvailable()) {
    // Dev mode: return mock
    return {
      streamUrl: 'https://example.com/mock-video.mp4',
      filename: `unduhaja-mock.${type === 'audio' ? 'mp3' : 'mp4'}`,
    };
  }

  return new Promise((resolve, reject) => {
    const formatString = type === 'audio' ? 'bestaudio' : `best[height<=${formatId.replace(/\D/g, '')}]`;
    const args = [
      '-f', formatString,
      '--get-url',
      '--get-filename',
      '--no-warnings',
      '--no-playlist',
      '--socket-timeout', '20',
      url,
    ];

    const proc = spawn(YTDLP_PATH, args, {
      timeout: 30000,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new YtdlpError(`Failed to spawn yt-dlp: ${err.message}`, 'UNKNOWN'));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(parseYtdlpError(stderr));
        return;
      }

      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        reject(new YtdlpError('No stream URL returned', 'UNKNOWN'));
        return;
      }

      resolve({
        streamUrl: lines[0],
        filename: lines[1] || `unduhaja.${type === 'audio' ? 'mp3' : 'mp4'}`,
      });
    });
  });
}

// ============================================
// Helpers
// ============================================

function detectPlatform(url: string): 'youtube' | 'tiktok' | null {
  const ytPatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i,
    /^https?:\/\/youtu\.be\//i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
    /^https?:\/\/(www\.)?youtube\.com\/embed\//i,
  ];
  if (ytPatterns.some((p) => p.test(url))) return 'youtube';
  const ttPatterns = [
    /^https?:\/\/(www\.)?tiktok\.com\//i,
    /^https?:\/\/vm\.tiktok\.com\//i,
    /^https?:\/\/vt\.tiktok\.com\//i,
  ];
  if (ttPatterns.some((p) => p.test(url))) return 'tiktok';
  return null;
}

function parseYtdlpError(stderr: string): YtdlpError {
  const lower = stderr.toLowerCase();
  if (lower.includes('private')) return new YtdlpError('Video is private', 'PRIVATE');
  if (lower.includes('deleted') || lower.includes('not available')) {
    return new YtdlpError('Video has been deleted', 'DELETED');
  }
  if (lower.includes('age') && lower.includes('restricted')) {
    return new YtdlpError('Age restricted', 'AGE_RESTRICTED');
  }
  if (lower.includes('live') && lower.includes('stream')) {
    return new YtdlpError('Live stream not supported', 'LIVE');
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return new YtdlpError('Rate limited', 'RATE_LIMITED');
  }
  if (lower.includes('unsupported url')) {
    return new YtdlpError('Unsupported URL', 'UNSUPPORTED');
  }
  return new YtdlpError(stderr || 'Unknown error', 'UNKNOWN');
}

function parseYtdlpOutput(json: any, url: string, platform: 'youtube' | 'tiktok'): YtdlpMetadata {
  const uploadDate = json.upload_date
    ? `${json.upload_date.slice(0, 4)}-${json.upload_date.slice(4, 6)}-${json.upload_date.slice(6, 8)}`
    : undefined;

  const duration = json.duration
    ? formatDurationFromSeconds(json.duration)
    : undefined;

  // Extract available qualities from formats
  const availableQualities = extractAvailableQualities(json.formats ?? []);

  // TikTok music extraction
  let music: string | undefined;
  if (platform === 'tiktok' && json.track && json.artist) {
    music = `${json.track} — ${json.artist}`;
  } else if (platform === 'tiktok' && json.track) {
    music = json.track;
  }

  // YouTube embed URL
  const embedUrl = platform === 'youtube'
    ? `https://www.youtube.com/embed/${json.id}`
    : undefined;

  return {
    platform,
    videoId: json.id ?? '',
    title: json.title ?? '',
    description: json.description ?? '',
    channel: json.uploader ?? json.channel ?? '',
    channelVerified: json.uploader_verified === true,
    channelAvatar: json.channel_thumbnail ?? json.uploader_thumbnail,
    thumbnail: json.thumbnail ?? (json.thumbnails?.at(-1)?.url),
    duration,
    viewCount: json.view_count,
    uploadDate,
    sourceUrl: json.webpage_url ?? url,
    music,
    embedUrl,
    availableQualities,
    formats: json.formats?.map((f: any) => ({
      formatId: f.format_id,
      ext: f.ext,
      resolution: f.resolution,
      fps: f.fps,
      vcodec: f.vcodec,
      acodec: f.acodec,
      filesize: f.filesize,
      tbr: f.tbr,
    })),
  };
}

function formatDurationFromSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function extractAvailableQualities(formats: any[]): string[] {
  const qualities = new Set<string>();
  for (const f of formats) {
    if (f.height && f.fps) {
      const key = `${f.height}p${f.fps === 60 ? '60' : ''}`;
      qualities.add(key);
    } else if (f.height) {
      qualities.add(`${f.height}p`);
    }
  }
  // Sort by quality descending
  const order = ['1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
  return order.filter((q) => qualities.has(q));
}

// ============================================
// Mock data for dev mode
// ============================================
function getMockMetadata(url: string, platform: 'youtube' | 'tiktok'): YtdlpMetadata {
  if (platform === 'youtube') {
    return {
      platform: 'youtube',
      videoId: 'mock-yt-001',
      title: 'Sample YouTube Video — Mock Mode (yt-dlp not available)',
      description: 'This is mock metadata for development. Install yt-dlp to enable real extraction.\n\nThe video description would appear here in production.',
      channel: 'UnduhAja Demo',
      channelVerified: true,
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1280&h=720&fit=crop',
      duration: '12:34',
      viewCount: 1_234_567,
      uploadDate: '2025-01-15',
      sourceUrl: url,
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      availableQualities: ['1080p60', '1080p', '720p', '480p', '360p'],
    };
  }
  return {
    platform: 'tiktok',
    videoId: 'mock-tt-001',
    title: 'Sample TikTok — Mock Mode (yt-dlp not available)',
    description: 'This is mock metadata for development. Install yt-dlp to enable real extraction.',
    channel: '@unduhaja.demo',
    channelVerified: false,
    thumbnail: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=720&h=1280&fit=crop',
    duration: '0:58',
    viewCount: 98_765,
    uploadDate: '2025-01-20',
    sourceUrl: url,
    music: 'Original Sound — UnduhAja Demo',
    availableQualities: ['1080p', '720p', '480p'],
  };
}
