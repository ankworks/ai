// Server-only auth package. Frontend apps must NOT import this module graph
// (it pulls in better-auth server code) — use `better-auth/react` client there.

export * from './constants.ts';
export * from './username.ts';
export * from './email.ts';
export * from './rate-limit.ts';
export * from './csrf.ts';
export * from './profile.ts';
export {
  createAuthOptions,
  createConaiAuth,
  configuredSocialProviders,
  type ConaiAuth,
  type ConaiAuthDeps,
  type OAuthEnv,
} from './config.ts';
