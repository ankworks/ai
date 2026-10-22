#!/usr/bin/env node
/**
 * Assemble the five SPA `dist/` outputs into the API Worker's static-assets
 * tree for path-mode deployment (single Worker, single hostname):
 *
 *   apps/web/dist       -> apps/api/assets/          (served at `/`)
 *   apps/workspace/dist -> apps/api/assets/app/      (served at `/app/`)
 *   apps/account/dist   -> apps/api/assets/account/  (served at `/account/`)
 *   apps/admin/dist     -> apps/api/assets/admin/    (served at `/admin/`)
 *   apps/status/dist    -> apps/api/assets/status/   (served at `/status/`)
 *
 * Runs from the root `build` script AFTER every workspace has built, so the
 * subsequent `wrangler deploy` (root `deploy` script) uploads the merged tree.
 * The directory is git-ignored except for `.gitkeep`, which keeps it present
 * for `wrangler dev` and the API workspace's build-time dry-run.
 */

import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'apps/api/assets');

/** [source dist, destination prefix inside the Worker assets directory]. */
const APP_MAPPING = [
  ['apps/web/dist', '.'],
  ['apps/workspace/dist', 'app'],
  ['apps/account/dist', 'account'],
  ['apps/admin/dist', 'admin'],
  ['apps/status/dist', 'status'],
];

await mkdir(outDir, { recursive: true });

// Clean previous assembly but preserve the committed placeholder.
for (const entry of await readdir(outDir)) {
  if (entry === '.gitkeep') continue;
  await rm(resolve(outDir, entry), { recursive: true, force: true });
}

for (const [from, prefix] of APP_MAPPING) {
  const src = resolve(root, from);
  if (!existsSync(src)) {
    console.error(
      `[assemble-assets] missing ${from} — run the workspace builds first (\`npm run build\`).`,
    );
    process.exit(1);
  }
  const dest = resolve(outDir, prefix);
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(`[assemble-assets] ${from} -> apps/api/assets${prefix === '.' ? '' : `/${prefix}`}`);
}

console.log('[assemble-assets] done.');
