import { describe, expect, it } from 'vitest';
import {
  generatedPlaceholderUsername,
  isValidUsername,
  normalizeUsername,
  USERNAME_MAX,
  USERNAME_MIN,
} from './username';

describe('isValidUsername', () => {
  it('accepts the documented character set', () => {
    expect(isValidUsername('alice')).toBe(true);
    expect(isValidUsername('a.b_c1')).toBe(true);
    expect(isValidUsername('A'.repeat(USERNAME_MAX))).toBe(true);
    expect(isValidUsername('x'.repeat(USERNAME_MIN))).toBe(true);
  });

  it('rejects length violations', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('x'.repeat(USERNAME_MAX + 1))).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });

  it('rejects unsafe characters', () => {
    for (const bad of ['evil!', 'has space', '@alice', 'ends.', '.starts', "it's", 'a/b', 'đặng']) {
      expect(isValidUsername(bad)).toBe(false);
    }
  });
});

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Alice.Dev  ')).toBe('alice.dev');
  });
});

describe('generatedPlaceholderUsername', () => {
  it('always yields a valid, unique-looking username', () => {
    const a = generatedPlaceholderUsername('abc123');
    const b = generatedPlaceholderUsername('zzz999');
    expect(a).toBe('user_abc123');
    expect(b).toBe('user_zzz999');
    expect(isValidUsername(a)).toBe(true);
    expect(isValidUsername(b)).toBe(true);
    expect(a).not.toBe(b);
    expect(generatedPlaceholderUsername('x'.repeat(64)).length).toBeLessThanOrEqual(USERNAME_MAX);
  });
});
