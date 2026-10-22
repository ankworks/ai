/**
 * Shared Vite config builder for all ConAI React apps (SPA).
 *
 * Every app does:
 *   import { reactAppConfig } from '../../packages/build/src/react.ts';
 *   export default reactAppConfig({ port: 5175 });
 *
 * Provides: React plugin, Tailwind v4, dev server bound to 0.0.0.0 (Arena
 * preview / LAN), `/api` proxy to the local Workers API on :8787 (apps call
 * relative `/api/*` — no cross-origin, no keys in the browser), and permissive
 * allowedHosts so sandbox preview domains are accepted.
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ProxyOptions, type UserConfigFn } from 'vite';

/** Default target of the dev `/api` proxy — `npm run dev:api` (wrangler :8787). */
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:8787';

export interface ReactAppConfigOptions {
  /** Dev/preview port for this app (5173 web, 5174 workspace, 5175 account, …). */
  port: number;
  /** Extra Vite plugins appended after React + Tailwind. */
  plugins?: Plugin[];
  /** Override the dev-server proxy map (defaults to `/api` → local API). */
  proxy?: Record<string, string | ProxyOptions>;
  /** Build output directory (default `dist`). */
  outDir?: string;
  /**
   * Public base path used ONLY for production builds (path-mode deployment,
   * e.g. `/app/`, `/account/`). Drives Vite `base` → asset URLs and
   * `import.meta.env.BASE_URL` (router basename). Dev servers always stay at
   * `/` because each app runs on its own port. Defaults to `/`.
   */
  basePath?: string;
}

/** Vite requires `base` to start and end with a slash (`/` is already valid). */
function normalizeBase(basePath: string | undefined): string {
  if (!basePath || basePath === '/') return '/';
  const withLeading = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function reactAppConfig(options: ReactAppConfigOptions): UserConfigFn {
  const { port, plugins = [], proxy, outDir = 'dist', basePath } = options;
  return defineConfig(({ command }) => ({
    // Production mounts SPAs under path prefixes on the single Worker;
    // `vite dev`/`vite preview` keep serving each app from its own port root.
    base: command === 'build' ? normalizeBase(basePath) : '/',
    plugins: [react(), tailwindcss(), ...plugins],
    server: {
      port,
      host: true, // bind 0.0.0.0 — preview environments reach it via proxy
      allowedHosts: true, // accept sandbox preview hostnames
      proxy: proxy ?? {
        '/api': { target: DEFAULT_API_PROXY_TARGET, changeOrigin: true },
      },
    },
    preview: {
      port,
      host: true,
      allowedHosts: true,
      proxy: proxy ?? {
        '/api': { target: DEFAULT_API_PROXY_TARGET, changeOrigin: true },
      },
    },
    build: {
      outDir,
      sourcemap: false,
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom'],
    },
  }));
}
