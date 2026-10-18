import { describe, expect, it } from 'vitest';
import {
  CHARS_PER_TOKEN,
  DEFAULT_EXPECTED_OUTPUT_TOKENS,
  estimateRequestSparks,
  estimateTextTokens,
  usageFromEmittedText,
  usageFromProvider,
} from './estimate';

describe('estimateTextTokens', () => {
  it('uses the chars/4 heuristic with a floor of 1', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('ab')).toBe(1);
    expect(estimateTextTokens('a'.repeat(CHARS_PER_TOKEN * 3))).toBe(3);
  });
});

describe('estimateRequestSparks', () => {
  it('covers default output when the client did not send maxTokens', () => {
    const result = estimateRequestSparks({
      messages: [{ role: 'user', content: 'hello world' }],
      multiplier: 1,
    });
    expect(result.usage.outputTokens).toBe(DEFAULT_EXPECTED_OUTPUT_TOKENS);
    // (3 input + 600 output)/100 → ceil = 7
    expect(result.sparks).toBe(7);
  });

  it('honours an explicit expectedOutputTokens bound', () => {
    const result = estimateRequestSparks({
      messages: [{ role: 'user', content: 'x' }],
      multiplier: 1,
      expectedOutputTokens: 100,
    });
    expect(result.sparks).toBe(2); // (1 + 100)/100 → 2
  });

  it('applies the model multiplier (vision models cost more)', () => {
    const base = estimateRequestSparks({
      messages: [{ role: 'user', content: 'x' }],
      multiplier: 1,
      expectedOutputTokens: 400,
    });
    const multiplied = estimateRequestSparks({
      messages: [{ role: 'user', content: 'x' }],
      multiplier: 1.25,
      expectedOutputTokens: 400,
    });
    // ceil((1+400)/100)=5 → ceil(401*1.25/100)=6
    expect(base.sparks).toBe(5);
    expect(multiplied.sparks).toBe(6);
  });

  it('adds vision reserve for image parts', () => {
    const textOnly = estimateRequestSparks({
      messages: [{ role: 'user', content: 'x' }],
      multiplier: 1,
      expectedOutputTokens: 100,
    });
    const withImage = estimateRequestSparks({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'x' },
            { type: 'image', imageUrl: 'data:image/png;base64,AAA' },
          ],
        },
      ],
      multiplier: 1,
      expectedOutputTokens: 100,
    });
    expect(withImage.usage.visionTokens).toBeGreaterThan(0);
    expect(withImage.sparks).toBeGreaterThan(textOnly.sparks);
  });
});

describe('settlement usage helpers', () => {
  it('uses provider counts verbatim (clamped) when available', () => {
    expect(usageFromProvider(10, 5)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      visionTokens: 0,
    });
    expect(usageFromProvider(-3, 1.5)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      visionTokens: 0,
    });
  });

  it('falls back to emitted-text estimation mid-stream', () => {
    const usage = usageFromEmittedText('question', 'four words of output');
    expect(usage.inputTokens).toBe(estimateTextTokens('question'));
    expect(usage.outputTokens).toBe(estimateTextTokens('four words of output'));
    expect(usageFromEmittedText('q', '', 42).inputTokens).toBe(42);
    expect(usageFromEmittedText('q', '').outputTokens).toBe(0);
  });
});
