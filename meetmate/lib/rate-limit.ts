/**
 * lib/rate-limit.ts
 *
 * Simple in-memory rate limiter for per-user rate limiting.
 * Default: 120 requests / minute per user.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < 60000);
      if (record.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Checks if a given identifier (e.g. userId) has exceeded the rate limit.
 *
 * @param key - User ID or IP to rate limit
 * @param limit - Maximum allowed requests in the window (default: 120)
 * @param windowMs - Time window in milliseconds (default: 60,000ms / 1 min)
 * @returns { allowed: boolean; count: number; remaining: number; resetMs: number }
 */
export function checkRateLimit(
  key: string,
  limit = 120,
  windowMs = 60000
): {
  allowed: boolean;
  count: number;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filter out timestamps outside the rolling window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      allowed: false,
      count: record.timestamps.length,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);

  return {
    allowed: true,
    count: record.timestamps.length,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Helper to reset rate limits (useful in tests)
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}
