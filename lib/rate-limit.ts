import "server-only";

export type RateLimitWindow = { limit: number; windowMs: number };
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * In-memory sliding-window rate limiter (PRD §64).
 *
 * Zero-cost and dependency-free. Correct for single-instance deployments
 * (dev, single-container prod). Multi-instance deployments need a shared
 * store (Redis/Upstash) — explicitly LATER with subscriptions, not MVP.
 */
export function checkRateLimit(key: string, window: RateLimitWindow): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + window.windowMs });
    if (buckets.size % 1000 === 0) pruneBuckets(now);
    return { ok: true };
  }

  if (bucket.count >= window.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { ok: true };
}

function pruneBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Best-effort client IP for rate-limit keys (proxy/CDN aware). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

export function rateLimitError(retryAfterSec: number): string {
  return `Too many attempts. Try again in ${retryAfterSec}s.`;
}
