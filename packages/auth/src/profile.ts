/**
 * Account shell bootstrap: every better-auth user gets
 *   1. a `user_profiles` row (username copy, plan, referral code)
 *   2. a `spark_wallets` row (ONE wallet per user — spec §7)
 * created right after user creation (databaseHooks) and self-healed on demand.
 *
 * All SQL here is parameterized against D1 (SECURITY.md §10).
 */

/** Rows from our own tables (0001_init.sql) — names are stable. */
interface ProfileInsertResult {
  success: boolean;
}

export interface AccountShell {
  id: string;
  username: string;
  displayName: string;
  locale: string;
  planId: string;
  referralCode: string;
}

const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusables

export function newReferralCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += REFERRAL_ALPHABET[bytes[i]! % REFERRAL_ALPHABET.length];
  return out;
}

function randomToken(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += (bytes[i]! % 36).toString(36);
  return out;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function isReferralCollision(error: unknown): boolean {
  return error instanceof Error && error.message.includes('user_profiles.referral_code');
}

function isExistingProfile(error: unknown): boolean {
  return error instanceof Error && error.message.includes('user_profiles.id');
}

/**
 * Create profile + wallet for a freshly created better-auth user.
 * `user` is the raw row better-auth inserted (username present for email+password
 * sign-ups; OAuth sign-ups receive a generated placeholder username).
 */
export async function createAccountShell(
  db: D1Database,
  user: Record<string, unknown>,
): Promise<void> {
  const id = asString(user.id);
  if (!id) throw new Error('createAccountShell: user.id missing');

  const username = asString(user.username) || `user_${randomToken(6)}`.slice(0, 30);
  const displayName = asString(user.name, username);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 4; attempt++) {
    const referralCode = newReferralCode();
    try {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO user_profiles (id, username, display_name, locale, plan_id, referral_code, created_at, updated_at)
             VALUES (?, ?, ?, 'en', 'personal', ?, ?, ?)`,
          )
          .bind(id, username, displayName, referralCode, now, now),
        db
          .prepare(
            `INSERT INTO spark_wallets (user_id, balance, last_refill_at, version, created_at, updated_at)
             VALUES (?, 0, ?, 0, ?, ?)`,
          )
          .bind(id, now, now, now),
      ]);
      const failed = results.find((r: unknown) => {
        const res = r as ProfileInsertResult & { error?: unknown };
        return res.error !== undefined && res.error !== null;
      });
      if (failed) {
        const err = (failed as { error?: { message?: string } }).error;
        throw new Error(err?.message ?? 'account shell insert failed');
      }
      return;
    } catch (error) {
      if (isReferralCollision(error) && attempt < 3) continue;
      if (isExistingProfile(error)) {
        // Self-heal race: profile already exists — ensure the wallet row exists too.
        await ensureWallet(db, id, now);
        return;
      }
      throw error;
    }
  }
}

async function ensureWallet(db: D1Database, userId: string, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO spark_wallets (user_id, balance, last_refill_at, version, created_at, updated_at)
       VALUES (?, 0, ?, 0, ?, ?)`,
    )
    .bind(userId, now, now, now)
    .run();
}

/**
 * Self-healing read: returns the account shell for a user id, creating profile/wallet
 * if a previous partial failure left them missing (e.g. hook failure during sign-up).
 * Returns null when the auth `user` row itself does not exist.
 */
export async function ensureAccountShell(
  db: D1Database,
  userId: string,
): Promise<AccountShell | null> {
  const profile = await db
    .prepare(
      `SELECT id, username, display_name, locale, plan_id, referral_code FROM user_profiles WHERE id = ?`,
    )
    .bind(userId)
    .first<Record<string, unknown>>();

  if (!profile) {
    // Read the auth row with SELECT * — resilient to better-auth column naming.
    const user = await db
      .prepare(`SELECT * FROM "user" WHERE id = ?`)
      .bind(userId)
      .first<Record<string, unknown>>();
    if (!user) return null;
    await createAccountShell(db, user);
    const retried = await db
      .prepare(
        `SELECT id, username, display_name, locale, plan_id, referral_code FROM user_profiles WHERE id = ?`,
      )
      .bind(userId)
      .first<Record<string, unknown>>();
    if (!retried) return null;
    return mapShell(retried);
  }

  await ensureWallet(db, userId, new Date().toISOString());
  return mapShell(profile);
}

function mapShell(row: Record<string, unknown>): AccountShell {
  return {
    id: asString(row.id),
    username: asString(row.username),
    displayName: asString(row.display_name),
    locale: asString(row.locale, 'en'),
    planId: asString(row.plan_id, 'personal'),
    referralCode: asString(row.referral_code),
  };
}
