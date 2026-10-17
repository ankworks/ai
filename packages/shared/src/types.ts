/** Cross-app DTO types shared by API and frontends (no server-only imports here). */

import type { Language } from './brand';

// ── Health / diagnostics ─────────────────────────────────────────────────────
export interface HealthCheck {
  name: string;
  status: 'ok' | 'degraded' | 'down' | 'not_configured';
  latencyMs?: number;
  detail?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  routingMode: 'subdomain' | 'path';
  uptimeSeconds: number;
  timestamp: string;
  checks: HealthCheck[];
}

// ── Status page ──────────────────────────────────────────────────────────────
export const STATUS_COMPONENT_IDS = [
  'ai_services',
  'authentication',
  'workspace',
  'teams',
  'database',
  'notifications',
] as const;
export type StatusComponentId = (typeof STATUS_COMPONENT_IDS)[number];

export const STATUS_STATES = [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'maintenance',
  'unknown',
] as const;
export type StatusState = (typeof STATUS_STATES)[number];

export interface StatusComponent {
  id: StatusComponentId;
  name: string;
  description: string;
  state: StatusState;
  lastCheckedAt: string | null;
}

export interface StatusIncident {
  id: string;
  title: string;
  state: StatusState;
  impact: 'none' | 'minor' | 'major' | 'critical';
  startedAt: string;
  resolvedAt: string | null;
  updates: Array<{
    body: string;
    state: StatusState;
    createdAt: string;
  }>;
}

export interface StatusMaintenance {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

export interface StatusPageResponse {
  overall: StatusState;
  components: StatusComponent[];
  incidents: StatusIncident[];
  maintenance: StatusMaintenance[];
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
}

// ── Plans / profile ──────────────────────────────────────────────────────────
export type PlanId = 'personal' | 'student' | 'teams' | 'enterprise';

export interface PlanConfigDto {
  id: PlanId;
  name: string;
  priceLabel: string;
  dailySparks: number | null;
  personalStorageMb: number | null;
  teamStorageMb: number | null;
  maxTeamMembers: number | null;
  maxTeamsPerAccount: number | null;
  requiresVerification: boolean;
}

export interface UserProfileDto {
  username: string;
  displayName: string;
  plan: PlanId;
  locale: Language;
  avatarUrl: string | null;
  createdAt: string;
}

// ── Sparks ───────────────────────────────────────────────────────────────────
export interface WalletDto {
  balance: number;
  dailyLimit: number;
  /** UTC ISO time of the next scheduled top-up boundary. */
  nextRefillAt: string;
}

export type SparkTransactionType =
  | 'usage'
  | 'refill'
  | 'reservation'
  | 'settlement'
  | 'refund'
  | 'release'
  | 'referral_reward'
  | 'admin_adjust';

export interface SparkTransactionDto {
  id: string;
  type: SparkTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

// ── API errors ───────────────────────────────────────────────────────────────
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
