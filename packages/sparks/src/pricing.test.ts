import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, budgetUsageRatio, computeUsageSparks, normalizePricing } from './pricing';

describe('computeUsageSparks', () => {
  it('implements the reference 100 tokens = 1 Spark rule', () => {
    const r = computeUsageSparks({ inputTokens: 100, outputTokens: 0 });
    expect(r.totalSparks).toBe(1);
    expect(r.equivalentTokens).toBe(100);
  });

  it('rounds up per operation', () => {
    expect(computeUsageSparks({ inputTokens: 101, outputTokens: 0 }).totalSparks).toBe(2);
    expect(computeUsageSparks({ inputTokens: 1, outputTokens: 1 }).totalSparks).toBe(1);
  });

  it('combines input + output usage', () => {
    const r = computeUsageSparks({ inputTokens: 150, outputTokens: 250 });
    expect(r.equivalentTokens).toBe(400);
    expect(r.totalSparks).toBe(4);
  });

  it('applies weighted vision tokens', () => {
    const r = computeUsageSparks({ inputTokens: 0, outputTokens: 0, visionTokens: 100 });
    expect(r.equivalentTokens).toBe(150); // visionWeight 1.5
    expect(r.totalSparks).toBe(2);
  });

  it('applies model multipliers', () => {
    const r = computeUsageSparks({ inputTokens: 100, outputTokens: 0 }, {}, 2.5);
    expect(r.equivalentTokens).toBe(100);
    expect(r.totalSparks).toBe(3); // ceil(250/100)
  });

  it('charges flat search and deep-research operation costs', () => {
    const r = computeUsageSparks({ inputTokens: 0, outputTokens: 0, searchOps: 2, researchOps: 1 });
    expect(r.searchSparks).toBe(4); // 2 × 2
    expect(r.researchSparks).toBe(10); // 1 × 10
    expect(r.totalSparks).toBe(14);
  });

  it('charges nothing for empty usage', () => {
    const r = computeUsageSparks({ inputTokens: 0, outputTokens: 0 });
    expect(r.totalSparks).toBe(0);
  });

  it('respects custom admin pricing', () => {
    const r = computeUsageSparks(
      { inputTokens: 1000, outputTokens: 1000 },
      { tokensPerSpark: 200, inputWeight: 1, outputWeight: 2 },
    );
    // equivalent = 1000 + 2000 = 3000 → ceil(3000/200) = 15
    expect(r.totalSparks).toBe(15);
  });

  it('rejects invalid usage', () => {
    expect(() => computeUsageSparks({ inputTokens: -1, outputTokens: 0 })).toThrow(RangeError);
    expect(() => computeUsageSparks({ inputTokens: 1.5, outputTokens: 0 })).toThrow(RangeError);
    expect(() => computeUsageSparks({ inputTokens: 10, outputTokens: 0, searchOps: -2 })).toThrow(
      RangeError,
    );
  });
});

describe('normalizePricing', () => {
  it('merges with defaults and validates', () => {
    expect(normalizePricing({ tokensPerSpark: 50 })).toEqual({
      ...DEFAULT_PRICING,
      tokensPerSpark: 50,
    });
    expect(() => normalizePricing({ tokensPerSpark: 0 })).toThrow(RangeError);
    expect(() => normalizePricing({ inputWeight: -1 })).toThrow(RangeError);
  });
});

describe('budgetUsageRatio', () => {
  it('clamps between 0 and 1', () => {
    expect(budgetUsageRatio(50, 100)).toBe(0.5);
    expect(budgetUsageRatio(200, 100)).toBe(1);
    expect(budgetUsageRatio(-5, 100)).toBe(0);
    expect(budgetUsageRatio(5, 0)).toBe(0);
  });
});
