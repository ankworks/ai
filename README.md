# ConAI

**ConAI** — a beautiful, free-first AI All-in-One workspace combining AI assistance,
education, productivity, collaboration, and personal account management.

> Domain target: `conai.dpdns.org` · Built for **Cloudflare Workers** (free tier first) ·
> License: BSD-3-Clause

```
Public Website  ·  AI Workspace  ·  Account Platform  ·  Administration  ·  Status Page
```

---

## ⚠️ Project status

This repository is under active phased development. Current phase: **Phase 1 (foundation)
complete** — monorepo, tooling, design system, core docs, Sparks & permissions logic (tested),
API skeleton with real health endpoint. Nothing else is claimed as working.
See **[`PROGRESS.md`](./PROGRESS.md)** for the authoritative feature checklist
(`PLANNED / IN PROGRESS / IMPLEMENTED / TESTED / BLOCKED`). Never assume a feature works
unless its row says `IMPLEMENTED` or `TESTED`.

## Documentation

| Document                                                       | Contents                                            |
| -------------------------------------------------------------- | --------------------------------------------------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                         | System design, routing, data model, engines         |
| [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md)                         | Feature specification & plan/limit definitions      |
| [`SECURITY.md`](./SECURITY.md)                                 | Threat model, auth/CSRF/session/rate-limit controls |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md)                             | Local dev, Cloudflare deploy, domains, migrations   |
| [`PROGRESS.md`](./PROGRESS.md)                                 | Phased implementation checklist                     |
| [`docs/FREE_TIER.md`](./docs/FREE_TIER.md)                     | Free-tier limits & free-compatible alternatives     |
| [`docs/DNS_AND_ROUTING.md`](./docs/DNS_AND_ROUTING.md)         | Subdomain vs path routing, DNS verification         |
| [`docs/MISSING_CREDENTIALS.md`](./docs/MISSING_CREDENTIALS.md) | Required accounts/keys and what they unblock        |

## Repository layout

```text
apps/
  web/        Public website            (React + Vite + Tailwind)
  workspace/  AI workspace              (chat, study, coding, writing, teams, …)
  account/    Account platform          (profile, security, plan, Sparks, preferences)
  admin/      Administration system     (separate session + MFA)
  status/     Public status page
  api/        Hono API on Cloudflare Workers (D1, KV, SSE gateway)
packages/
  ui/        Design system (tokens, theme engine, shadcn-style components, Logo, i18n)
  shared/    Brand constants, i18n dictionaries (en/vi), env & DTO types
  database/  SQL migrations + row types (wrangler d1 migrations)
  auth/      better-auth configuration & session/CSRF helpers
  ai/        Provider adapter interface, model registry types
  sparks/    Sparks engine (refill rule, pricing, reservation) — pure & unit-tested
  permissions/ Role/permission evaluation — pure & unit-tested
  storage/   Backblaze B2 (S3) adapter
  build/     Shared Vite config for React apps
```

## Quick start (local development)

Requirements: **Node.js ≥ 22.12**, npm ≥ 10.

```bash
npm install                 # install workspace dependencies
npm run typecheck           # strict TypeScript across all workspaces
npm test                    # unit + API tests (Vitest)
npm run build               # production build of every app
npm run dev                 # all apps in parallel (web 5173, workspace 5174,
                            #   account 5175, admin 5176, status 5177, api 8787)
```

Or start pieces individually:

```bash
npm run dev:api             # Hono API on http://localhost:8787
npm run dev:web             # public site   on http://localhost:5173
npm run dev:workspace       # workspace     on http://localhost:5174
npm run dev:account         # account       on http://localhost:5175
npm run dev:admin           # admin         on http://localhost:5176
npm run dev:status          # status page   on http://localhost:5177
```

Configuration: copy each app's `.env.example` → `.env` (frontends) and
`apps/api/.dev.vars.example` → `apps/api/.dev.vars` (Worker secrets). **No secrets are
committed.** See [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Database (from Phase 2 onward, when auth migrations land):

```bash
npm run db:migrate:local    # wrangler d1 migrations apply --local
```

## Quality gates

```bash
npm run lint                # ESLint (flat config, typescript-eslint, react-hooks)
npm run format:check        # Prettier
npm run typecheck           # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test                    # Vitest (sparks, permissions, api)
```

## Design system (Phase 1)

- **Colors** — Primary Violet `#7C3AED`, Deep Indigo `#4338CA`, Soft Lavender `#A78BFA`,
  Background `#F8F9FC`, Surface `#FFFFFF`, Text `#18181B` (dark theme fully supported).
- **Type** — Plus Jakarta Sans (headings), Inter (body), JetBrains Mono (code), self-hosted
  via Fontsource (no third-party font requests).
- **Logo** — a geometric **C enclosing a four-pointed spark** (clearly labeled _temporary
  vector_ until the official SVG is supplied; see `packages/ui/src/components/logo.tsx`).
- **Personalization** — theme (light/dark/system), font size, reduced motion, compact mode,
  collapsible sidebar, EN/VI language — persisted per user in `localStorage`.
- Components follow **shadcn/ui** conventions (cva + `cn` + Radix primitives) under
  `packages/ui/src/components`.

## Roadmap (phases)

| Phase | Scope                                                      |
| ----- | ---------------------------------------------------------- |
| 1     | ✅ Repo, architecture, tooling, design system, core docs   |
| 2     | Database schema, authentication, authorization, account    |
| 3     | AI Gateway, Ollama Cloud, model registry, Sparks, AI Chat  |
| 4     | Workspace tools, library, uploads, smart memory            |
| 5     | Teams, roles, projects, channels, automations              |
| 6     | Admin, AI governance, student verification, trust & safety |
| 7     | Search, deep research, calendar, notifications             |
| 8     | Status page monitors, testing, hardening, deployment       |

## License

BSD-3-Clause © AnkWorks — see [`LICENSE`](./LICENSE).
