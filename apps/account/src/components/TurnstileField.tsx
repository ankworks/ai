import { useCallback } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { publicEnv } from '../env';

/**
 * Cloudflare Turnstile widget — rendered only when the PUBLIC site key is
 * configured (VITE_TURNSTILE_SITE_KEY). The token travels to the API in the
 * `x-captcha-response` header (better-auth captcha plugin contract).
 *
 * Only one auth form is mounted at a time, so a single module-level holder is
 * enough to expose the latest token to the submitting form.
 */
const capturedToken: { value: string | null } = { value: null };

export function resetCaptchaToken(): void {
  capturedToken.value = null;
}

export function useCaptcha(): {
  enabled: boolean;
  getToken: () => string | null;
  reset: () => void;
  widget: React.ReactNode;
} {
  const siteKey = publicEnv.VITE_TURNSTILE_SITE_KEY;
  const refCallback = useCallback((instance: TurnstileInstance | null) => {
    captchaRef.current = instance;
  }, []);

  if (!siteKey) {
    return { enabled: false, getToken: () => null, reset: () => {}, widget: null };
  }

  return {
    enabled: true,
    getToken: () => capturedToken.value,
    reset: () => {
      capturedToken.value = null;
      captchaRef.current?.reset();
    },
    widget: (
      <Turnstile
        ref={refCallback}
        siteKey={siteKey}
        onSuccess={(token) => {
          capturedToken.value = token;
        }}
        onExpire={() => {
          capturedToken.value = null;
        }}
        onError={() => {
          capturedToken.value = null;
        }}
      />
    ),
  };
}

const captchaRef: { current: TurnstileInstance | null } = { current: null };
