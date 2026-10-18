import { z } from 'zod';

/**
 * Public build-time configuration shared by all ConAI frontends.
 * Only `VITE_*` values (never secrets) reach the browser.
 */
export const publicEnvSchema = z.object({
  /** API origin: `https://api.conai.dpdns.org` (subdomain mode) or `/api` (path mode). */
  VITE_API_BASE_URL: z.string().default('/api'),
  /** Base path of this app: `""` (subdomain) or `/app`, `/account`, `/admin`, `/status`. */
  VITE_BASE_PATH: z.string().default('/'),
  /** Cross-app links (full origins in subdomain mode; same-origin paths in path mode). */
  VITE_WEB_URL: z.string().default('/'),
  VITE_WORKSPACE_URL: z.string().default('/app'),
  VITE_ACCOUNT_URL: z.string().default('/account'),
  VITE_ADMIN_URL: z.string().default('/admin'),
  VITE_STATUS_URL: z.string().default('/status'),
  /** Deployment mode marker for diagnostics. */
  VITE_CONAI_MODE: z.enum(['subdomain', 'path']).default('path'),
  /**
   * Cloudflare Turnstile SITE key (public by design) — renders bot-protection
   * widgets on auth forms when set. Secret stays server-side (TURNSTILE_SECRET_KEY).
   */
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Parse and validate `import.meta.env`-style objects. Throws early on invalid config. */
export function parsePublicEnv(source: Record<string, unknown>): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
