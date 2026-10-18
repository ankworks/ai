/**
 * Generates `packages/database/migrations/0002_auth.sql` from the REAL better-auth
 * configuration (core tables + username plugin fields), so the SQL always matches
 * what better-auth will query at runtime.
 *
 * Run: npm run generate:migration -w @conai/auth   (plain `node` — TS type-stripping)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { createAuthOptions } from '../src/config.ts';
import type { EmailSender } from '../src/email.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '../../database/migrations/0002_auth.sql');

const devEmail: EmailSender = { mode: 'dev-log', send: async () => {} };

// Schema generation introspects an EMPTY in-memory SQLite database (node:sqlite) so
// getMigrations emits CREATE statements for every auth table — including our plugins'.
const introspectionDb = new DatabaseSync(':memory:');

const options = createAuthOptions({
  // Schema generation never touches real user data.
  db: {} as unknown as D1Database,
  secret: 'migration-generation-placeholder-secret-0000',
  baseURL: 'http://localhost:8787',
  trustedOrigins: [],
  environment: 'development',
  crossSubdomain: false,
  email: devEmail,
  oauth: {},
});
options.database = introspectionDb as unknown as NonNullable<(typeof options)['database']>;

const result = await getMigrations(options, { throwOnUnsafe: false });

type MigrationResult = {
  toBeCreated?: unknown[];
  statements?: string[];
  sql?: string;
  unsafeChanges?: string[];
  schemaProblems?: string[];
  compileMigrations?: () => Promise<string>;
};
const mr = result as unknown as MigrationResult;

let body: string;
if (typeof mr.compileMigrations === 'function') {
  body = await mr.compileMigrations();
} else if (Array.isArray(mr.statements) && mr.statements.length > 0) {
  body = mr.statements.map((s) => (s.endsWith(';') ? s : `${s};`)).join('\n\n');
} else if (typeof mr.sql === 'string' && mr.sql.trim().length > 0) {
  body = mr.sql;
} else {
  console.error('No SQL statements found in migration result. Keys:', Object.keys(mr));
  console.error('toBeCreated:', JSON.stringify(mr.toBeCreated, null, 2).slice(0, 2000));
  throw new Error('migration generation produced no SQL');
}

if (mr.schemaProblems && mr.schemaProblems.length > 0) {
  console.error('Schema problems:', mr.schemaProblems);
  process.exit(1);
}
if (mr.unsafeChanges && mr.unsafeChanges.length > 0) {
  console.warn('Unsafe changes reported (fresh DB — expected for required columns):');
  for (const m of mr.unsafeChanges) console.warn(' -', m);
}

const header = `-- ConAI auth schema (better-auth 1.7.10) — GENERATED, do not hand-edit.
-- Source of truth: packages/auth/src/config.ts (core tables + username plugin).
-- Generate: npm run generate:migration -w @conai/auth
--
-- Also creates our profile/wallet triggers' prerequisites: none — user_profiles and
-- spark_wallets live in 0001_init.sql and are linked application-side by user id.
`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${header}\n${body.trim()}\n`, 'utf8');

const created = Array.isArray(mr.toBeCreated) ? mr.toBeCreated.length : '?';
console.warn(
  `Wrote ${outPath} (tables: ${created}, statements: ${mr.statements?.length ?? 'raw-sql'})`,
);
