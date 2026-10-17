import { describe, expect, it } from 'vitest';
import { BUCKETS, DEFAULT_UPLOAD_LIMITS, canUpload, validateUploadCounts } from './index';

describe('storage contracts', () => {
  it('maps every scope to a distinct private bucket', () => {
    const names = Object.values(BUCKETS);
    expect(new Set(names).size).toBe(names.length);
    expect(BUCKETS.verification).toBe('conai-verification');
  });

  it('enforces spec upload counts (2 images / 2 documents)', () => {
    const limits = { maxImagesPerMessage: 2, maxDocumentsPerMessage: 2 };
    expect(validateUploadCounts(2, 2, limits).ok).toBe(true);
    expect(validateUploadCounts(3, 0, limits).ok).toBe(false);
    expect(validateUploadCounts(0, 3, limits).ok).toBe(false);
  });

  it('default limits match the product spec', () => {
    expect(DEFAULT_UPLOAD_LIMITS).toEqual({
      maxImagesPerMessage: 2,
      maxDocumentsPerMessage: 2,
      maxPdfPages: 50,
      maxImageMb: 10,
      maxDocumentMb: 20,
    });
  });

  it('quota check rejects over-limit uploads', () => {
    expect(canUpload({ limitBytes: 1000, usedBytes: 900 }, 100)).toBe(true);
    expect(canUpload({ limitBytes: 1000, usedBytes: 900 }, 101)).toBe(false);
    expect(canUpload({ limitBytes: 0, usedBytes: 0 }, 1)).toBe(false);
  });
});
