/**
 * KV-backed fixed-window rate limiting.
 *
 * Designed for the Cloudflare KV free tier (≈1k writes/day):
 *  - writes happen only for ALLOWED attempts within a window — denied attempts are
 *    read-only, so an attacker cannot amplify KV writes;
 *  - coarse buckets (route class + IP prefix) keep key counts tiny;
 *  - IP alone never causes a permanent block (spec §5): limits are short windows only.
 */

export interface RateLimitKV {
  get(key: string, type?: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitRule {
  /** Bucket name, e.g. 'sign-in'. */
  bucket: string;
  /** Max allowed attempts per window. */
  max: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface CounterPayload {
  count: number;
  /** epoch seconds */
  resetAt: number;
}

export function rateLimitKey(bucket: string, ipPrefix: string): string {
  return `rl:${bucket}:${ipPrefix}`;
}

/** Coarse /24-style prefix for IPv4, /64-style for IPv6 (privacy-preserving). */
export function ipToPrefix(ip: string | null | undefined): string {
  if (!ip) return 'unknown';
  const trimmed = ip.trim();
  if (trimmed.includes(':')) {
    const groups = trimmed.split(':').slice(0, 4);
    return `${groups.join(':')}:x`;
  }
  const parts = trimmed.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return 'unknown';
}

/**
 * Check (and count) one attempt. Returns `allowed: false` with `retryAfterSec` once
 * the window's budget is spent; denied attempts do not write to KV.
 */
export async function checkRateLimit(
  kv: RateLimitKV,
  rule: RateLimitRule,
  ipPrefix: string,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const key = rateLimitKey(rule.bucket, ipPrefix);
  const nowSec = Math.floor(nowMs / 1000);

  const raw = await kv.get(key, 'text');
  let counter: CounterPayload | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as CounterPayload;
      if (typeof parsed.count === 'number' && typeof parsed.resetAt === 'number') {
        counter = parsed;
      }
    } catch {
      counter = null;
    }
  }

  const expired = !counter || counter.resetAt <= nowSec;
  const current: CounterPayload =
    expired || !counter ? { count: 0, resetAt: nowSec + rule.windowSec } : counter;

  if (current.count >= rule.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, current.resetAt - nowSec),
    };
  }

  const next: CounterPayload = { count: current.count + 1, resetAt: current.resetAt };
  await kv.put(key, JSON.stringify(next), {
    expirationTtl: Math.max(60, next.resetAt - nowSec),
  });

  return {
    allowed: true,
    remaining: Math.max(0, rule.max - next.count),
    retryAfterSec: 0,
  };
}
