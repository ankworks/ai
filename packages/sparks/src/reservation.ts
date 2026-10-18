/**
 * Reservation → settlement → refund math (pure).
 *
 * The atomic D1 operations that persist these transitions arrive in Phase 3; the arithmetic
 * and invariants are fixed now and unit-tested so the wallet layer only has to persist them:
 *
 *   1. reserve:  balance -= hold            (ledger: reservation, request_id UNIQUE)
 *   2. settle:   refund = max(0, hold - actual); charged = actual
 *                if actual > hold → extra = actual - hold must be available (or fail-safe cap)
 *   3. release:  full refund of hold on failed/cancelled requests (ledger: release)
 */

export interface ReservationState {
  hold: number;
  settled: boolean;
}

export interface SettlementResult {
  /** Sparks actually charged for the operation. */
  charged: number;
  /** Sparks returned to the wallet from the hold. */
  refund: number;
  /** Positive when actual exceeded the hold — must be deducted from balance if possible. */
  extraCharge: number;
}

export function assertSparks(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer (got ${String(value)})`);
  }
}

/** Initial hold: never less than the estimate, capped by the caller's available balance. */
export function computeHold(estimatedCost: number, balance: number): number {
  assertSparks(estimatedCost, 'estimatedCost');
  assertSparks(balance, 'balance');
  if (estimatedCost > balance) {
    throw new InsufficientSparksError(estimatedCost, balance);
  }
  return estimatedCost;
}

/** Settle a hold against the actual measured cost. */
export function settleReservation(hold: number, actualCost: number): SettlementResult {
  assertSparks(hold, 'hold');
  assertSparks(actualCost, 'actualCost');
  const charged = actualCost;
  const refund = Math.max(0, hold - charged);
  const extraCharge = Math.max(0, charged - hold);
  return { charged, refund, extraCharge };
}

/** Full release for failed/cancelled requests. */
export function releaseReservation(hold: number): SettlementResult {
  assertSparks(hold, 'hold');
  return { charged: 0, refund: hold, extraCharge: 0 };
}

/**
 * Wallet effect of a full lifecycle, assuming no extraCharge (extra is capped by balance).
 * Returns the resulting balance or throws if the ledger would break non-negativity.
 */
export function walletAfterLifecycle(
  startBalance: number,
  hold: number,
  actualCost: number,
): number {
  assertSparks(startBalance, 'startBalance');
  const settle = settleReservation(hold, actualCost);
  const afterHold = startBalance - hold;
  if (afterHold < 0) throw new InsufficientSparksError(hold, startBalance);
  const result = afterHold - settle.extraCharge + settle.refund;
  if (result < 0) throw new InsufficientSparksError(actualCost, startBalance);
  return result;
}

export class InsufficientSparksError extends Error {
  readonly code = 'insufficient_sparks';
  constructor(required: number, available: number) {
    super(`Insufficient Sparks: requires ${required}, available ${available}`);
    this.name = 'InsufficientSparksError';
  }
}

/** Idempotency key format used for reservation request ids (client-generated UUIDv4). */
export function isValidRequestId(requestId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestId,
  );
}
