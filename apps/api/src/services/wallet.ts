/**
 * Sparks wallet persistence (spec §7): reserve → settle → refund on D1.
 *
 * Correctness rules:
 *  - never trust client balances — everything is re-read server-side;
 *  - guarded UPDATE ... RETURNING with optimistic `version` (no negative balance);
 *  - idempotency via the append-only ledger's UNIQUE `request_id`
 *    (`<uuid>` for the reservation, `settle:<uuid>` / `release:<uuid>` after);
 *  - a UNIQUE conflict after a successful UPDATE means the same request raced —
 *    the extra deduction is compensated immediately (net effect: one charge).
 *  - math comes from @conai/sparks (unit-tested); this file only persists it.
 */

import {
  InsufficientSparksError,
  computeHold,
  releaseReservation,
  settleReservation,
} from '@conai/sparks';
import type { SparkTransactionType } from '@conai/database';

export interface WalletState {
  balance: number;
  version: number;
  lastRefillAt: string;
}

export interface ReserveInput {
  userId: string;
  /** Client- or server-generated UUIDv4 — the idempotency key. */
  requestId: string;
  hold: number;
  description?: string;
  meta?: Record<string, unknown>;
}

export interface ReserveResult {
  kind: 'reserved' | 'replay';
  hold: number;
  balanceAfter: number;
  reservationId: string;
}

export interface SettleInput {
  userId: string;
  requestId: string;
  hold: number;
  actualSparks: number;
  description?: string;
  meta?: Record<string, unknown>;
}

export interface SettleResult {
  kind: 'settled' | 'replay';
  charged: number;
  refund: number;
  /** Sparks forgiven because extra usage exceeded the hold AND the balance (capped). */
  forgiven: number;
  balanceAfter: number;
}

function isLedgerDuplicate(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('UNIQUE constraint failed') ||
      error.message.includes('sqliteError') ||
      /unique/i.test(error.message))
  );
}

export async function getWallet(db: D1Database, userId: string): Promise<WalletState | null> {
  const row = await db
    .prepare('SELECT balance, version, last_refill_at FROM spark_wallets WHERE user_id = ?')
    .bind(userId)
    .first<{ balance: number; version: number; last_refill_at: string }>();
  if (!row) return null;
  return { balance: row.balance, version: row.version, lastRefillAt: row.last_refill_at };
}

async function findLedgerRow(
  db: D1Database,
  requestIdKey: string,
): Promise<{ id: string; meta: string; amount: number } | null> {
  const row = await db
    .prepare('SELECT id, amount, meta FROM spark_transactions WHERE request_id = ?')
    .bind(requestIdKey)
    .first<{ id: string; amount: number; meta: string }>();
  return row ?? null;
}

async function insertLedger(
  db: D1Database,
  entry: {
    id: string;
    userId: string;
    type: SparkTransactionType;
    amount: number;
    balanceAfter: number;
    requestIdKey: string | null;
    description: string;
    meta: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO spark_transactions (id, user_id, type, amount, balance_after, request_id, description, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.userId,
      entry.type,
      entry.amount,
      entry.balanceAfter,
      entry.requestIdKey,
      entry.description,
      JSON.stringify(entry.meta),
    )
    .run();
}

/** Undo a deduction performed by THIS attempt (same-request idempotency race). */
async function compensateDebit(db: D1Database, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE spark_wallets SET balance = balance + ?, version = version + 1, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(amount, now, userId)
    .run();
}

/** Reverse a credit performed by THIS attempt (same-request settle race). */
async function compensateCredit(db: D1Database, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE spark_wallets SET balance = MAX(balance - ?, 0), version = version + 1, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(amount, now, userId)
    .run();
}

const VERSION_RETRIES = 4;

/**
 * Hold `hold` sparks for `requestId` (idempotent).
 * @throws InsufficientSparksError when the balance cannot cover the hold.
 */
export async function reserveSparks(db: D1Database, input: ReserveInput): Promise<ReserveResult> {
  const hold = input.hold;
  if (!Number.isInteger(hold) || hold < 0)
    throw new RangeError('hold must be a non-negative integer');
  const now = new Date().toISOString();

  const existing = await findLedgerRow(db, input.requestId);
  if (existing) {
    let replayHold = hold;
    try {
      const meta = JSON.parse(existing.meta) as { hold?: number };
      if (typeof meta.hold === 'number') replayHold = meta.hold;
    } catch {
      /* keep caller's value */
    }
    const wallet = await getWallet(db, input.userId);
    return {
      kind: 'replay',
      hold: replayHold,
      balanceAfter: wallet?.balance ?? 0,
      reservationId: existing.id,
    };
  }

  for (let attempt = 0; attempt < VERSION_RETRIES; attempt++) {
    const wallet = await getWallet(db, input.userId);
    if (!wallet) throw new InsufficientSparksError(hold, 0);
    computeHold(hold, wallet.balance); // throws InsufficientSparksError

    const updated = await db
      .prepare(
        `UPDATE spark_wallets
           SET balance = balance - ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND version = ? AND balance >= ?
         RETURNING balance`,
      )
      .bind(hold, now, input.userId, wallet.version, hold)
      .first<{ balance: number }>();
    if (!updated) continue; // optimistic concurrency — re-read and retry

    const reservationId = crypto.randomUUID();
    try {
      await insertLedger(db, {
        id: reservationId,
        userId: input.userId,
        type: 'reservation',
        amount: -hold,
        balanceAfter: updated.balance,
        requestIdKey: input.requestId,
        description: input.description ?? 'ai reservation',
        meta: { ...(input.meta ?? {}), hold },
      });
    } catch (error) {
      if (isLedgerDuplicate(error)) {
        // Same requestId raced through another attempt — undo our deduction.
        await compensateDebit(db, input.userId, hold);
        const winner = await findLedgerRow(db, input.requestId);
        const walletNow = await getWallet(db, input.userId);
        if (winner) {
          let winnerHold = hold;
          try {
            const meta = JSON.parse(winner.meta) as { hold?: number };
            if (typeof meta.hold === 'number') winnerHold = meta.hold;
          } catch {
            /* ignore */
          }
          return {
            kind: 'replay',
            hold: winnerHold,
            balanceAfter: walletNow?.balance ?? 0,
            reservationId: winner.id,
          };
        }
        continue; // winner vanished (shouldn't happen) → retry whole cycle
      }
      throw error;
    }

    return {
      kind: 'reserved',
      hold,
      balanceAfter: updated.balance,
      reservationId,
    };
  }

  throw new Error('wallet contention — please retry');
}

/**
 * Settle a hold against actual usage (idempotent on `settle:<requestId>`).
 * When actual exceeds the hold, the extra is capped by the available balance —
 * the remainder is recorded as forgiven (never drive the wallet negative).
 */
export async function settleSparks(db: D1Database, input: SettleInput): Promise<SettleResult> {
  const settleKey = `settle:${input.requestId}`;
  const settle = settleReservation(input.hold, input.actualSparks);
  const now = new Date().toISOString();

  const existing = await findLedgerRow(db, settleKey);
  if (existing) {
    const wallet = await getWallet(db, input.userId);
    return {
      kind: 'replay',
      charged: input.actualSparks,
      refund: 0,
      forgiven: 0,
      balanceAfter: wallet?.balance ?? 0,
    };
  }

  for (let attempt = 0; attempt < VERSION_RETRIES; attempt++) {
    const wallet = await getWallet(db, input.userId);
    if (!wallet) throw new Error('wallet missing at settlement');

    let credit = settle.refund; // hold - actual (>= 0)
    let debit = settle.extraCharge; // actual - hold (> 0)
    let forgiven = 0;
    if (debit > 0) {
      const capped = Math.min(debit, wallet.balance);
      forgiven = debit - capped;
      debit = capped;
      credit = 0;
    }
    const delta = credit - debit;
    const postBalance = wallet.balance + delta;
    if (postBalance < 0) throw new Error('settlement would go negative');

    const updated = await db
      .prepare(
        `UPDATE spark_wallets
           SET balance = balance + ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND version = ? AND balance >= ?
         RETURNING balance`,
      )
      .bind(delta, now, input.userId, wallet.version, debit)
      .first<{ balance: number }>();
    if (!updated) continue;

    try {
      await insertLedger(db, {
        id: crypto.randomUUID(),
        userId: input.userId,
        type: 'settlement',
        amount: delta,
        balanceAfter: updated.balance,
        requestIdKey: settleKey,
        description: input.description ?? 'ai settlement',
        meta: {
          ...(input.meta ?? {}),
          hold: input.hold,
          actual: input.actualSparks,
          charged: input.actualSparks - forgiven,
          refund: credit,
          forgiven,
        },
      });
    } catch (error) {
      if (isLedgerDuplicate(error)) {
        if (credit > 0) await compensateCredit(db, input.userId, credit);
        else if (debit > 0) await compensateDebit(db, input.userId, debit);
        const walletNow = await getWallet(db, input.userId);
        return {
          kind: 'replay',
          charged: input.actualSparks,
          refund: 0,
          forgiven: 0,
          balanceAfter: walletNow?.balance ?? 0,
        };
      }
      throw error;
    }

    return {
      kind: 'settled',
      charged: input.actualSparks - forgiven,
      refund: credit,
      forgiven,
      balanceAfter: updated.balance,
    };
  }

  throw new Error('wallet contention during settlement — please retry');
}

/**
 * Full refund of a hold when the request failed before/during streaming
 * (idempotent on `release:<requestId>`).
 */
export async function releaseSparks(
  db: D1Database,
  input: {
    userId: string;
    requestId: string;
    hold: number;
    description?: string;
    meta?: Record<string, unknown>;
  },
): Promise<{ kind: 'released' | 'replay'; refund: number; balanceAfter: number }> {
  const releaseKey = `release:${input.requestId}`;
  const release = releaseReservation(input.hold);
  const now = new Date().toISOString();

  const existing = await findLedgerRow(db, releaseKey);
  if (existing) {
    const wallet = await getWallet(db, input.userId);
    return { kind: 'replay', refund: 0, balanceAfter: wallet?.balance ?? 0 };
  }

  for (let attempt = 0; attempt < VERSION_RETRIES; attempt++) {
    const wallet = await getWallet(db, input.userId);
    if (!wallet) throw new Error('wallet missing at release');

    const refund = release.refund;
    const updated = await db
      .prepare(
        `UPDATE spark_wallets
           SET balance = balance + ?, version = version + 1, updated_at = ?
         WHERE user_id = ? AND version = ?
         RETURNING balance`,
      )
      .bind(refund, now, input.userId, wallet.version)
      .first<{ balance: number }>();
    if (!updated) continue;

    try {
      await insertLedger(db, {
        id: crypto.randomUUID(),
        userId: input.userId,
        type: 'release',
        amount: refund,
        balanceAfter: updated.balance,
        requestIdKey: releaseKey,
        description: input.description ?? 'ai reservation released',
        meta: { ...(input.meta ?? {}), hold: input.hold },
      });
    } catch (error) {
      if (isLedgerDuplicate(error)) {
        await compensateCredit(db, input.userId, refund);
        const walletNow = await getWallet(db, input.userId);
        return { kind: 'replay', refund: 0, balanceAfter: walletNow?.balance ?? 0 };
      }
      throw error;
    }

    return { kind: 'released', refund, balanceAfter: updated.balance };
  }

  throw new Error('wallet contention during release — please retry');
}
