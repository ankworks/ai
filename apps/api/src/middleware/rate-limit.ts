/**
 * KV-backed rate limiting (spec §5 + §10 — every user input path is limited).
 *
 * Buckets are coarse (route class + IP prefix) to stay inside the KV free-tier
 * write budget; denied attempts are READ-ONLY against KV so brute-force traffic
 * cannot amplify writes. IP-based denial is always a short window — never a
 * permanent block from IP alone.
 */

import { createMiddleware } from 'hono/factory';
import { checkRateLimit, ipToPrefix, type RateLimitKV, type RateLimitRule } from '@conai/auth';
import type { AppEnv } from '../env';
import { errorResponse, queueHeader } from './security';

interface Rule {
  prefix: string;
  rule: RateLimitRule;
  /** Apply to all methods (default) or only state-changing ones. */
  stateChangingOnly?: boolean;
}

const RULES: Rule[] = [
  { prefix: '/api/auth/sign-in', rule: { bucket: 'sign-in', max: 10, windowSec: 300 } },
  { prefix: '/api/auth/sign-up', rule: { bucket: 'sign-up', max: 5, windowSec: 900 } },
  { prefix: '/api/auth/forgot-password', rule: { bucket: 'forgot', max: 5, windowSec: 900 } },
  { prefix: '/api/auth/reset-password', rule: { bucket: 'reset', max: 5, windowSec: 900 } },
  {
    prefix: '/api/v1/me',
    rule: { bucket: 'me-write', max: 60, windowSec: 60 },
    stateChangingOnly: true,
  },
];

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
let warnedMissingKv = false;

export const rateLimitMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method.toUpperCase();
  const matched = RULES.find((r) => path.startsWith(r.prefix));
  if (!matched) return next();
  if (matched.stateChangingOnly && SAFE.has(method)) return next();

  if (!c.env.CACHE) {
    if (!warnedMissingKv) {
      warnedMissingKv = true;
      console.warn('[rate-limit] KV binding (CACHE) missing — rate limiting DISABLED');
    }
    return next();
  }

  const ip =
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const result = await checkRateLimit(
    c.env.CACHE as unknown as RateLimitKV,
    matched.rule,
    ipToPrefix(ip),
  );
  if (!result.allowed) {
    queueHeader(c, 'Retry-After', String(result.retryAfterSec));
    queueHeader(c, 'X-RateLimit-Remaining', '0');
    return errorResponse(
      'rate_limited',
      `Too many requests — retry in ${result.retryAfterSec}s`,
      429,
      c.get('requestId'),
    );
  }
  queueHeader(c, 'X-RateLimit-Remaining', String(result.remaining));
  return next();
});
