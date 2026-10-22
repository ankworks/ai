/**
 * Typed fetch wrapper for admin REST routes (`/api/admin/*`).
 *
 * - same-origin in path mode; honors VITE_API_BASE_URL for subdomain mode;
 * - double-submit CSRF: mints `conai_csrf` once and echoes it on mutations;
 * - 401 surfaces a typed AdminApiError so the router can bounce to /signin.
 */

import { publicEnv } from '../env';

function apiPrefix(): string {
  const raw = publicEnv.VITE_API_BASE_URL.replace(/\/$/, '') || '/api';
  return raw.startsWith('http') ? raw : raw;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${apiPrefix()}/admin/csrf`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new AdminApiError(res.status, 'csrf_unavailable', 'Could not mint CSRF token');
  const body = (await res.json()) as { token: string };
  csrfToken = body.token;
  return csrfToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function adminFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();

  const res = await fetch(`${apiPrefix()}/admin${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AdminApiError(
      res.status,
      err?.code ?? 'request_failed',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}
