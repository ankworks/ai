/**
 * Thin fetch wrapper for ConAI API routes (`/api/v1/*`) with double-submit CSRF
 * (cookie `conai_csrf` + `X-CSRF-Token`), same contract as the account app.
 */

import { publicEnv } from '../env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function apiBase(): string {
  return publicEnv.VITE_API_BASE_URL.replace(/\/$/, '') || '/api';
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((p) => p.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCookie('conai_csrf');
  if (existing) return existing;
  try {
    const res = await fetch(`${apiBase()}/v1/csrf`, { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? readCookie('conai_csrf');
  } catch {
    return null;
  }
}

export interface ApiFetchInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  json?: unknown;
  signal?: AbortSignal;
}

/** Parse an error response body into ApiError (ConAI envelope). */
export async function toApiError(res: Response): Promise<ApiError> {
  let code = 'unknown';
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    /* keep defaults */
  }
  return new ApiError(res.status, code, message);
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers();
  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  if (method !== 'GET') {
    const token = await ensureCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body,
    credentials: 'include',
    signal: init.signal,
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { apiBase };
