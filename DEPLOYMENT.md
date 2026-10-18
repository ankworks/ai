# ConAI — Deployment

How to run, configure, and (when authorized) deploy ConAI. **Do not deploy to production
without explicit authorization.**

## 1. Environments

| Env        | Purpose                  | Config source                                                     |
| ---------- | ------------------------ | ----------------------------------------------------------------- |
| local      | Development              | `.env` (Vite), `apps/api/.dev.vars` (secrets), `wrangler --local` |
| staging    | Pre-prod on Cloudflare   | `wrangler.toml`/`wrangler.jsonc` + secrets                        |
| production | `conai.dpdns.org` family | Same, different route zone + secrets                              |

Frontends read only `VITE_*` variables at **build time**. The API reads Worker env vars at
runtime. Examples are committed (`*.example`); real values never are.

## 2. Prerequisites

1. Node ≥ 22.12 and npm ≥ 10.
2. **Cloudflare account** (free plan is enough) + API token with
   Workers Scripts, D1, KV, R2(no)/Assets permissions — see `docs/MISSING_CREDENTIALS.md`.
3. **Zone for `conai.dpdns.org`** — the DNS provider must support the record set
   (nested/wildcard). Verify first: `docs/DNS_AND_ROUTING.md`. If nested subdomains are
   unavailable → use **path mode** (fully supported, zero code change).
4. **Backblaze B2** bucket provisioning + application key (S3-compatible).
5. **Ollama Cloud** API key (platform Owner-managed).
6. OAuth app credentials (Google/Microsoft/GitHub/OIDC), Turnstile keys, search API key —
   as features come online (Phase 2/7).

## 3. Local development

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars      # fill placeholders
cp apps/web/.env.example apps/web/.env                # and the same for other apps
npm run typecheck && npm test
npm run dev            # all apps; or dev:web / dev:api individually
```

API: `http://localhost:8787` (Hono via `wrangler dev` — real workerd runtime).
Frontends: Vite dev servers on 5173–5177 with proxy of `/api` → 8787 in path mode.

AI provider in local dev (Phase 3):

- Set `OLLAMA_API_KEY` + `OLLAMA_BASE_URL` in `apps/api/.dev.vars` for the real Ollama Cloud
  (`https://ollama.com/api` is the default when the base URL is omitted).
- No key? Use the bundled mock provider — same NDJSON wire format, zero cost:
  `node scripts/mock-ollama.mjs 11434` then point `OLLAMA_BASE_URL=http://127.0.0.1:11434/api`
  (this is what the live Phase 3 e2e used; it is dev-only code).
- Without any key the chat route answers `503 not_configured` — never a fake stream.

Database migrations (local):

```bash
npm run db:migrate:local        # wrangler d1 migrations apply --local
```

## 4. Build & test gates

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build        # builds all six apps (static assets + Worker bundle)
```

## 5. Cloudflare project setup (once)

```bash
npx wrangler login   # or CLOUDFLARE_API_TOKEN env

# D1
npx wrangler d1 create conai        # copy database_id → apps/api/wrangler.jsonc
# KV (cache, rate limits, status probes)
npx wrangler kv namespace create CACHE      # copy id → wrangler.jsonc

# apply migrations
npm run db:migrate:local            # against local miniflare
npx wrangler d1 migrations apply conai --remote
```

## 6. Secrets

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OLLAMA_API_KEY
# optional non-secret config (defaults to https://ollama.com/api):
#   wrangler.jsonc [vars] OLLAMA_BASE_URL = "https://ollama.com/api"
npx wrangler secret put B2_APP_KEY_ID
npx wrangler secret put B2_APP_KEY
npx wrangler secret put GOOGLE_CLIENT_SECRET
# … per apps/api/.dev.vars.example (each has a comment: which phase needs it)
```

Frontend build args (public): set as `VITE_API_BASE_URL` etc. in the build environment —
these are not secret.

## 7. Routing modes

**A. Subdomain mode (target):** one Worker per app with routes:

```
conai.dpdns.org/*                 → web assets
app.conai.dpdns.org/*             → workspace assets
account.conai.dpdns.org/*         → account assets
admin.conai.dpdns.org/*           → admin assets
status.conai.dpdns.org/*          → status assets
api.conai.dpdns.org/*             → api worker
```

Cookies: `Domain=.conai.dpdns.org` (set by API), `Secure`, `HttpOnly`.
CORS allowlist = the five app origins.

**B. Path mode (fallback):** single Worker with `assets` bindings + a router:

```
/         → web      /app → workspace   /account → account
/admin    → admin    /status → status   /api/v1 → api
```

Cookies host-only (`__Host-` prefix), `VITE_API_BASE_URL=/api`.
Mode is selected by config only — see `docs/DNS_AND_ROUTING.md`.

## 8. Deploy

```bash
npm run build
npx wrangler deploy          # api worker (+ assets per mode config)
```

Static assets deploy with the Worker(s) via the `assets` binding (Workers Static Assets).
Each app's `dist/` is the asset directory. Rollback: Cloudflare dashboard →
Workers → Versions → deploy previous version (or `wrangler rollback`).

## 9. Post-deploy verification

- `GET /api/v1/health` → `{"status":"ok", …}` with checks.
- Status page renders probe data (Phase 8 probes; until then components show "unknown" —
  this is intentional, not fabricated).
- Turnstile test keys replaced with live keys (widget silently passes with test keys —
  never ship test keys).
- HSTS active; CSP without `unsafe-inline` in prod builds.

## 10. Cron & queues

Scheduled Worker (daily 00:00 UTC): Sparks top-up audit, retention cleanup (30/90 days),
status probes every 5 min (separate schedule). Configured in `wrangler.jsonc` `triggers`.

## 11. Free-tier notes

See `docs/FREE_TIER.md`. Sanity check before production: Workers Free 100k req/day,
D1/KV free row & request budgets, B2 10 GB. If traffic exceeds free tiers, you get
service errors — alarms (Phase 8) surface them on the status page rather than silent failure.
