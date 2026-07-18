/**
 * Rate limiting — Upstash Redis (free 10k req/day).
 * Falls back to in-memory counter when Redis is not configured (dev mode).
 *
 * Limits:
 *   - Guest (no auth): 5 downloads/hour per IP
 *   - Authenticated: 50 downloads/hour per user
 *   - Extract (metadata) endpoint: 20 requests/hour per IP (guest) / 100 (auth)
 */
import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

// In-memory fallback
const memoryStore = new Map<string, { count: number; expires: number }>();

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp ms
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const reset = now + windowSeconds * 1000;

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      const remaining = Math.max(0, limit - count);
      return {
        success: count <= limit,
        limit,
        remaining,
        reset,
      };
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const existing = memoryStore.get(key);
  if (existing && existing.expires > now) {
    existing.count += 1;
    const remaining = Math.max(0, limit - existing.count);
    return {
      success: existing.count <= limit,
      limit,
      remaining,
      reset: existing.expires,
    };
  }

  memoryStore.set(key, { count: 1, expires: reset });
  return {
    success: true,
    limit,
    remaining: limit - 1,
    reset,
  };
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;
  return 'unknown';
}

export const RATE_LIMITS = {
  guestDownload: 5,
  userDownload: 50,
  guestExtract: 20,
  userExtract: 100,
} as const;
