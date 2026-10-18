/**
 * Spark cost calculation — everything configurable from Admin → Sparks.
 *
 * Reference rule: 100 equivalent tokens = 1 Spark.
 *
 *   equivalent = input×inputWeight + output×outputWeight + vision×visionWeight
 *   sparks     = ceil(equivalent × modelMultiplier / tokensPerSpark)
 *              + searchOps×searchOpCost + researchOps×researchOpCost
 */

export interface SparkPricingConfig {
  /** Equivalent tokens per Spark (reference: 100). Minimum 1. */
  tokensPerSpark: number;
  /** Weight applied to input (prompt) tokens. */
  inputWeight: number;
  /** Weight applied to output (completion) tokens. */
  outputWeight: number;
  /** Weight applied to vision tokens. */
  visionWeight: number;
  /** Flat Spark cost per web-search operation. */
  searchOpCost: number;
  /** Flat Spark cost per deep-research operation unit. */
  researchOpCost: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  visionTokens?: number;
  searchOps?: number;
  researchOps?: number;
}

export interface PricingBreakdown {
  equivalentTokens: number;
  tokenSparks: number;
  searchSparks: number;
  researchSparks: number;
  totalSparks: number;
}

/** Spec reference config — admin can override every field at runtime. */
export const DEFAULT_PRICING: SparkPricingConfig = {
  tokensPerSpark: 100,
  inputWeight: 1,
  outputWeight: 1,
  visionWeight: 1.5,
  searchOpCost: 2,
  researchOpCost: 10,
};

export function normalizePricing(config: Partial<SparkPricingConfig>): SparkPricingConfig {
  const merged = { ...DEFAULT_PRICING, ...config };
  if (merged.tokensPerSpark < 1) throw new RangeError('tokensPerSpark must be >= 1');
  for (const [k, v] of Object.entries(merged)) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`${k} must be a non-negative number`);
  }
  return merged;
}

function assertCount(value: number | undefined, field: string): number {
  const v = value ?? 0;
  if (!Number.isInteger(v) || v < 0)
    throw new RangeError(`${field} must be a non-negative integer`);
  return v;
}

/**
 * Compute the Spark cost of one AI operation.
 * @param modelMultiplier admin-configured per-model multiplier (default 1).
 * @param minimumCharge smallest charge for a non-empty request (default 1 when usage > 0).
 */
export function computeUsageSparks(
  usage: TokenUsage,
  config: Partial<SparkPricingConfig> = {},
  modelMultiplier = 1,
  minimumCharge = 1,
): PricingBreakdown {
  const pricing = normalizePricing(config);
  if (!Number.isFinite(modelMultiplier) || modelMultiplier < 0) {
    throw new RangeError('modelMultiplier must be a non-negative number');
  }

  const inputTokens = assertCount(usage.inputTokens, 'inputTokens');
  const outputTokens = assertCount(usage.outputTokens, 'outputTokens');
  const visionTokens = assertCount(usage.visionTokens, 'visionTokens');
  const searchOps = assertCount(usage.searchOps, 'searchOps');
  const researchOps = assertCount(usage.researchOps, 'researchOps');

  const equivalentTokens =
    inputTokens * pricing.inputWeight +
    outputTokens * pricing.outputWeight +
    visionTokens * pricing.visionWeight;

  const tokenSparks = Math.ceil((equivalentTokens * modelMultiplier) / pricing.tokensPerSpark);
  const searchSparks = searchOps * pricing.searchOpCost;
  const researchSparks = researchOps * pricing.researchOpCost;
  const rawTotal = tokenSparks + searchSparks + researchSparks;

  const hasUsage = inputTokens + outputTokens + visionTokens + searchOps + researchOps > 0;
  const totalSparks = hasUsage ? Math.max(rawTotal, minimumCharge) : 0;

  return { equivalentTokens, tokenSparks, searchSparks, researchSparks, totalSparks };
}

/** Fraction of a Sparks budget consumed by a cost (0..1), for progress UIs. */
export function budgetUsageRatio(spent: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(1, Math.max(0, spent / budget));
}
