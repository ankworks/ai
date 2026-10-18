# ConAI — Security

Threat model and controls for ConAI. Security is enforced **in backend code**; prompts are
never a security boundary. This document is updated as phases land — see [`PROGRESS.md`](./PROGRESS.md).

## 1. Assets & adversaries

| Asset                       | Why it matters                     |
| --------------------------- | ---------------------------------- |
| Provider API keys (Ollama…) | Platform-wide abuse, cost, quota   |
| Session cookies             | Full account takeover              |
| Sparks wallets/ledger       | Economic integrity of the platform |
| User files (B2)             | PII, verification docs, team IP    |
| Admin sessions + MFA seeds  | Platform takeover                  |
| OAuth client secrets        | Identity provider takeover         |

Adversaries: anonymous internet, authenticated malicious users, compromised user devices,
malicious team members, supply-chain (deps), and insider admin misuse (mitigated by audit logs).

## 2. Authentication controls

- **Library:** better-auth **1.7.10 with its native D1 binding** (`database: env.DB` — built-in
  D1 dialect, batch-based writes). Password hashing is scrypt via `@better-auth/utils`; on
  Workers the `workerd` export condition resolves to `node:crypto` scrypt and requires the
  **`nodejs_compat` compatibility flag** (declared in `apps/api/wrangler.jsonc`). **Verified on
  workerd:** sign-up hashes (161-char scrypt digest) and sign-in verifies end-to-end in the
  local Workers runtime; the PBKDF2 fallback is NOT needed.
- **Email/password:** min length enforced server-side (≥ 10), breach/weak-password checks,
  email verification required before privileged actions, password reset with single-use,
  short-TIME-to-live tokens delivered only via email (never in responses/logs).
- **OAuth (Google/Microsoft/GitHub/OIDC):** `state` + PKCE (`S256`) validated server-side;
  redirect URIs allowlisted per provider; tokens stored encrypted-at-rest (Worker env key) or
  never persisted when only identity is needed.
- **Account linking:** explicit flow initiated by a signed-in user, provider email must be
  verified **and** ownership proven by the provider — matching email alone never links or
  merges accounts.
- **Sessions:** `HttpOnly; Secure; SameSite=Lax`, server-side rotation on privilege change,
  idle + absolute expiry, revocation ("sign out this device"), per-device inventory.
  Cookie names: `conai.session_token` (HttpOnly user sessions, prefix `conai` — never
  readable by JS) alongside the non-HttpOnly double-submit `conai_csrf`. Admin sessions (Phase 6)
  run a **separate better-auth instance** with prefix `conai_admin` → `conai_admin.session_token`,
  so an admin cookie cannot authenticate user-plane routes (and vice versa).
- **Admin MFA:** TOTP (RFC 6238), enforced before any admin route; recovery codes shown once,
  stored hashed; trusted devices (hashed device key, 30-day expiry) can skip MFA only from the
  same device fingerprint class; MFA seed never logged.
- **Emergency Lockdown:** KV flag `admin:lockdown` → all admin sessions rejected except Owner
  authenticated with recovery code. Recovery runbook: §7.

## 3. Request integrity (CSRF & origins)

- All non-GET API requests require **both** a strict `Origin`/`Referer` match against the
  configured app origins **and** a double-submit CSRF token (readable cookie ↔ `X-CSRF-Token`
  header, random ≥ 128-bit, rotated on session change).
- better-auth endpoints (`POST /api/auth/sign-up|sign-in|forgot-password`) additionally verify
  **Turnstile** server-side via the built-in captcha plugin (`x-captcha-response` header →
  Cloudflare `siteverify`, secret never leaves the Worker), active only when
  `TURNSTILE_SECRET_KEY` is set.
- CORS is explicit (allowlist); credentials only from allowlisted origins; no `*` with
  credentials.

## 4. Authorization

- Every route declares its policy: `public | authenticated | admin(role/permission) | team(role)`.
- **Server-side checks only** — UI hiding is cosmetic. Team permissions come from
  `packages/permissions` (pure, unit-tested); admin permissions likewise. Row-level scoping is
  mandatory in queries (`WHERE user_id = ?` / via membership join).
- Only Owner can grant Owner; permission escalation attempts write audit events.

## 5. Sparks & economic integrity

- Balances are **never** read from client payloads; mutations reload the wallet row in a D1
  transaction with optimistic `version` CAS.
- Append-only ledger; every mutation ties to `request_id` (UNIQUE) for idempotent replays.
- Reserve → settle → refund lifecycle guarantees over-holds are returned and failures release
  the full hold. Budget checks happen **before** provider calls.
- Admin adjustments require a reason and are ledgered (`admin_adjust`), actor audited.

## 6. Rate limiting & anti-abuse

- KV sliding-window counters keyed by `route + ip-prefix + identifier` (e.g. email hash) with
  exponential backoff; sensible defaults (auth attempts, send-email, AI requests, upload).
- **No permanent block on IP alone** — IP signals raise friction (Turnstile, delays), never
  lifetime bans; shared NAT (schools) must not be bricked.
- Device-registration limit is best-effort: salted, periodically rotated fingerprint hint +
  email verification; documented to users as heuristic, privacy-conscious (no canvas/WebGL
  cross-site tracking, raw fingerprints never stored).
- Output side: per-user AI concurrency cap; automation execution rate limits; push quota caps.

## 7. Secrets & key management

- **No secret ever reaches frontend code** — only `VITE_*` public config at build time.
- Provider keys/OAuth secrets/VAPID/B2 keys live in Worker environment variables
  (`wrangler secret`), injected at runtime; `.dev.vars` is git-ignored with a committed
  `.dev.vars.example` containing placeholders only.
- Admin UI shows key **metadata only** (last4, provider, createdAt) — full values are
  write-only (set/replace), never readable.
- Log redaction: structured logger strips/masks `password|token|secret|authorization|
cookie|api[-_]?key` before serialization (§9).

**Recovery runbook (lost/compromised Owner):** 1) Owner uses printed recovery codes → MFA
reset; 2) if codes lost: signed Git commit + registrar access to the domain proves control —
support verifies domain control (DNS TXT challenge) then rotates session signing key
(`SESSION_SECRET`) invalidating all sessions, then re-grants Owner (fully audited). If
lockdown stuck: same DNS challenge path sets `admin:lockdown=0` via a one-time CLI script
that requires a freshly rotated session secret.

## 8. Data protection

- **Transport:** HTTPS only, HSTS on deployed domains, `Secure` cookies.
- **At rest:** B2 private buckets; verification docs in an isolated bucket with
  reviewer-scoped access only (download URLs short-TTL, presigned via Worker after authz);
  KV/D1 rely on Cloudflare's at-rest encryption — no additional PII in KV beyond hashed
  identifiers where possible.
- **Browser hardening headers** (set by API/asset Worker): `Content-Security-Policy`
  (no inline scripts in prod; `frame-ancestors 'none'` except OAuth embeds), `X-Content-Type-
Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` minimal, `X-Frame-Options: DENY` (status page may allow same-origin).
- **PII minimization:** logs carry ids, not emails where avoidable; emails hashed in
  rate-limit keys; audit rows redact free-text content.

## 9. Logging & audit

- Admin audit: actor, action, target, result, ip-prefix, request id, timestamp — 90 days.
- Team activity: 30 days. Both cleaned by scheduled cron.
- **Never logged:** passwords, password hashes, API keys, session/CSRF tokens, OAuth codes/
  tokens, MFA seeds, presigned URL signatures. Enforced by redaction helper + lint rule list
  in `packages/shared` (`redact()`), covered by unit tests.

## 10. Input validation & injection

- Every external input validated with `zod` at route boundaries (body, query, params, headers
  where relevant).
- All SQL is parameterized (D1 `bind`); no string-concatenated SQL (lint-restricted).
- File uploads: magic-byte sniffing + extension allowlist + size/page limits checked
  **before** persisting; images re-encoded on preview path where feasible; PDFs page-count
  capped at 50 (configurable); storage filenames are random UUIDs (no user-controlled paths).
- Markdown rendering on client: sanitizer configured (no raw HTML by default in AI output).

## 11. Supply chain

- Pinned versions in lockfile; `npm audit --omit=dev` in CI (Phase 8); minimal dependency
  surface in the Worker (Workers runtime ≠ Node); Renovate-style updates reviewed manually.

## 12. Free-tier specific risks

- Turnstile free plan: fine for launch. KV free (1k writes/day) constrains rate-limit
  counter granularity → coarse buckets, documented in FREE_TIER doc.
- Workers free 100k req/day: status probes every 5 min ≈ 288/day (trivial), AI streaming is
  the dominant cost — per-user concurrency caps protect the budget.

## 13. Verification status

| Control                        | Status                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSRF + origin middleware       | TESTED — layered: better-auth built-in Origin/Fetch-Metadata + own double-submit on `/api/v1/*`                                                                                                                                             |
| Turnstile server-side verify   | IMPLEMENTED — plugin gated on `TURNSTILE_SECRET_KEY` (site keys pending)                                                                                                                                                                    |
| better-auth hashing on workerd | TESTED — e2e sign-up/sign-in on workerd with `nodejs_compat` (scrypt)                                                                                                                                                                       |
| Rate limiting (KV)             | TESTED — fixed-window unit tests + live 429/`Retry-After` e2e (sign-in 10/300s)                                                                                                                                                             |
| AI provider key isolation      | TESTED — key exists only as a Workers secret/env; unit assert `Authorization: Bearer` appears only on the worker→provider hop; chat answers 503 without it                                                                                  |
| AI chat abuse controls         | TESTED — per-user KV bucket `ai-chat` 30/60s (keyed `u:<userId>`, never IP-only) → 429 + `Retry-After`; body size/message caps; `requestId` replay → 409                                                                                    |
| Sparks economic integrity      | TESTED — reserve BEFORE provider call (402 skips provider entirely); settle/release idempotent; live ledger shows reservation→settlement deltas balance-safe                                                                                |
| Redaction helper + tests       | TESTED — `redactString` unit tests (Phase 1)                                                                                                                                                                                                |
| Security headers middleware    | TESTED — applied post-response so raw better-auth responses are covered                                                                                                                                                                     |
| Admin MFA / lockdown           | PLANNED (Phase 6)                                                                                                                                                                                                                           |
| Image URL SSRF guard           | TESTED — chat image parts accept only inline `data:image/(png\|jpe?g\|webp\|gif);base64` or `https://*.backblazeb2.com`; enforced in the route **before** the Sparks reserve (400, zero ledger rows) and re-checked in the provider adapter |
| File upload controls           | TESTED — extension allow-list (`unsupported_file` 400), settings-driven 10/20 MB caps (413), plan byte quota (`quota_exceeded` 400), `pending` row only counts as storage after server-signed HEAD confirm                                  |
| Presigned URL exposure         | TESTED — presigned GET/PUT only, TTL 600/900 s, signed for the exact key; private buckets; B2 credentials exist only as Workers env (never echoed, never browser-side)                                                                      |
| Pen-test / E2E security suite  | PLANNED (Phase 8)                                                                                                                                                                                                                           |

## 14. File uploads & object storage (Phase 4)

- **Never through the browser directly to credentials:** clients receive only short-lived
  presigned URLs; `B2_APP_KEY_ID` / `B2_APP_KEY` stay server-side env (Workers secrets).
- **Allow-list, not block-list:** extensions come from `IMAGE_EXTENSIONS` / `DOCUMENT_EXTENSIONS`
  in `@conai/storage` (png/jpg/jpeg/webp/gif + pdf/txt/md/doc/docx/csv); unknown types are 400.
- **Quota before signing:** size cap (per kind, from the `uploads.limits` setting) and the plan's
  personal byte quota are checked before any `pending` row or URL exists.
- **Existence proof:** `status` only becomes `stored` after the Worker itself performs a signed
  `HEAD` on B2 — clients cannot fake a completed upload; abandoned `pending` rows are swept after
  1 h and never count toward quota.
- **Download authz:** the signed GET URL is issued by ConAI only after session + owner checks.
- **No SSRF:** chat image parts are fetched by the adapter **only** from `data:` URLs or
  `*.backblazeb2.com` (see §13) — a foreign URL is rejected before any network call.
- Honest degradation: without B2 keys the file routes return `503 not_configured`; the UI shows
  the same fact instead of a working-looking upload.

_No production deployment occurs without explicit authorization._
