import { describe, expect, it } from 'vitest';
import { checkRateLimit, ipToPrefix, rateLimitKey, type RateLimitKV } from './rate-limit';

function fakeKv() {
  const store = new Map<string, string>();
  let writes = 0;
  const kv: RateLimitKV = {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      writes += 1;
      store.set(key, value);
    },
  };
  return {
    kv,
    store,
    get writes() {
      return writes;
    },
  };
}

describe('ipToPrefix', () => {
  it('coarsens IPv4 to a /24-style prefix', () => {
    expect(ipToPrefix('203.0.113.42')).toBe('203.0.113.x');
    expect(ipToPrefix('8.8.8.8')).toBe('8.8.8.x');
  });

  it('coarsens IPv6 to a /64-style prefix', () => {
    expect(ipToPrefix('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd:1234:x');
  });

  it('handles missing/odd input', () => {
    expect(ipToPrefix(null)).toBe('unknown');
    expect(ipToPrefix(undefined)).toBe('unknown');
    expect(ipToPrefix('garbage')).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  const rule = { bucket: 'sign-in', max: 3, windowSec: 60 };

  it('allows up to max attempts and denies beyond it', async () => {
    const { kv } = fakeKv();
    const now = 1_000_000_000_000;

    const a = await checkRateLimit(kv, rule, '203.0.113.x', now);
    const b = await checkRateLimit(kv, rule, '203.0.113.x', now);
    const c = await checkRateLimit(kv, rule, '203.0.113.x', now);
    const d = await checkRateLimit(kv, rule, '203.0.113.x', now);

    expect([a.allowed, b.allowed, c.allowed, d.allowed]).toEqual([true, true, true, false]);
    expect(d.retryAfterSec).toBeGreaterThan(0);
    expect(d.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('does NOT write to KV for denied attempts (write-amplification guard)', async () => {
    const f = fakeKv();
    const now = 1_000_000_000_000;
    for (let i = 0; i < rule.max; i++) await checkRateLimit(f.kv, rule, 'x', now);
    const writesAfterAllowed = f.writes;
    await checkRateLimit(f.kv, rule, 'x', now);
    await checkRateLimit(f.kv, rule, 'x', now);
    expect(f.writes).toBe(writesAfterAllowed);
  });

  it('keeps buckets independent per IP prefix', async () => {
    const { kv } = fakeKv();
    const now = 1_000_000_000_000;
    await checkRateLimit(kv, rule, 'a.x', now);
    await checkRateLimit(kv, rule, 'a.x', now);
    const other = await checkRateLimit(kv, rule, 'b.x', now);
    expect(other.allowed).toBe(true);
  });

  it('resets after the window expires', async () => {
    const { kv } = fakeKv();
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < rule.max; i++) await checkRateLimit(kv, rule, 'c.x', t0);
    const denied = await checkRateLimit(kv, rule, 'c.x', t0);
    expect(denied.allowed).toBe(false);

    const later = t0 + (rule.windowSec + 1) * 1000;
    const fresh = await checkRateLimit(kv, rule, 'c.x', later);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(rule.max - 1);
  });

  it('treats corrupt stored payloads as a fresh window', async () => {
    const f = fakeKv();
    const key = rateLimitKey(rule.bucket, 'd.x');
    await f.kv.put(key, 'not-json{');
    const res = await checkRateLimit(f.kv, rule, 'd.x', 1_000_000_000_000);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(rule.max - 1);
  });
});
