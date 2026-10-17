# ConAI — Architecture

> **Status:** Phase 1 — architecture established, monorepo scaffolded, design system in place.
> Feature-level status lives in [`PROGRESS.md`](./PROGRESS.md).

ConAI is a free-first AI All-in-One SaaS platform (AI assistance, education, productivity,
collaboration, account management) built as a modular monorepo and deployed on
**Cloudflare Workers** (static assets + Hono API), **D1** (relational data), **KV** (cache /
rate limits), **Backblaze B2** (files), with an **Ollama Cloud**-first AI gateway.

---

## 1. Design principles

1. **Server-side authority** — authorization, Sparks enforcement, safety rules, and credential
   protection are enforced in backend code. Prompts are never a security boundary.
2. **No fake functionality** — every button in a completed feature performs real work. Features
   still in earlier phases render honest "planned" states instead of pretending.
3. **Zero-cost first** — free-tier-compatible services only; anything that cannot run within
   free tiers is documented in [`docs/FREE_TIER.md`](./docs/FREE_TIER.md) with a free alternative.
4. **Honest status tracking** — features move `PLANNED → IN PROGRESS → IMPLEMENTED → TESTED`
   only based on reality (`BLOCKED` when a credential/service is missing).
5. **Separation of powers** — public site, user workspace, account platform, admin system, and
   status page are separate applications with separate auth sessions for admin.
6. **Strict TypeScript everywhere**, shared design tokens, shared packages, database migrations,
   validated inputs (zod), and no Node.js APIs inside the Workers runtime.

---

## 2. System overview

```
                                ┌─────────────────────────────────────────────┐
                                │              Cloudflare edge               │
   Browser ── HTTPS ───────────►│  Turnstile (forms) · WAF · rate limiting    │
                                └───────────────┬─────────────────────────────┘
                                                │ Worker routes
        ┌───────────────┬───────────────┬───────┴──────┬───────────────┬───────────────┐
        │ conai.dpdns.  │ app.conai…    │ account.     │ admin.        │ status.       │
        │ org (web)     │ (workspace)   │ conai…       │ conai…        │ conai…        │
        │  static SPA   │  static SPA   │ static SPA   │ static SPA    │ static SPA    │
        └──────┬────────┴───────┬───────┴──────┬───────┴───────┬───────┴───────┬───────┘
               │               │              │               │               │
               └───────────────┴───────┬──────┴───────────────┴───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  api.conai.dpdns.org         │   (or /api/v1 path mode)
                        │  Cloudflare Worker — Hono    │
                        │  middleware:                 │
                        │   CORS · security headers ·  │
                        │   CSRF · origin check ·      │
                        │   Turnstile verify ·         │
                        │   KV rate limit ·            │
                        │   session auth · authz       │
                        ├──────────────────────────────┤
                        │ routes/  health, auth,       │
                        │          account, sparks,    │
                        │          ai (SSE), teams,     │
                        │          files, admin, status│
                        └───┬──────────┬──────────┬────┘
                            │          │          │
              ┌─────────────▼──┐  ┌────▼────┐  ┌──▼──────────────┐
              │ D1 (relational)│  │ KV      │  │ Provider adapters│
              │ users, teams,  │  │ cache,  │  │ Ollama Cloud     │
              │ wallets, ledger│  │ limits, │  │ (Search gateway) │
              │ conversations… │  │ sessions│  │ keys: env only   │
              └────────────────┘  └─────────┘  └──────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │ Backblaze B2 (S3, private) │  personal / teams / verification /
              │ presigned via Worker       │  temp / public buckets
              └────────────────────────────┘
```

---

## 3. Repository layout

```
conai/
├── apps/
│   ├── web/         # Public marketing website          (conai.dpdns.org)
│   ├── workspace/   # AI workspace (chat, study, teams)  (app.conai.dpdns.org)
│   ├── account/     # Account platform                  (account.conai.dpdns.org)
│   ├── admin/       # Administration system             (admin.conai.dpdns.org)
│   ├── status/      # Public status page                (status.conai.dpdns.org)
│   └── api/         # Hono API on Cloudflare Workers    (api.conai.dpdns.org)
├── packages/
│   ├── ui/          # Design system: tokens, theme engine, shadcn-style components,
│   │                # Logo, i18n provider, preference store
│   ├── shared/      # Brand constants, i18n dictionaries (en/vi), env schemas,
│   │                # API DTO types, pure utilities
│   ├── database/    # SQL migrations (wrangler d1 migrations), row types, query helpers
│   ├── auth/        # better-auth configuration, session/CSRF/Turnstile helpers
│   ├── ai/          # Provider adapter interface, model registry types, routing types
│   ├── sparks/      # Sparks engine: refill rule, pricing, reservation logic (pure + tested)
│   ├── permissions/ # Role/permission model for teams + admin (pure + tested)
│   ├── storage/     # B2 S3 adapter: presign, upload/download policy, quota checks
│   └── build/       # Shared Vite config for React apps
├── docs/            # FREE_TIER, DNS_AND_ROUTING, MISSING_CREDENTIALS
└── *.md             # README, ARCHITECTURE, PRODUCT_SPEC, SECURITY, DEPLOYMENT, PROGRESS
```

**Responsibilities**

| App / Package    | Owns                                                              | Never owns                |
| ---------------- | ----------------------------------------------------------------- | ------------------------- |
| `apps/web`       | Marketing pages, plans, trust links                               | Any privileged data       |
| `apps/workspace` | AI surfaces, teams UI, library                                    | Secrets, wallet writes    |
| `apps/account`   | Profile, security, devices, plan/Sparks views, preferences        | Admin functions           |
| `apps/admin`     | Operator consoles (separate session + MFA)                        | User-password storage     |
| `apps/status`    | Public incident/status display                                    | Internal-only diagnostics |
| `apps/api`       | All authorization, wallet mutations, provider calls, file presign | —                         |
| `packages/*`     | Shared, mostly pure logic; no browser-only or Node-only APIs      | —                         |

All packages export source TypeScript consumed directly by Vite (workspace symlinks), so
code-splitting and typechecking stay uniform. Every app builds to static assets and is served
by Cloudflare Workers (`assets` binding).

---

## 4. Domain & routing strategy

**Verified 2026-10-17 (this sandbox):** `dpdns.org` resolves (142.171.123.133);
`conai.dpdns.org` and nested names (`app.…`, `api.…`) return **no records yet** —
the zone has not been created, and whether the free DNS provider supports
wildcard/nested delegation for `conai.dpdns.org` **must be verified at deployment time**.

Therefore the platform supports **two routing modes** from day one, selected by configuration —
never assumed:

| Mode        | Shape                                                                   | Cookies                      |
| ----------- | ----------------------------------------------------------------------- | ---------------------------- |
| `subdomain` | one Worker route per app (`app.conai…`, `api.conai…`, …)                | `Domain=.conai.dpdns.org`    |
| `path`      | one Worker: `/` web, `/app`, `/account`, `/admin`, `/status`, `/api/v1` | host-only (`__Host-` prefix) |

- API base URL is injected at build time (`VITE_API_BASE_URL`): `https://api.conai.dpdns.org`
  or `/api` respectively.
- Session cookies are minted by the API with `Secure`, `HttpOnly`, `SameSite=Lax` (OAuth
  redirects), plus explicit `Origin`/`Referer` CSRF checks on every state-changing request.
- Details: [`docs/DNS_AND_ROUTING.md`](./docs/DNS_AND_ROUTING.md).

---

## 5. Application areas

### 5.1 Public website (`apps/web`)

Static SPA. Home (hero, features, plans, CTA), trust-center links, language switch (EN/VI),
theme switch (light/dark/system). Uses only the shared design system. No privileged APIs.

### 5.2 AI workspace (`apps/workspace`)

Shell: light sidebar (light mode), top bar, routes:

`/` Home (welcome, AI Composer, quick actions, recent conversations) · `/chat` · `/study` ·
`/coding` · `/writing` · `/documents` · `/tools` · `/library` · `/history` · `/teams`.

Chat supports markdown, code, LaTeX, streaming (SSE via `fetch` reader), copy/regenerate/edit/
stop, history search, pin, export. Composer stays in-app. AI calls always go through the
API gateway with the user's session — never with provider keys.

### 5.3 Account platform (`apps/account`)

Overview, Profile, Security, Devices, Connected accounts, Plans, Sparks, Referrals, Storage,
AI Memory, Preferences (theme/font/motion/compact/language — **functional in Phase 1**),
Notifications, Student verification. Post-registration flow: _Account Setup → Workspace_;
default plan **Personal**, no plan selection forced at signup.

### 5.4 Administration (`apps/admin`)

Separate application, **separate auth session** (distinct cookie), **MFA required**,
fine-grained admin permissions (Owner, Administrator, Moderator, Student Reviewer,
AI Manager, Support Agent, custom roles). Modules: Dashboard, Users, Student Verification,
Teams, AI Providers, AI Models, API Credentials, Sparks, Referrals, Storage, AI Governance,
Trust & Safety, Reports, Maintenance, Notifications, Audit Logs, Settings. Only Owner can
grant Owner. Emergency Lockdown + documented recovery.

### 5.5 Status page (`apps/status`)

Displays **real monitoring data**: Worker cron probes (`/api/v1/status/probes` results cached
in KV), component states (AI Services, Authentication, Workspace, Teams, Database,
Notifications), incident history, scheduled maintenance, announcements. No fabricated data —
components without probes render as "unknown" until Phase 8 monitors exist.

---

## 6. Data model (D1)

Migrations in `packages/database/migrations/` applied with `wrangler d1 migrations apply`.

**Phase 1 (`0001_init.sql`) — shipped**
`platform_settings`, `plan_configs` (seeded PERSONAL/STUDENT/TEAMS/ENTERPRISE),
`user_profiles` (username, locale, plan, referral code), `spark_wallets` (single wallet/user),
`spark_transactions` (append-only ledger with unique `request_id` idempotency).

**Phase 2** — `0002_auth.sql`: better-auth core tables (user, session, account, verification)

- `auth_admin_mfa`, `trusted_devices`.

**Phase 3** — `0003_ai.sql`: `conversations`, `messages`, `ai_models`, `ai_providers`,
`usage_records`, `governance_policies` (draft/publish/versions).

**Phase 4** — `0004_content.sql`: `files` (B2 metadata + quota), `memories`,
`prompt_library`, `search_operations`.

**Phase 5** — `0005_teams.sql`: teams, memberships, custom roles, projects, tasks,
channels, messages/threads/reactions, documents, calendar events, automations + execution
logs, activity log (30-day retention).

**Phase 6** — `0006_admin.sql`: admin users/roles/permissions, student verification
applications, reports/enforcement/appeals, admin audit log (90-day retention).

**Phase 7** — `0007_integrations.sql`: notifications, push subscriptions, calendar
connections, deep-research jobs.

**Phase 8** — `0008_status.sql`: status components, probes, incidents, maintenance,
announcements.

**Invariants**

- One wallet per user — team membership never creates a second wallet.
- Ledger is append-only; balance changes only through wallet functions that write ledger rows
  in the same D1 transaction; every mutation carries `request_id` (UNIQUE) for idempotency.
- Balances sent by clients are ignored — server loads the wallet row.

---

## 7. Authentication & sessions

- **Library:** `better-auth` (1.7.x, verified compatible with Workers) with its **D1 adapter**
  and the `username`, `organization`-style extensions as needed; OAuth via built-in providers
  (Google, Microsoft, GitHub, generic OIDC) using **state + PKCE**.
- **Passwords:** library password hashing; Phase 2 must verify the hashing path runs on the
  Workers runtime (fallback: WebCrypto PBKDF2-SHA256 ≥600k iterations, documented in
  [`SECURITY.md`](./SECURITY.md)).
- **Cookies:** `HttpOnly; Secure; SameSite=Lax`, session rotation, absolute + idle expiry;
  admin sessions use a **different cookie name** and are never accepted on user routes.
- **CSRF:** double-submit token (readable cookie ↔ request header) + strict `Origin` check
  on all non-GET routes; OAuth `state` validated server-side.
- **Linking:** accounts link only through an explicit, authenticated flow with a verified
  provider — **never auto-merged on matching email**.
- **Devices:** every login registers a device record (UA family, IP prefix, rough geo from
  Cloudflare header, last seen). Users can revoke sessions. Multi-device login allowed.
- **Anti-abuse (privacy-conscious):** Turnstile on signup/reset, email verification, KV-backed
  sliding-window rate limits per IP+identifier with exponential backoff. IP alone never causes
  a permanent block. One-registration-per-device is _encouraged_ via a salted, rotated
  fingerprint hint — documented as best-effort, never a hard guarantee.
- **Admin MFA:** TOTP required at admin login; trusted devices (30 days) stored hashed;
  Emergency Lockdown flag (KV) denies all admin sessions except Owner with recovery code.

---

## 8. Plans & entitlements

| Plan       | Price   | Sparks/day            | Storage         | Limits                           |
| ---------- | ------- | --------------------- | --------------- | -------------------------------- |
| PERSONAL   | Free    | 500                   | 500 MB personal | default plan                     |
| STUDENT    | Free    | 700                   | 1 GB personal   | manual admin verification        |
| TEAMS      | Free    | 1000                  | 2 GB / team     | 30 members/team, 5 teams/account |
| ENTERPRISE | Contact | configurable by Owner | configurable    | —                                |

All rows live in `plan_configs` (admin-editable). No payments, no cards, no Sparks purchasing.

---

## 9. Sparks engine (`packages/sparks`)

**Wallet** — one per user, integer Sparks, `CHECK (balance >= 0)`.

**Daily refill = TOP-UP (not accumulation)**, applied _before any spend_ inside every wallet
transaction and by the daily cron (00:00 UTC scheduled Worker):

```
new_balance = max(current_balance, highest_eligible_daily_limit)
```

Entitlements do not stack; team membership does not add wallets; the highest eligible limit
wins. Worked examples (spec): `700/1000 → 1000`, `1200/1000 → 1200`.

**Cost formula** (configurable in Admin → Sparks):

```
equivalentTokens = input × inputWeight + output × outputWeight + vision × visionWeight
sparks = ceil(equivalentTokens × modelMultiplier / tokensPerSpark)   // default 100 tokens = 1 Spark
        + searchOps × searchOpCost + researchOps × researchOpCost
```

**Request lifecycle**

1. **Reserve** — server estimates cost, atomically holds `balance -= hold` (ledger
   `reservation`), keyed by client `request_id` (UNIQUE) → replay-safe.
2. **Stream** — gateway streams tokens; usage accumulated server-side.
3. **Settle** — actual cost computed; `refund = hold − actual` returned to the wallet
   (ledger `settle` + `refund` rows).
4. **Failure** — full hold refunded (`release`); failed-request policy configurable.

Client balances are display-only; every mutation reloads the wallet row inside a D1
transaction (atomic CAS on `version`). Pure logic + tests live in `packages/sparks`
(see `src/refill.ts`, `src/pricing.ts`, `src/reservation.ts`).

---

## 10. AI Gateway (`apps/api` + `packages/ai`)

```
request → authz → budget check (Sparks estimate) → reserve
        → policy engine (core safety → admin global → tool → user prefs) builds system prompt
        → router (ConAI Auto: capability+policy+cost | manual model)
        → provider adapter (Ollama Cloud)  ──SSE──►  client
        → usage record → settle Sparks → ledger
```

- **Adapter interface** (`packages/ai`): `stream()`, `cancel()`, `capabilities()`,
  `models()`. Providers implement the interface; Ollama Cloud is first; others are config-only
  additions. Multi-provider credentials are centrally held in Worker env (encrypted by
  Cloudflare), referenced by name — **never shipped to the browser**. Multiple credentials
  exist for rotation/HA, never for quota evasion.
- **Model registry** in D1 (admin-managed): model id, provider, capabilities (vision/tools),
  pricing multiplier, enabled, fallback order. KV-cached with short TTL.
- **ConAI Auto** routing: user intent + capability needs + admin policy → cheapest capable
  model; manual selection overrides.
- **Errors:** classified (auth / rate-limit / model / network). Controlled fallback follows
  the model's admin-configured fallback chain, then a typed SSE error event. No silent retries
  that bypass Sparks accounting.

## 10b. AI Governance

Policy hierarchy applied server-side, in order: **Core Safety (hard-coded) → Admin Global
Policies → Tool Instructions → User Preferences → User Request**. Draft → publish workflow
with version history, rollback, testing playground (runs against a test Sparks budget), and
audit logs. Core safety and authorization rules are code — prompts only shape tone/persona.

## 10c. Smart Memory

Opt-in. Model may _suggest_ memories; nothing is saved without explicit user approval.
View/edit/delete/disable/delete-all in Account → AI Memory. Personal memories are scoped
`user_id` and are never copied into team contexts.

---

## 11. Storage (B2 via S3 API)

- **Private buckets:** `conai-personal`, `conai-teams`, `conai-verification`,
  `conai-temp` (short TTL) — plus `conai-public` for static brand assets.
  (Do not assume more buckets expand the free allowance — see FREE_TIER doc.)
- D1 `files` table = metadata + owner/scope + size; KV caches listings.
- Uploads go Worker → B2 (server-side SigV4 with env credentials) or short-lived presigned
  URLs; downloads stream through the Worker with authorization checks (buckets stay private).
- Per-message limits (configurable): **2 images, 2 documents, 50 PDF pages;
  10 MB image, 20 MB document** — enforced server-side before the B2 write.
- Quota checks (personal 500 MB–1 GB, team 2 GB) run inside the upload transaction.

---

## 12. Teams

Modules: Overview, Projects, Tasks, Channels, Documents, Calendar, Activity, Members,
Automations, Settings — Owner can enable/disable each module.
Project views: Kanban, List, Calendar, Timeline/Gantt. Channel types: text, announcements,
AI channels. Threads, mentions, reactions, pins, voice/video messages (≤ 5 min, counts
toward team quota). Roles: Owner, Admin, Member, Viewer + custom roles evaluated by
`packages/permissions` **on the server for every mutation**. AI calls inside teams consume
the **calling user's** Sparks wallet.

**Automations:** `WHEN event → IF condition → THEN action`, no-code editor; AI may _suggest_
a rule (draft) but activation always requires explicit user confirmation. Execution engine
enforces: permission check → depth/loop counter → per-team rate limit → execution log.

---

## 13. Notifications, Search, Deep Research, Calendar

- **In-app notification center** (D1) + **Web Push** (VAPID, generated at deploy): AI
  completion (opt-in), invites, mentions, task assignments, announcements. Preferences +
  quiet hours. Marketing push prohibited; permission prompt only after user gesture.
- **Search gateway:** provider adapter (configurable; key in env), results with real URLs,
  titles, timestamps; citations derived from actual results only; usage tracked (Sparks).
- **Deep research:** planning → multi-source search → analysis → structured report with
  citations → export/save to Library. Jobs are D1 rows resumed by cron (resumable), with a
  configurable Sparks budget reserved up front.
- **Calendar:** ConAI calendar first; Google/MS one-way sync via OAuth (minimal scopes),
  ICS import/export; disconnect anytime.

---

## 14. Admin & audit

- Separate app + separate session cookie + MFA + trusted devices; permission matrix in
  `packages/permissions` (`ADMIN_ROLE_PERMISSIONS`), checked server-side per route group.
- **Audit log:** admin actions, actor, target, IP, redacted metadata — **no passwords, API
  keys, session tokens, or secrets ever logged** (redaction helper in API middleware).
- Retention: team activity 30 days, admin audit 90 days, enforced by scheduled Worker cron
  (`delete … WHERE created_at < datetime('now', '-30 days')` etc.).

---

## 15. Status & monitoring

Cron probes every 5 min hit: auth health, DB (`SELECT 1`), KV round-trip, AI provider
lightweight check (models list), workspace/API latency. Results → KV (`status:probe:*`)
with timestamps. Status page reads `GET /api/v1/status` (public, cached). Component state is
derived from probe outcomes (`Operational / Degraded / Partial Outage / Major Outage /
Maintenance`); manual maintenance windows and incidents are admin-authored rows.

---

## 16. Free-tier strategy

Target: **$0 infrastructure** — Workers Free, D1 Free, KV Free, B2 free allowance, Ollama
Cloud available allowance. Full limit table, verification status (sandbox cannot reach
vendor pricing pages — marked BLOCKED-VERIFY), and free-compatible alternatives:
[`docs/FREE_TIER.md`](./docs/FREE_TIER.md). Missing credentials/services:
[`docs/MISSING_CREDENTIALS.md`](./docs/MISSING_CREDENTIALS.md).

---

## 17. Environments & configuration

- Secrets only via Worker env (`wrangler secret` / `.dev.vars` locally) and `.env*` for
  frontends (build-time `VITE_*` only, never provider keys). Examples: `apps/api/.dev.vars.example`,
  `apps/web/.env.example` (pattern repeated per app).
- `zod` validates every external input at route boundaries and every env bundle at boot.
- Structured JSON logs; a redaction pass strips tokens/keys/passwords.

---

## 18. Testing strategy

| Layer | Tool                        | Where                                      |
| ----- | --------------------------- | ------------------------------------------ |
| Unit  | Vitest                      | `packages/sparks`, `permissions`, `shared` |
| API   | Vitest + Hono `app.request` | `apps/api/test`                            |
| UI    | Vitest + Testing Library    | `packages/ui` (from Phase 8)               |
| E2E   | Playwright (Phase 8)        | `e2e/`                                     |

Root `vitest.config.ts` defines all projects; CI order: `lint → typecheck → test → build`.
