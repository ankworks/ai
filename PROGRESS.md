# ConAI — Progress Checklist

Status legend: `PLANNED` · `IN PROGRESS` · `IMPLEMENTED` · `TESTED` · `BLOCKED`
Rules: a feature may only be `IMPLEMENTED` when it actually works end-to-end;
`TESTED` requires meaningful automated tests; `BLOCKED` must name the blocker
(credential, DNS, free-tier, phase dependency).

_Last updated: 2026-10-17 (Phase 1)_

---

## PHASE 1 — Foundation

| Feature                                                                      | Status      | Notes                                                                                                                     |
| ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Repository inspection                                                        | TESTED      | Empty repo (LICENSE only) confirmed                                                                                       |
| Final architecture proposal                                                  | IMPLEMENTED | `ARCHITECTURE.md`                                                                                                         |
| Free-tier analysis                                                           | IMPLEMENTED | `docs/FREE_TIER.md` (vendor pages unreachable from sandbox → figures flagged for verification)                            |
| Missing credentials inventory                                                | IMPLEMENTED | `docs/MISSING_CREDENTIALS.md`                                                                                             |
| DNS / nested-subdomain verification                                          | BLOCKED     | Zone not created yet; `dpdns.org` resolves, `conai.dpdns.org` = no records. Path-mode fallback implemented in config      |
| Modular monorepo structure                                                   | IMPLEMENTED | npm workspaces: 6 apps, 9 packages                                                                                        |
| Tooling (TS strict, Vite, ESLint, Prettier, Vitest, Wrangler)                | IMPLEMENTED | pinned & verified against registry                                                                                        |
| Design system: tokens (brand colors/type)                                    | IMPLEMENTED | `packages/ui/src/styles`                                                                                                  |
| Design system: theme engine (light/dark/system)                              | IMPLEMENTED | preference store + `data-theme` switching                                                                                 |
| Design system: personalization (font size, reduced motion, compact, sidebar) | IMPLEMENTED | persisted in `localStorage`                                                                                               |
| Design system: i18n EN/VI                                                    | IMPLEMENTED | dictionaries in `packages/shared`, provider in `ui`                                                                       |
| Design system: components (shadcn-style set)                                 | IMPLEMENTED | button, input, card, dialog, dropdown, tabs, switch, tooltip, select, avatar, badge, label, separator, skeleton, textarea |
| Temporary logo vector (C + four-pointed spark)                               | IMPLEMENTED | labeled temporary in `logo.tsx`                                                                                           |
| Public website home                                                          | IMPLEMENTED | responsive, themed, i18n, real content                                                                                    |
| App shells (workspace/account/admin/status)                                  | IMPLEMENTED | honest "planned" placeholders, real nav/theme/preferences                                                                 |
| API skeleton (Hono, security headers, CORS, `/api/v1/health`)                | IMPLEMENTED | health probe does real DB/KV checks when bound                                                                            |
| Sparks engine core (top-up refill, pricing, reservation math)                | TESTED      | `packages/sparks` unit tests                                                                                              |
| Permissions engine (team + admin matrices)                                   | TESTED      | `packages/permissions` unit tests                                                                                         |
| Database migration 0001 (settings, plans, profiles, wallets, ledger)         | IMPLEMENTED | applied via `wrangler d1 migrations`                                                                                      |
| Status page reads real API data                                              | IMPLEMENTED | renders probe-driven states (unknown until Phase 8 monitors)                                                              |
| README / ARCHITECTURE / PRODUCT_SPEC / SECURITY / DEPLOYMENT                 | IMPLEMENTED | this file included                                                                                                        |
| CI pipeline                                                                  | PLANNED     | Phase 8 (gates documented, no CI config yet)                                                                              |

## PHASE 2 — Database, Auth, Authorization, Account

| Feature                                                | Status                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| better-auth integration (D1 adapter) + session cookies | PLANNED                                                                 |
| Password hashing verification on workerd               | BLOCKED (needs Phase 2 runtime test)                                    |
| Email/password + verification + reset                  | PLANNED                                                                 |
| OAuth: Google / Microsoft / GitHub / OIDC (state+PKCE) | PLANNED (BLOCKED on client credentials — `docs/MISSING_CREDENTIALS.md`) |
| Account linking (explicit, no email auto-merge)        | PLANNED                                                                 |
| Turnstile server-side verification                     | PLANNED (BLOCKED on site keys)                                          |
| KV rate limiting + backoff                             | PLANNED                                                                 |
| CSRF double-submit + origin checks                     | PLANNED                                                                 |
| Username system + Account Setup flow                   | PLANNED                                                                 |
| Device/session management UI                           | PLANNED                                                                 |
| Account platform sections (functional)                 | PLANNED                                                                 |
| Admin session separation scaffolding                   | PLANNED                                                                 |
| Migration 0002 (auth tables)                           | PLANNED                                                                 |

## PHASE 3 — AI Gateway, Sparks, Chat

| Feature                                                   | Status                                |
| --------------------------------------------------------- | ------------------------------------- |
| Provider adapter interface + Ollama Cloud adapter         | PLANNED (BLOCKED on `OLLAMA_API_KEY`) |
| SSE streaming pipeline + cancel/regenerate                | PLANNED                               |
| Model registry + capability detection + ConAI Auto router | PLANNED                               |
| Admin-managed pricing/routing config                      | PLANNED                               |
| Atomic wallet ops (reserve/settle/refund) on D1           | PLANNED (logic TESTED in Phase 1)     |
| Usage accounting from token usage (100 tok = 1 Spark ref) | PLANNED (formula TESTED)              |
| AI Chat (markdown/code/LaTeX, pin, search, export)        | PLANNED                               |
| Conversation history                                      | PLANNED                               |

## PHASE 4 — Workspace tools, Library, Files, Memory

| Feature                                                             | Status                       |
| ------------------------------------------------------------------- | ---------------------------- |
| B2 storage adapter + private bucket flows                           | PLANNED (BLOCKED on B2 keys) |
| Upload limits & quota enforcement (2 img / 2 doc / 50 pp, 10/20 MB) | PLANNED                      |
| Personal Library + team files                                       | PLANNED                      |
| Smart Memory (opt-in, approve-to-save)                              | PLANNED                      |
| AI Study / Coding / Writing / Documents / Tools                     | PLANNED                      |
| Prompt library (user)                                               | PLANNED                      |

## PHASE 5 — Teams

| Feature                                                              | Status                          |
| -------------------------------------------------------------------- | ------------------------------- |
| Teams, members, roles & fine-grained permissions                     | PLANNED (engine TESTED Phase 1) |
| Modules toggle (10 modules)                                          | PLANNED                         |
| Projects (Kanban/List/Calendar/Timeline)                             | PLANNED                         |
| Tasks + assignments                                                  | PLANNED                         |
| Channels (text/announcements/AI), threads, mentions, reactions, pins | PLANNED                         |
| Voice/video messages (≤5 min, quota-counted)                         | PLANNED                         |
| Documents, Calendar (ConAI)                                          | PLANNED                         |
| Automations WHEN/IF/THEN + logs + loop protection                    | PLANNED                         |
| Activity log (30-day retention)                                      | PLANNED                         |
| AI-suggested automations w/ confirmation                             | PLANNED                         |

## PHASE 6 — Admin, Governance, Verification, Trust & Safety

| Feature                                                         | Status                                      |
| --------------------------------------------------------------- | ------------------------------------------- |
| Admin auth (MFA, trusted devices, lockdown, recovery)           | PLANNED (BLOCKED on TOTP design in Phase 2) |
| Admin roles & custom permissions                                | PLANNED (matrices TESTED Phase 1)           |
| Admin modules (16)                                              | PLANNED                                     |
| Student verification workflow + protected docs                  | PLANNED (BLOCKED on B2 for docs)            |
| AI Governance (policies, versions, rollback, playground, audit) | PLANNED                                     |
| Referral system (anti-abuse, atomic rewards)                    | PLANNED                                     |
| Trust Center pages + reports/enforcement/appeals                | PLANNED                                     |
| Admin audit log (90-day retention + cleanup cron)               | PLANNED                                     |

## PHASE 7 — Search, Deep Research, Calendar, Notifications

| Feature                                     | Status                              |
| ------------------------------------------- | ----------------------------------- |
| Search gateway + citations + usage tracking | PLANNED (BLOCKED on search API key) |
| Deep research (budget, resumable, export)   | PLANNED                             |
| Google/MS calendar one-way sync + ICS       | PLANNED (shares OAuth credentials)  |
| In-app notification center                  | PLANNED                             |
| Web Push + preferences + quiet hours        | PLANNED (VAPID generated at setup)  |

## PHASE 8 — Status, Testing, Hardening, Deployment

| Feature                                                       | Status                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Status probes cron (AI/Auth/Workspace/Teams/DB/Notifications) | PLANNED                                                       |
| Incidents, maintenance, announcements publishing              | PLANNED                                                       |
| E2E tests (Playwright) + UI unit tests                        | PLANNED                                                       |
| CI (lint → typecheck → test → build)                          | PLANNED                                                       |
| Security hardening pass (per SECURITY.md §13)                 | PLANNED                                                       |
| Performance pass (bundle budgets, caching)                    | PLANNED                                                       |
| Production deployment                                         | BLOCKED — requires explicit authorization + verified DNS zone |

---

## Known blockers (global)

1. **DNS zone** for `conai.dpdns.org` (incl. nested records) — verify provider support; else path mode.
2. **Credentials** — Cloudflare token, B2 keys, Ollama Cloud key, OAuth apps, Turnstile, search API → `docs/MISSING_CREDENTIALS.md`.
3. **Vendor free-tier pages** unreachable from the build sandbox — figures in `docs/FREE_TIER.md` must be verified from a normal network before launch.
4. **Production deploy** — explicit authorization required.
