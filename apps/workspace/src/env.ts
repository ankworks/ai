import { parsePublicEnv, type PublicEnv } from '@conai/shared';

/** Validated public (non-secret) build-time configuration. */
export const publicEnv: PublicEnv = parsePublicEnv(
  import.meta.env as unknown as Record<string, unknown>,
);
