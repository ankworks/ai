/**
 * Thin fetch wrapper for ConAI-owned API routes (`/api/v1/*`) with
 * double-submit CSRF handling (cookie `conai_csrf` + `X-CSRF-Token` header).
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
  return (publicEnv.VITE_API_BASE_URL.replace(/\/$/, '') || '/api') as string;
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

  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'include', signal: init.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'Network error — is the API running?');
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'error',
      err?.message ?? `Request failed (${res.status})`,
    );
  }
  return parsed as T;
}

// ── Response DTOs (mirror apps/api/src/routes/me.ts) ────────────────────────

export interface MeUser {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayName: string;
  locale: 'en' | 'vi';
  planId: string;
  referralCode: string;
  avatarUrl: string | null;
}

export interface MeWallet {
  balance: number;
  dailyLimit: number;
  lastRefillAt: string | null;
  nextRefillAt: string;
}

export interface MeResponse {
  user: MeUser;
  wallet: MeWallet;
}

export interface PlanDto {
  id: string;
  name: string;
  priceLabel: string;
  dailySparks: number | null;
  personalStorageMb: number | null;
  teamStorageMb: number | null;
  maxTeamMembers: number | null;
  maxTeamsPerAccount: number | null;
  requiresVerification: boolean;
}

export interface SessionDto {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  isCurrent: boolean;
}

export interface LinkedAccountDto {
  id: string;
  providerId: string;
  accountIdMasked: string;
  linkedAt: string;
}
