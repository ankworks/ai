# ConAI — Free-Tier Strategy & Limits

Target: **zero-cost infrastructure where realistically possible.** No credit cards, no
silently introduced paid services. If something cannot run on a free tier, it is listed here
with a **free-compatible alternative**.

> **Verification status:** the build sandbox can only reach the npm/GitHub registries, so
> vendor pricing/limit pages could **not** be fetched on 2026-10-17. Every number below is
> marked `VERIFY` and must be re-checked from a normal network before launch
> (Phase 8 hardening). Any confirmed deviation must be updated here — do not discover
> limits in production.

## 1. Service budget

| Service                         | Free-tier plan (VERIFY)                                                                          | ConAI usage                                                            | Risk / mitigation                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Workers Free**     | ~100k requests/day, ~10 ms CPU/req                                                               | API + asset serving; SSE streams count per request                     | AI streams dominate; per-user concurrency caps; status page is thin                                                                                                                                                                                                                                                                                    |
| **Workers Static Assets**       | Included with Workers (VERIFY)                                                                   | 5 SPAs                                                                 | Trivial bandwidth on CF free (unlimited reqs served by assets? VERIFY)                                                                                                                                                                                                                                                                                 |
| **Cron Triggers**               | Allowed on free (count limit, VERIFY ~few schedules)                                             | daily refill audit @00:00 UTC, status probes @5 min, retention cleanup | merge schedules into 1–2 cron handlers if limited                                                                                                                                                                                                                                                                                                      |
| **Cloudflare D1 Free**          | ~5M rows read/day, ~100k rows written/day, ~5 GB storage (VERIFY)                                | all relational data                                                    | keep ledger writes batched per request; index-heavy reads; alert if close                                                                                                                                                                                                                                                                              |
| **Cloudflare KV Free**          | ~100k reads/day, ~1k writes/day, ~1k deletes/day, 1 GB (VERIFY)                                  | cache, rate-limit counters, status probes                              | **writes are the scarce resource** → rate-limit counters use coarse TTL buckets, probe results keyed per component (6 keys/5 min ≈ 1.7k/day → slightly over 1k/day ⇒ probes every 10 min on free plan or store probes in D1 — decision: store probe history in D1, KV only latest per component ≈ 1.7k/day, adjust interval if VERIFY confirms 1k cap) |
| **Cloudflare Turnstile Free**   | Unlimited (VERIFY)                                                                               | signup/reset forms                                                     | test keys must never ship                                                                                                                                                                                                                                                                                                                              |
| **Backblaze B2 Free**           | 10 GB storage, free egress up to ~3× stored/day, ~2500 Class A txns/day (VERIFY)                 | files: personal/teams/verification/temp/public                         | assume **one shared allowance across buckets** (extra buckets ≠ extra free space); enforce per-user quotas; temp files TTL-deleted by cron                                                                                                                                                                                                             |
| **Ollama Cloud free allowance** | available allowance (VERIFY, account-specific)                                                   | AI inference                                                           | sparks budgeting + model routing keeps within allowance; if exhausted → honest degraded state on status page, not silent failure                                                                                                                                                                                                                       |
| **Email sending**               | MailChannels free for own domain on CF (VERIFY, may have changed), or Resend free 3k/mo (VERIFY) | verification, resets, invites                                          | if neither viable: **mailbox-based dev fallback** logs tokens locally in dev; prod blocked until one provider chosen                                                                                                                                                                                                                                   |
| **Web Push**                    | free (self-hosted VAPID, no push service cost; browser push services are free)                   | notifications                                                          | VAPID keys generated per deploy                                                                                                                                                                                                                                                                                                                        |
| **Search API**                  | Brave free 2k/mo / Serper 2.5k/mo (VERIFY)                                                       | web search                                                             | low volume until Phase 7; cache results in D1 to save quota                                                                                                                                                                                                                                                                                            |
| **OAuth providers**             | free app registrations                                                                           | login providers                                                        | no cost, requires setup (`docs/MISSING_CREDENTIALS.md`)                                                                                                                                                                                                                                                                                                |

## 2. Deliberate non-goals (free-tier compatible)

- **No paid DB/queue/CDN vendor lock-in** — D1 + KV + cron cover persistence, cache, jobs.
- **No R2** (not needed; B2 already provides storage).
- **No Workers Paid** (10 ms CPU budget is enough — streaming is I/O-bound; provider calls
  happen outside CPU time).
- **No per-seat charges anywhere** — every plan in the product is free by design.

## 3. Features that hit free-tier ceilings (documented alternatives)

| Feature                                  | Ceiling hit                      | Free-compatible alternative chosen                                                         |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| Deep research jobs (long-running)        | Worker CPU/time limits           | job rows in D1 + cron resumption (already the design), small step size per tick            |
| Real-time team presence                  | KV write churn                   | poll-based presence (60 s) instead of KV-per-keystroke                                     |
| Status probes every 5 min × 6 components | KV 1k writes/day                 | probe history in D1; KV holds only latest snapshot; fall back to 10-min interval           |
| Voice/video message transcoding          | no free transcode service        | store original when ≤ 5 min & ≤ configured size; no transcoding (client records webm/opus) |
| Email at volume                          | provider free caps               | transactional-only emails (verify/reset/invite); no marketing email                        |
| E2E browser testing in CI                | Playwright browser download size | run on demand / local; CI runs lint+typecheck+unit+build first                             |

## 4. Rules for contributors

1. Never add a dependency/service with a paid default path without documenting it here.
2. Every new hard limit discovered → update this table and `PROGRESS.md`.
3. When a free tier is exceeded in production, the status page must show **Degraded** —
   never fail silently.
