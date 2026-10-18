import type { I18nKey } from '@conai/shared';
import type { TranslateFn } from '@conai/ui';

interface BetterAuthClientErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
}

const CODE_MAP: Record<string, I18nKey> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth.err.creds',
  EMAIL_NOT_VERIFIED: 'auth.err.notVerified',
  EMAIL_ALREADY_EXISTS: 'auth.err.emailTaken',
  USERNAME_IS_ALREADY_TAKEN: 'auth.err.usernameTaken',
  INVALID_USERNAME: 'auth.err.usernameInvalid',
  WEAK_PASSWORD: 'auth.err.weakPassword',
  PASSWORD_TOO_SHORT: 'auth.err.weakPassword',
  INVALID_CAPTCHA: 'auth.err.captcha',
  CAPTCHA_VERIFICATION_FAILED: 'auth.err.captcha',
  CAPTCHA_INVALID: 'auth.err.captcha',
  RATE_LIMIT: 'auth.err.rate',
  TOO_MANY_REQUESTS: 'auth.err.rate',
  UNKNOWN_ERROR: 'auth.err.network',
};

/**
 * Map better-auth error codes to localized copy; fall back to the server
 * message (it is safe to show — better-auth errors are user-facing) and then
 * to a generic localized message.
 */
export function authErrorMessage(
  error: BetterAuthClientErrorLike | null | undefined,
  t: TranslateFn,
): string {
  if (!error) return t('auth.err.generic');
  const mapped = error.code ? CODE_MAP[error.code] : undefined;
  if (mapped) return t(mapped);
  if (error.message && error.message !== 'Unknown error') return error.message;
  return t('auth.err.generic');
}
