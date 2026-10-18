import { computeUsageSparks, type SparkPricingConfig, type TokenUsage } from '@conai/sparks';
import type { ChatMessage } from './index';

/**
 * Sparks estimation for reservations (spec §7 — reserve → settle → refund).
 *
 * Estimates are conservative (the hold covers the likely cost) and are always
 * replaced by REAL provider usage at settlement. Token counting uses the
 * standard chars/4 heuristic — exact BPE tokenization is provider-side.
 */

/** Average characters per token used for estimates (docs: ~4 chars/token). */
export const CHARS_PER_TOKEN = 4;

/** Default expected output when the client did not request a max. */
export const DEFAULT_EXPECTED_OUTPUT_TOKENS = 600;

/** Rough vision cost per image when the provider reports images inside prompt tokens. */
export const ESTIMATED_TOKENS_PER_IMAGE = 256;

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export interface EstimateInput {
  messages: ChatMessage[];
  pricing?: Partial<SparkPricingConfig>;
  multiplier: number;
  expectedOutputTokens?: number;
}

export interface EstimateResult {
  sparks: number;
  usage: TokenUsage;
}

export function estimateRequestSparks(input: EstimateInput): EstimateResult {
  let inputTokens = 0;
  let visionTokens = 0;
  for (const m of input.messages) {
    if (typeof m.content === 'string') {
      inputTokens += estimateTextTokens(m.content);
      continue;
    }
    for (const part of m.content) {
      if (part.type === 'text') inputTokens += estimateTextTokens(part.text ?? '');
      if (part.type === 'image' && part.imageUrl) visionTokens += ESTIMATED_TOKENS_PER_IMAGE;
    }
  }
  const outputTokens = Math.max(1, input.expectedOutputTokens ?? DEFAULT_EXPECTED_OUTPUT_TOKENS);
  const usage: TokenUsage = { inputTokens, outputTokens, visionTokens };
  const breakdown = computeUsageSparks(usage, input.pricing, input.multiplier);
  return { sparks: breakdown.totalSparks, usage };
}

/**
 * Settlement usage from provider-reported counts. Ollama's `prompt_eval_count`
 * includes image prefill for vision models, so visionTokens stays 0 here —
 * the estimate only covered the reservation.
 */
export function usageFromProvider(promptTokens: number, completionTokens: number): TokenUsage {
  const clamp = (v: number) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    inputTokens: clamp(promptTokens),
    outputTokens: clamp(completionTokens),
    visionTokens: 0,
  };
}

/** Fallback settlement when upstream died mid-stream: estimate from emitted text. */
export function usageFromEmittedText(
  inputText: string,
  outputText: string,
  providerPromptTokens?: number,
): TokenUsage {
  return {
    inputTokens:
      Number.isInteger(providerPromptTokens) && (providerPromptTokens ?? -1) >= 0
        ? (providerPromptTokens as number)
        : estimateTextTokens(inputText),
    outputTokens: outputText ? estimateTextTokens(outputText) : 0,
    visionTokens: 0,
  };
}
