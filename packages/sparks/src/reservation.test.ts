import { describe, expect, it } from 'vitest';
import {
  InsufficientSparksError,
  assertSparks,
  computeHold,
  isValidRequestId,
  releaseReservation,
  settleReservation,
  walletAfterLifecycle,
} from './reservation';

describe('reservation lifecycle', () => {
  it('computes a hold within balance', () => {
    expect(computeHold(120, 500)).toBe(120);
    expect(computeHold(500, 500)).toBe(500);
  });

  it('refuses a hold above the balance', () => {
    expect(() => computeHold(501, 500)).toThrow(InsufficientSparksError);
  });

  it('settles under-use with a refund', () => {
    const s = settleReservation(100, 60);
    expect(s).toEqual({ charged: 60, refund: 40, extraCharge: 0 });
  });

  it('flags extra charge when actual exceeds the hold', () => {
    const s = settleReservation(100, 130);
    expect(s).toEqual({ charged: 130, refund: 0, extraCharge: 30 });
  });

  it('releases the full hold on failure', () => {
    expect(releaseReservation(75)).toEqual({ charged: 0, refund: 75, extraCharge: 0 });
  });

  it('keeps the wallet non-negative across the lifecycle', () => {
    // start 500 → hold 200 → actual 150 → refund 50 → ends 350
    expect(walletAfterLifecycle(500, 200, 150)).toBe(350);
    // full release path
    expect(walletAfterLifecycle(500, 200, 0)).toBe(500);
  });

  it('throws when the lifecycle would break non-negativity', () => {
    expect(() => walletAfterLifecycle(100, 200, 150)).toThrow(InsufficientSparksError);
  });
});

describe('guards', () => {
  it('assertSparks enforces non-negative integers', () => {
    expect(() => assertSparks(10, 'x')).not.toThrow();
    expect(() => assertSparks(-1, 'x')).toThrow(RangeError);
    expect(() => assertSparks(1.5, 'x')).toThrow(RangeError);
  });

  it('validates idempotent request ids (UUID shape)', () => {
    expect(isValidRequestId('4a5f0c9e-1b2d-4e8f-9a3b-7c6d5e4f3a2b')).toBe(true);
    expect(isValidRequestId('not-a-request-id')).toBe(false);
    expect(isValidRequestId('')).toBe(false);
  });
});
