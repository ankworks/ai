import { z } from 'zod';

/**
 * Worker environment bundle — every env var is validated at boot (spec §28).
 * Secrets are optional during Phase 1/2 scaffolding; phase-specific routes must fail
 * closed with a clear `not_configured` error when their secret is missing.
 */
export const envSchema = z.object({
  ROUTING_MODE: z.enum(['subdomain', 'path']).default('path'),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  APP_VERSION: z.string().default('0.1.0'),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177',
    ),

  // Secrets (see .dev.vars.example — Phase annotations there)
  SESSION_SECRET: z.string().min(16).optional(),
  OLLAMA_API_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  B2_APP_KEY_ID: z.string().min(1).optional(),
  B2_APP_KEY: z.string().min(1).optional(),
  B2_BUCKET_REGION: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SEARCH_API_KEY: z.string().optional(),
  SEARCH_PROVIDER: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
});

export type EnvValues = z.infer<typeof envSchema>;

export interface Env extends EnvValues {
  DB?: D1Database;
  CACHE?: KVNamespace;
}

export function parseEnv(raw: Partial<Record<string, string>>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid Worker environment: ${detail}`);
  }
  return result.data;
}

/** Hono app environment: Worker bindings + per-request variables. */
export type AppEnv = { Bindings: Env; Variables: { requestId: string } };

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
