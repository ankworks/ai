/**
 * Username rules — server authority lives in better-auth's username plugin config below;
 * this module holds the shared format rule used by validation and tests.
 *
 * Format (spec: @username): 3–30 chars, alphanumeric + underscore/dot, must start and end
 * with an alphanumeric character, normalized to lowercase.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Conservative canonical format for ConAI usernames. */
export function isValidUsername(username: string): boolean {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return false;
  if (!/^[a-zA-Z0-9]+$/.test(username[0] ?? '')) return false;
  if (!/^[a-zA-Z0-9]+$/.test(username[username.length - 1] ?? '')) return false;
  return /^[a-zA-Z0-9_.]+$/.test(username);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Deterministic-format placeholder for OAuth sign-ups (no username chosen yet):
 * `user_xxxxxxx`. Uniqueness is enforced by the DB unique index with retries.
 */
export function generatedPlaceholderUsername(randomPart: string): string {
  return `user_${randomPart}`.slice(0, USERNAME_MAX);
}
