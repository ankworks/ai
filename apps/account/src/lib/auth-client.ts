/**
 * better-auth browser client for the account app (Phase 2).
 *
 * Routing:
 *  - path mode (dev/prod): VITE_API_BASE_URL='/api' → same-origin '/api/auth/*' (Vite proxy / Worker).
 *  - subdomain mode: VITE_API_BASE_URL='https://api.conai.dpdns.org/api' → origin + '/api/auth/*'.
 * Credentials (session cookie) ride along every call.
 */

import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';
import { publicEnv } from '../env';

function authClientConfig(): { baseURL?: string; basePath: string } {
  const raw = publicEnv.VITE_API_BASE_URL.replace(/\/$/, '') || '/api';
  if (/^https?:\/\//.test(raw)) {
    const url = new URL(raw);
    const prefix = url.pathname.replace(/\/$/, '');
    return { baseURL: url.origin, basePath: `${prefix}/auth` };
  }
  return { basePath: `${raw}/auth` };
}

export const authClient = createAuthClient({
  ...authClientConfig(),
  fetchOptions: { credentials: 'include' },
  plugins: [usernameClient()],
});

export type AuthClientError = { code?: string; message?: string; status?: number };
