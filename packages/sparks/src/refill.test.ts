import { describe, expect, it } from 'vitest';
import {
  applyDailyRefill,
  boundaryPassed,
  computeRefill,
  highestEligibleLimit,
  nextUtcMidnight,
} from './refill';

describe('applyDailyRefill (TOP-UP rule)', () => {
  it('raises a below-limit balance to the limit (spec example 700/1000 → 1000)', () => {
    expect(applyDailyRefill(700, 1000)).toBe(1000);
  });

  it('keeps an above-limit balance intact (spec example 1200/1000 → 1200)', () => {
    expect(applyDailyRefill(1200, 1000)).toBe(1200);
  });

  it('is exactly max(current, limit)', () => {
    expect(applyDailyRefill(0, 500)).toBe(500);
    expect(applyDailyRefill(500, 500)).toBe(500);
    expect(applyDailyRefill(501, 500)).toBe(501);
  });

  it('does not accumulate across days when nothing was spent', () => {
    let balance = 1000;
    for (let day = 0; day < 5; day++) balance = applyDailyRefill(balance, 1000);
    expect(balance).toBe(1000); // never 5000
  });

  it('rejects negative or non-finite inputs', () => {
    expect(() => applyDailyRefill(-1, 1000)).toThrow(RangeError);
    expect(() => applyDailyRefill(100, -5)).toThrow(RangeError);
    expect(() => applyDailyRefill(Number.NaN, 100)).toThrow(RangeError);
  });
});

describe('highestEligibleLimit (no stacking)', () => {
  it('collapses multiple entitlements to the single highest limit', () => {
    expect(highestEligibleLimit([500, 700, 1000])).toBe(1000);
    expect(highestEligibleLimit([1000, 700])).toBe(1000);
  });

  it('returns 0 with no entitlements', () => {
    expect(highestEligibleLimit([])).toBe(0);
  });
});

describe('computeRefill', () => {
  it('tops up only after the UTC boundary passed', () => {
    const before = computeRefill({
      currentBalance: 700,
      eligibleLimits: [1000],
      boundaryPassed: false,
    });
    expect(before).toEqual({ balance: 700, toppedUp: false, appliedLimit: 1000 });

    const after = computeRefill({
      currentBalance: 700,
      eligibleLimits: [1000],
      boundaryPassed: true,
    });
    expect(after).toEqual({ balance: 1000, toppedUp: true, appliedLimit: 1000 });
  });

  it('reports toppedUp=false when balance already ≥ limit', () => {
    const r = computeRefill({ currentBalance: 1200, eligibleLimits: [1000], boundaryPassed: true });
    expect(r.balance).toBe(1200);
    expect(r.toppedUp).toBe(false);
  });

  it('applies the highest eligible limit without stacking', () => {
    const r = computeRefill({
      currentBalance: 100,
      eligibleLimits: [500, 700],
      boundaryPassed: true,
    });
    expect(r.balance).toBe(700);
    expect(r.appliedLimit).toBe(700);
  });
});

describe('boundary helpers', () => {
  it('nextUtcMidnight returns 00:00:00.000Z of the next UTC day', () => {
    const from = Date.parse('2026-10-17T23:59:59.999Z');
    expect(nextUtcMidnight(from).toISOString()).toBe('2026-10-18T00:00:00.000Z');
    const fromMorning = Date.parse('2026-10-17T00:00:00.001Z');
    expect(nextUtcMidnight(fromMorning).toISOString()).toBe('2026-10-18T00:00:00.000Z');
  });

  it('boundaryPassed detects a new UTC day', () => {
    const last = '2026-10-16T12:00:00.000Z';
    expect(boundaryPassed(last, Date.parse('2026-10-16T23:00:00.000Z'))).toBe(false);
    expect(boundaryPassed(last, Date.parse('2026-10-17T00:00:00.001Z'))).toBe(true);
  });
});
