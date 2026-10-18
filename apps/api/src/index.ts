import { createApp, parseEnv } from './app';
import type { Env } from './env';

/**
 * ConAI API Worker entrypoint.
 * Secrets/bindings come from the Worker environment only — never from client payloads.
 * Env vars are zod-validated on every request; bindings (D1/KV) are re-attached after
 * validation so routes can rely on typed, checked configuration.
 */
const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const vars = parseEnv(env as unknown as Record<string, string>);
    const validated: Env = { ...vars, DB: env.DB, CACHE: env.CACHE };
    return app.fetch(request, validated, ctx);
  },
} satisfies ExportedHandler<Env>;
