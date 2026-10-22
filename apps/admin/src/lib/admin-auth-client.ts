/**
 * better-auth browser client for the ADMIN plane (Phase 6).
 *
 * Separate from any user-plane client: basePath `/api/admin-auth` and the
 * `conai_admin` cookie namespace. The twoFactorClient plugin exposes
 * `twoFactor.enable` / `twoFactor.verifyTotp` for the mandatory MFA flow.
 */

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';
import { publicEnv } from '../env';

function adminAuthConfig(): { baseURL?: string; basePath: string } {
  const raw = publicEnv.VITE_API_BASE_URL.replace(/\/$/, '') || '/api';
  if (/^https?:\/\//.test(raw)) {
    const url = new URL(raw);
    const prefix = url.pathname.replace(/\/$/, '');
    return { baseURL: url.origin, basePath: `${prefix}/admin-auth` };
  }
  return { basePath: `${raw}/admin-auth` };
}

export const adminAuth = createAuthClient({
  ...adminAuthConfig(),
  fetchOptions: { credentials: 'include' },
  plugins: [twoFactorClient()],
});

export type AdminAuthClientError = { code?: string; message?: string; status?: number };
