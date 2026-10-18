/**
 * Log redaction — guarantees passwords, API keys, session/CSRF tokens, OAuth codes and
 * other secrets never reach logs or audit rows (SECURITY.md §8/§9).
 * Used by the API logger and admin audit writer; covered by unit tests.
 */

const SENSITIVE_KEY_PATTERN =
  /(pass(word|phrase)?|secret|token|authorization|cookie|api[-_]?key|apikey|private|credential|otp|mfa|recovery|session_id|csrf|signature)/i;

/** Keys that are safe despite matching the sensitive pattern. */
const ALLOW_LIST = new Set(['tokenUsage', 'tokens_used', 'sessionCount', 'apiKeyLast4']);

export const REDACTED = '[redacted]';

/** Redact a value by key rules (shallow-deep recursive, cycle-safe). */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (ALLOW_LIST.has(key)) {
      out[key] = val;
    } else if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else if (typeof val === 'string') {
      out[key] = redactString(val);
    } else {
      out[key] = redact(val, depth + 1);
    }
  }
  return out as unknown as T;
}

/** Mask secrets that leak through free-text strings (Bearer tokens, key-shaped values). */
export function redactString(input: string): string {
  return input
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`)
    .replace(/\b(sk-[A-Za-z0-9]{8,})/g, REDACTED)
    .replace(/\b([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, REDACTED); // JWT-shaped
}

/** Hash identifiers for rate-limit keys: stable, non-reversible without the pepper. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
