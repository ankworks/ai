import { describe, expect, it } from 'vitest';
import { redact, redactString, sha256Hex, REDACTED } from './redact';

describe('redact', () => {
  it('masks sensitive object keys recursively', () => {
    const input = {
      userId: 'u_1',
      password: 'hunter2',
      nested: { apiKey: 'abcd1234', keep: 'visible' },
      items: [{ sessionToken: 'sess_123' }],
    };
    const out = redact(input);
    expect(out).toEqual({
      userId: 'u_1',
      password: REDACTED,
      nested: { apiKey: REDACTED, keep: 'visible' },
      items: [{ sessionToken: REDACTED }],
    });
  });

  it('keeps allow-listed keys', () => {
    expect(redact({ apiKeyLast4: '1234', tokenUsage: 42 })).toEqual({
      apiKeyLast4: '1234',
      tokenUsage: 42,
    });
  });

  it('survives cycles', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
});

describe('redactString', () => {
  it('masks Bearer tokens', () => {
    expect(redactString('Authorization: Bearer abcdef1234567890')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
  });

  it('masks sk- style API keys', () => {
    expect(redactString('failed with key sk-abcdefghijklmnop')).toContain(REDACTED);
    expect(redactString('failed with key sk-abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
  });

  it('leaves ordinary text intact', () => {
    expect(redactString('user u_42 updated preferences')).toBe('user u_42 updated preferences');
  });
});

describe('sha256Hex', () => {
  it('is deterministic and 64 hex chars', async () => {
    const a = await sha256Hex('conai');
    const b = await sha256Hex('conai');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
