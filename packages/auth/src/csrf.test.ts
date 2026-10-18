import { describe, expect, it } from 'vitest';
import { checkCsrf, createCsrfCookie, csrfTokensMatch, isStateChanging } from './csrf';

describe('isStateChanging', () => {
  it('treats GET/HEAD/OPTIONS as safe', () => {
    expect(isStateChanging('GET')).toBe(false);
    expect(isStateChanging('head')).toBe(false);
    expect(isStateChanging('OPTIONS')).toBe(false);
    expect(isStateChanging('POST')).toBe(true);
    expect(isStateChanging('patch')).toBe(true);
    expect(isStateChanging('DELETE')).toBe(true);
  });
});

describe('checkCsrf', () => {
  const cookie = 'conai_csrf=abc-123; other=x';

  it('passes safe methods without any token', () => {
    expect(checkCsrf({ method: 'GET', cookieHeader: null, headerToken: null })).toEqual({
      ok: true,
    });
  });

  it('rejects state-changing requests without the cookie', () => {
    const res = checkCsrf({ method: 'POST', cookieHeader: 'session=1', headerToken: 'abc-123' });
    expect(res).toEqual({ ok: false, reason: 'missing_csrf_cookie' });
  });

  it('rejects missing header', () => {
    const res = checkCsrf({ method: 'POST', cookieHeader: cookie, headerToken: null });
    expect(res).toEqual({ ok: false, reason: 'missing_csrf_header' });
  });

  it('rejects mismatched tokens', () => {
    const res = checkCsrf({ method: 'POST', cookieHeader: cookie, headerToken: 'different' });
    expect(res).toEqual({ ok: false, reason: 'csrf_token_mismatch' });
  });

  it('accepts matching double-submit tokens', () => {
    expect(checkCsrf({ method: 'POST', cookieHeader: cookie, headerToken: 'abc-123' })).toEqual({
      ok: true,
    });
  });
});

describe('csrfTokensMatch', () => {
  it('never matches empty or different-length tokens', () => {
    expect(csrfTokensMatch('', '')).toBe(false);
    expect(csrfTokensMatch('abc', 'abcd')).toBe(false);
    expect(csrfTokensMatch('abc', 'abd')).toBe(false);
    expect(csrfTokensMatch('abc', 'abc')).toBe(true);
  });
});

describe('createCsrfCookie', () => {
  it('mints a UUID token with Lax attributes, Secure only in production', () => {
    const dev = createCsrfCookie(false);
    expect(dev.name).toBe('conai_csrf');
    expect(dev.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(dev.attributes).toContain('SameSite=Lax');
    expect(dev.attributes).not.toContain('Secure');

    const prod = createCsrfCookie(true);
    expect(prod.attributes).toContain('Secure');
  });
});
