/**
 * Daily refill = TOP-UP, never accumulation.
 *
 *   new_balance = max(current_balance, highest_eligible_daily_limit)
 *
 * - Applied at the 00:00 UTC boundary. The engine applies it lazily *before any spend*
 *   inside every wallet transaction (identical semantics to a cron run at 00:00), and a
 *   scheduled Worker may also sweep for audit purposes.
 * - Entitlements never stack: the highest eligible limit wins; team membership must not
 *   create a second wallet, so `eligibleLimits` carries at most one entry per wallet owner
 *   in practice (plan limit, any platform-granted limit override).
 */

export interface RefillInput {
  /** Current balance before the boundary. */
  currentBalance: number;
  /** All eligible daily limits (plan + platform overrides); stacking is not allowed. */
  eligibleLimits: number[];
  /** Whether the 00:00 UTC boundary has passed since the last refill. */
  boundaryPassed: boolean;
}

export interface RefillResult {
  balance: number;
  /** Whether a top-up actually changed the balance. */
  toppedUp: boolean;
  /** The effective daily limit applied (0 when no entitlement). */
  appliedLimit: number;
}

/** Highest eligible daily entitlement — multiple inputs are collapsed to one value. */
export function highestEligibleLimit(eligibleLimits: number[]): number {
  if (eligibleLimits.length === 0) return 0;
  return eligibleLimits.reduce((max, v) => (v > max ? v : max), 0);
}

/** Core top-up rule, also directly tested against the spec examples. */
export function applyDailyRefill(currentBalance: number, dailyLimit: number): number {
  if (
    currentBalance < 0 ||
    dailyLimit < 0 ||
    !Number.isFinite(currentBalance) ||
    !Number.isFinite(dailyLimit)
  ) {
    throw new RangeError('applyDailyRefill expects non-negative finite numbers');
  }
  return Math.max(currentBalance, dailyLimit);
}

/** Full refill decision for a wallet transaction. */
export function computeRefill(input: RefillInput): RefillResult {
  const limit = highestEligibleLimit(input.eligibleLimits);
  if (!input.boundaryPassed || limit === 0) {
    return { balance: input.currentBalance, toppedUp: false, appliedLimit: limit };
  }
  const balance = applyDailyRefill(input.currentBalance, limit);
  return { balance, toppedUp: balance > input.currentBalance, appliedLimit: limit };
}

/**
 * Next 00:00 UTC boundary after the given instant.
 * @param from defaults to now (ms epoch).
 */
export function nextUtcMidnight(from: number = Date.now()): Date {
  const d = new Date(from);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(next);
}

/** True when `lastRefillAt` is before the most recent 00:00 UTC boundary. */
export function boundaryPassed(lastRefillAtIso: string, now: number = Date.now()): boolean {
  const last = new Date(lastRefillAtIso);
  if (Number.isNaN(last.getTime())) throw new RangeError('invalid lastRefillAt timestamp');
  const lastMidnight = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const nowDate = new Date(now);
  const nowMidnight = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
  );
  return nowMidnight > lastMidnight;
}
