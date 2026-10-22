import { Hono } from 'hono';
import { redactString } from '@conai/shared';
import { parseEnv, type AppEnv, type Env } from './env';
import { getAuth } from './auth';
import { errorResponse, securityMiddleware } from './middleware/security';
import { csrfMiddleware } from './middleware/csrf';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { rejectNonAssetMethod, serveStaticAssets } from './middleware/static-assets';
import { registerHealthRoutes } from './routes/health';
import { registerStatusRoutes } from './routes/status';
import { registerAccountRoutes } from './routes/me';
import { registerAiRoutes } from './routes/ai';
import { registerConversationRoutes } from './routes/ai-conversations';
import { registerMemoryRoutes } from './routes/memory';
import { registerPromptRoutes } from './routes/prompts';
import { registerFileRoutes } from './routes/files';
import { registerTeamRoutes } from './routes/teams';

/**
 * Builds the Hono app. The validated environment (zod) is supplied per request by
 * the Worker entrypoint and arrives through `c.env`.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', securityMiddleware);
  app.use('*', csrfMiddleware);
  app.use('*', rateLimitMiddleware);

  // API discovery metadata. Root `/` serves the web SPA (static assets catch-all).
  app.get('/api', (c) =>
    c.json({
      name: 'ConAI API',
      version: c.env.APP_VERSION,
      environment: c.env.ENVIRONMENT,
      routingMode: c.env.ROUTING_MODE,
      endpoints: {
        health: '/api/v1/health',
        status: '/api/v1/status',
        auth: '/api/auth/*',
        me: '/api/v1/me',
        models: '/api/v1/models',
        chat: 'POST /api/v1/ai/chat (SSE)',
        conversations: '/api/v1/ai/conversations',
        memory: '/api/v1/ai/memory',
        prompts: '/api/v1/ai/prompts',
        files: '/api/v1/files',
        teams: '/api/v1/teams',
      },
    }),
  );

  // better-auth — user-plane session (Phase 2). Admin instance mounts separately (Phase 6).
  app.all('/api/auth/*', (c) => getAuth(c.env).handler(c.req.raw));

  registerHealthRoutes(app);
  registerStatusRoutes(app);
  registerAccountRoutes(app);
  registerAiRoutes(app);
  registerConversationRoutes(app);
  registerMemoryRoutes(app);
  registerPromptRoutes(app);
  registerFileRoutes(app);
  registerTeamRoutes(app);

  // Static assets (path mode): unmatched GET/HEAD serves the assembled SPAs
  // with per-prefix index.html fallback; other methods get a JSON 404.
  app.on(['GET', 'HEAD'], '*', serveStaticAssets);
  app.all('*', rejectNonAssetMethod);

  app.onError((err, c) => {
    // Redacted structured log — never leak stack traces or secrets to clients.
    console.error(
      JSON.stringify({
        type: 'error',
        requestId: c.get('requestId'),
        message: redactString(err.message),
        stack: c.env.ENVIRONMENT === 'production' ? undefined : redactString(err.stack ?? ''),
      }),
    );
    return errorResponse('internal_error', 'Internal server error', 500, c.get('requestId'));
  });

  return app;
}

export { parseEnv };
export type { Env };
