# ConAI — Progress Checklist

Status legend: `PLANNED` · `IN PROGRESS` · `IMPLEMENTED` · `TESTED` · `BLOCKED`
Rules: a feature may only be `IMPLEMENTED` when it actually works end-to-end;
`TESTED` requires meaningful automated tests; `BLOCKED` must name the blocker
(credential, DNS, free-tier, phase dependency).

_Last updated: 2026-10-18 (Phase 1 `114496b` + Phase 2 `5690249` + Phase 3 `eea72fa`/`b21b3a3` + Phase 4 `3571c36` + Phase 5a Teams core shipped — all pushed)_

---

## PHASE 1 — Foundation — ✅ SHIPPED (commit `114496b`, pushed)

Gates at ship: lint 0 · typecheck 0 · 70/70 tests · build 0.

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

## PHASE 2 — Database, Auth, Authorization, Account — ✅ SHIPPED (commit `5690249`, pushed)

| Feature                                           | Status                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| better-auth 1.7.10 (native D1 binding) + sessions | IMPLEMENTED — `packages/auth`, cookie `conai.session_token`, 30-day idle window, mounted at `/api/auth/*`                                                                              |
| Password hashing on workerd                       | TESTED — e2e: sign-up → 161-char scrypt digest in `account.password` → sign-in verifies (needs `nodejs_compat`, declared)                                                              |
| Email/password + verification + reset             | TESTED — e2e: sign-up → dev-log verify link → verified → sign-in; reset link → 302 → account reset page → new password                                                                 |
| Migration 0002 (auth tables)                      | TESTED — GENERATED from the real config (`compileMigrations`), applied locally; 4 tables + indexes                                                                                     |
| Username system (@username)                       | TESTED — plugin validation, dup rejection (`USERNAME_IS_ALREADY_TAKEN`), invalid chars, availability endpoint                                                                          |
| Account bootstrap hook (profile + wallet)         | TESTED — sign-up creates `user_profiles` + `spark_wallets` rows (hook e2e + self-heal on `/api/v1/me`)                                                                                 |
| `/api/v1/me` + PATCH (identity, wallet, plan)     | TESTED — e2e incl. self-heal, locale/display-name updates, `nextRefillAt` = next 00:00 UTC                                                                                             |
| CSRF double-submit + origin checks                | TESTED — layered (better-auth built-ins + own token on `/api/v1/*`); 403 chains + evil-origin 403 e2e + unit                                                                           |
| KV rate limiting                                  | TESTED — unit (window/expiry/write-amplification guard) + live 429 `Retry-After` (sign-in 10/300s per IP prefix)                                                                       |
| Redaction helper                                  | TESTED — Phase 1 unit tests; access/error logs redact query strings                                                                                                                    |
| OAuth (Google/Microsoft/GitHub/OIDC SSO)          | IMPLEMENTED — conditional wiring + `GET /api/v1/auth/providers`; live login BLOCKED on client credentials (MISSING_CREDENTIALS #9/#10)                                                 |
| Account linking (explicit, no email auto-merge)   | IMPLEMENTED — Connected page (list/link/unlink) + routes; live OAuth blocked on credentials                                                                                            |
| Turnstile on auth forms                           | IMPLEMENTED — server plugin + `x-captcha-response` + widget when `VITE_TURNSTILE_SITE_KEY` set; BLOCKED on real keys for production                                                    |
| Password reset UI                                 | IMPLEMENTED — account `/reset-password` page (token via 302 callback)                                                                                                                  |
| Username system + Account Setup flow              | IMPLEMENTED — sign-up collects @username; `/setup` (display name + locale → workspace CTA)                                                                                             |
| Device/session management UI                      | IMPLEMENTED — sessions list (current flag via session id), revoke; privacy note (no permanent IP bans)                                                                                 |
| Account platform sections (functional)            | IMPLEMENTED — Overview, Profile, Security, Devices, Connected, Plans, Sparks live-read real data; referrals/storage/memory/notifications/verification still Phase-planned placeholders |
| Sign-in/Sign-up UI (EN/VI, Turnstile-ready)       | IMPLEMENTED — `apps/account` auth pages + i18n; browser-level E2E not yet automated (API e2e + Vite module smoke pass)                                                                 |
| Admin session separation                          | IMPLEMENTED (Phase 6 slice 1 — second better-auth instance with prefix `conai_admin`, basePath `/api/admin-auth`, TOTP MFA, sign-up disabled; cross-plane cookie reuse rejected with 401)          |
| Admin roles/MFA, student review, referrals engine | PLANNED (Phases 5–6)                                                                                                                                                                   |

## PHASE 3 — AI Gateway, Sparks, Chat — ✅ SHIPPED (commit `eea72fa`, pushed)

| Feature                                                 | Status                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider adapter interface + Ollama adapter             | IMPLEMENTED — `@conai/ai` `ProviderAdapter`; Ollama NDJSON streaming; server-held key (`OLLAMA_API_KEY`, hop worker→provider only, never in a response)                                            |
| SSE streaming pipeline (`POST /api/v1/ai/chat`)         | TESTED — unit (stubbed provider, 9 route tests) + LIVE e2e: meta → deltas → usage → done through wrangler :8787 and the workspace :5174 proxy; client Stop = AbortController (full partial settle) |
| Model registry + ConAI Auto router                      | TESTED — `DEFAULT_MODELS` + `ai.registry` D1 override; vision/code/autoRank heuristics, unhealthy skip, ≤3 fallback chain (28 unit tests); real-cloud model availability verify-at-rollout flagged |
| Controlled fallback                                     | TESTED — retryable failure BEFORE first chunk walks the chain (live/404 case); mid-stream death settles emitted-text estimate (no mid-stream fallback, by design)                                  |
| Admin-managed pricing/routing config                    | IMPLEMENTED (data) — `sparks.pricing` + `ai.registry` read from `platform_settings`; admin editing UI lands with Phase 6 admin                                                                     |
| Atomic wallet ops on D1 (reserve→settle→refund/release) | TESTED — version-guarded sequential UPDATE…RETURNING, idempotent `settle:`/`release:` request ids, UNIQUE-race compensation; live ledger: reservation −7 → settlement +6 (charged 1)               |
| Usage accounting (100 equiv tokens = 1 Spark)           | TESTED — settle from provider `prompt_eval_count`/`eval_count`, emitted-text fallback; live: 10+14 tokens → 1 Spark; estimate hold replaced at settlement                                          |
| AI Gateway error contract (401/402/429/409/503)         | TESTED — unauthenticated, insufficient_sparks 402 (reserve skipped), per-user KV chat limit 30/60 → 429+Retry-After, requestId replay 409, not_configured 503 without key                          |
| First-day Sparks grant at sign-up                       | TESTED — new wallets credit `plan_configs.daily_sparks` (free-first; day-0 balance was 0 until tomorrow otherwise); refill TOP-UP semantics unchanged                                              |
| AI Chat UI (workspace `/chat`)                          | IMPLEMENTED — model select (ConAI Auto), live balance, streaming bubbles, Stop, error banners, EN/VI; vite module smoke + full proxy SSE chain live                                                |
| AI Chat (markdown/code, export, save-to-memory)         | IMPLEMENTED (Phase 4 — dependency-free markdown renderer with fenced code + copy; LaTeX/tables not yet, chat stays honest where unsupported)                                                       |
| Conversation history                                    | TESTED (Phase 4 — server persistence + list/search/pin/rename/delete route tests + History page)                                                                                                   |

## PHASE 4 — Workspace tools, Library, Files, Memory — ✅ SHIPPED (commit `3571c36`, pushed)

Gates: format 0 · lint 0 · typecheck 0 (now covers **all** packages + scripts) · **159/159 tests (19 files)** · build 0.

| Feature                                                                                    | Status                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations 0003 (conversations, messages, user_memories, prompt_library) + 0004 (files)    | TESTED — applied to fresh local D1 (0001–0004 all ✅); test harness now applies **every** migration file dynamically                                                                                                                                           |
| Dependency-free SigV4 signer (presign GET/PUT + signed headers)                            | TESTED — 10/10 incl. both AWS published S3 vectors (`f0e8…` GET, `98ad…` PUT) matched byte-for-byte                                                                                                                                                            |
| B2 storage adapter + presign/confirm/download/delete routes                                | TESTED — route tests cover 503 `not_configured` (no keys), presign URL signing, HEAD confirm → stored, signed GET, signed DELETE → row dropped, stale-pending sweep; **live real-B2 upload BLOCKED on B2 keys** (honest `not_configured`, never a fake upload) |
| Upload limits & byte quota (settings-driven 10/20 MB, plan byte quota)                     | TESTED — 413 `file_too_large`, 400 `unsupported_file` (extension allow-list), 400 `quota_exceeded` vs plan storage; limits served from `uploads.limits` setting                                                                                                |
| Conversation history (persist after settlement, append, search, pin, rename, delete)       | TESTED — route tests (auto-create on first delivered turn, `done.conversationId`, 404 cross-user, LIKE-escaped search, explicit message delete) + live e2e list/title/tool/msgs                                                                                |
| System-prompt governance (Core Safety → Tool → approved memories)                          | TESTED — injection tests: memory NOT present before approval, present after approve, absent when disabled; tool id → server-owned instructions; 20×600-char cap                                                                                                |
| Smart Memory (opt-in, approve-to-save)                                                     | TESTED — model-sourced rows start `suggested`; manual rows `approved`; approve/reject/enable/disable/delete-all routes + account Memory page                                                                                                                   |
| AI Study / Coding / Writing / Documents / Tools                                            | IMPLEMENTED — server instruction sets + Tools gallery (`?tool=` preset → chat → persisted on conversation); Chat/History badge shows active tool                                                                                                               |
| Prompt library (user)                                                                      | TESTED — CRUD + cross-user 404 tests + workspace Library page (create/edit/copy/delete)                                                                                                                                                                        |
| Chat upgrades: markdown renderer, thread resume, export, save-to-memory, image attachments | IMPLEMENTED — fenced code + copy, `?c=` thread open from History, .md export, save reply → suggested memory, image attach via presign→PUT→confirm→signed URL; vite module smoke + proxy chain                                                                  |
| Account Storage page (upload/usage/download/delete)                                        | IMPLEMENTED — renders usage bar, upload flow (works when B2 configured), honest `not_configured` panel otherwise                                                                                                                                               |
| PDF page-count (50 pp) + document-chat ingest                                              | PLANNED — DEFERRED: `files.page_count` column exists but page counting/ingest not wired; per-file 50-page rule NOT yet enforced (limit value is stored + served)                                                                                               |
| Admin Global governance layer                                                              | PLANNED (Phase 6 — hierarchy Core → Tool → Prefs today, Admin Global slots above Tool then)                                                                                                                                                                    |

## PHASE 5 — Teams — slice 1 (core) SHIPPED

Gates: lint 0 · typecheck 0 · **180/180 tests (21 new)** · build 0 · live e2e on wrangler :8787.

| Feature                                                                                   | Status                                                                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Migration 0005 (teams, members, custom roles, invites, 30-day activity log)               | TESTED — harness applies every migration dynamically; live `wrangler d1 migrations apply --local` 0001–0005 all ✅                |
| Team CRUD + slug, plan entitlement (max_teams_per_account), 5-teams/account cap           | TESTED — personal plan → 403 `plan_not_entitled`; 6th team → 403 `team_limit_reached`; owner membership + `team.created` activity |
| Membership roles (owner/admin/member/viewer) + server-side permission enforcement         | TESTED — viewer/member denied rename/invite/remove/role-change; owner untouchable; 404 hides team existence from non-members      |
| Invites: link / email / @username + accept flow                                           | TESTED — targeted invites match the signed-in account (403 mismatch), 7-day expiry (410), revoke (410), duplicate 409, reuse 409  |
| Member cap (30/team, plan-driven, re-checked at accept)                                   | TESTED — invite + accept both blocked with 403 `member_limit_reached`                                                             |
| Custom roles (exact permission lists; owner-only perms ungrantable)                       | TESTED — custom set replaces built-in; role delete falls members back to built-in safely                                          |
| Role changes, removal, self-leave, ownership transfer                                     | TESTED — no self-role-change, owner cannot leave/be removed, transfer swaps owner→admin                                           |
| Module toggles (10 owner-toggleable modules)                                              | TESTED — GET merged defaults, PUT validated against TEAM_MODULES, `team.modules.manage` enforced                                  |
| Team activity log (30-day retention, swept inline)                                        | TESTED — old rows purged on read; actor username joined                                                                           |
| Free plan self-selection (PATCH /me planId: personal↔teams; student/enterprise excluded)  | TESTED — `plan_not_selectable` for verification-gated / contact-sales plans                                                       |
| Workspace Teams UI (list, create, rename, members, invites, modules, activity, join link) | IMPLEMENTED — permission-aware buttons driven by server-reported `myPermissions`; EN/VI i18n; vite smoke + build pass             |
| Projects (Kanban/List/Calendar/Timeline)                                                  | PLANNED (slice 2)                                                                                                                 |
| Tasks + assignments                                                                       | PLANNED (slice 2)                                                                                                                 |
| Channels (text/announcements/AI), threads, mentions, reactions, pins                      | PLANNED (slice 3)                                                                                                                 |
| Voice/video messages (≤5 min, quota-counted)                                              | PLANNED (slice 3)                                                                                                                 |
| Team documents / shared files (B2 team bucket wiring)                                     | PLANNED (slice 3 — `files.scope='team'` column already shipped in 0004)                                                           |
| Team calendar, automations WHEN/IF/THEN + logs, AI-suggested automations                  | PLANNED (later slices)                                                                                                            |

## PHASE 6 — Admin, Governance, Verification, Trust & Safety — slice 1 (admin platform) SHIPPED

Gates: lint 0 · typecheck 0 · **202/202 tests (16 new Phase 6)** · full 5-SPA build 0.

| Feature                                                         | Status                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin auth — separate better-auth instance (`/api/admin-auth`, `conai_admin` cookies, sign-up disabled) | TESTED — user-plane cookie rejected with 401 on admin routes; self-serve admin sign-up refused; Owner bootstrap from `ADMIN_OWNER_EMAILS` audited                                          |
| Admin MFA (TOTP RFC 6235 + 10 backup codes, mandatory)          | TESTED — enable→verify→confirm flow; all admin routes except /me return `mfa_required` pre-enrollment; second sign-in requires TOTP; lockout/attempt handling inherited from better-auth              |
| Admin roles & custom permissions (6 roles, 23 permissions)      | TESTED — server-side `adminCan` on every route; moderator matrix enforced (403 on settings/grants); custom-permission JSON overrides supported; only Owner grants/revokes Owner; last-Owner/self guards |
| Admin modules — 5 of 16 live (Dashboard, Users, Admins, Audit, Settings) | IMPLEMENTED — real D1 data, EN/VI i18n, permission-filtered nav; remaining 11 render honest "not implemented" placeholders (no fake controls)                                          |
| User lock/unlock (ban) + audit trail                            | TESTED — banned users blocked from new sessions on BOTH auth planes; every mutation writes an immutable `admin_audit_log` row (actor, action, target, metadata, IP)                                  |
| Platform settings editor (allowlisted `platform_settings` keys) | TESTED — unknown keys rejected 400, valid JSON objects upserted and audited                                                                                                                            |
| Migration 0006 (admin_members, admin_audit_log, twoFactor, user flags) | TESTED — applied dynamically by the harness; required before deploy (see `docs/ADMIN.md`)                                                                                                     |
| Student verification workflow + protected docs                  | PLANNED (BLOCKED on B2 for docs)                                                                                                                                                                        |
| AI Governance (policies, versions, rollback, playground, audit) | PLANNED                                                                                                                                                                                                 |
| Referral system (anti-abuse, atomic rewards)                    | PLANNED                                                                                                                                                                                                 |
| Trust Center pages + reports/enforcement/appeals                | PLANNED                                                                                                                                                                                                 |
| Audit log 90-day retention cleanup cron                         | PLANNED (table + writes shipped; cron lands with Phase 8 status/scheduled work)                                                                                                                         |

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
