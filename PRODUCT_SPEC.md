# ConAI — Product Specification

Authoritative, condensed product spec. Implementation status lives in [`PROGRESS.md`](./PROGRESS.md).
Anything not marked `IMPLEMENTED`/`TESTED` there does not work yet.

## 1. Brand identity

- **Name:** ConAI · **Domain:** `conai.dpdns.org` (nested subdomains pending DNS verification)
- **Colors:** Primary Violet `#7C3AED` · Deep Indigo `#4338CA` · Soft Lavender `#A78BFA` ·
  Background `#F8F9FC` · Surface `#FFFFFF` · Text `#18181B`
- **Type:** Plus Jakarta Sans (headings), Inter (body), JetBrains Mono (code)
- **Logo:** geometric C enclosing a four-pointed spark (temporary vector until official SVG)
- **Direction:** Premium modern EdTech SaaS — Linear's precision, Notion's simplicity,
  Apple's refinement, EdTech friendliness. Generous whitespace, no overcrowded dashboards,
  no dark sidebars in light mode, no excessive gradients.
- **Themes:** Light (default), Dark, System. Personalization: font size, reduced motion,
  compact mode, collapsible sidebar, EN/VI UI (English default).

## 2. Application areas

1. **Public Website** — marketing, plans, trust links.
2. **AI Workspace** — Home, Chat, Study, Coding, Writing, Documents, Tools, Library,
   History, Teams.
3. **Account Platform** — see §9.
4. **Administration** — separate app, separate sessions, MFA, strict server-side authz.
5. **Status Page** — real monitoring data only.

Rules: no fake functional buttons; no placeholder APIs in completed features; no credentials
in the browser.

## 3. Technology

React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + shadcn-style UI + Lucide + Motion +
React Router 7 + TanStack Query 5 + Zustand + Recharts + Monaco · Cloudflare Workers +
Hono 4 + D1 + KV · Backblaze B2 (S3 API) · Ollama Cloud first with multi-provider adapters ·
Cloudflare Turnstile · Workers Static Assets. **No Node.js APIs in the Workers runtime.**

## 4. Authentication

Email/password + verification, password reset, Google/Microsoft/GitHub OAuth, OIDC SSO,
account linking, session management, device management, `@username`, admin MFA, trusted
admin devices. Established Workers-compatible library (better-auth + D1 adapter). Secure
password hashing, HttpOnly/Secure cookies, CSRF on state-changing requests, OAuth
state + PKCE. **No auto-merge of accounts on matching email.** Multi-device login allowed.
One-registration-per-device is a best-effort goal (fingerprinting cannot guarantee it) —
implemented via privacy-conscious anti-abuse: email verification, Turnstile, rate limits.
No permanent blocks based on IP alone.

## 5. Plans

| Plan       | Price   | Sparks/day         | Storage            | Notes                            |
| ---------- | ------- | ------------------ | ------------------ | -------------------------------- |
| PERSONAL   | Free    | 500                | 500 MB personal    | default after registration       |
| STUDENT    | Free    | 700                | 1 GB personal      | manual verification required     |
| TEAMS      | Free    | 1000               | 2 GB shared / team | 30 members/team, 5 teams/account |
| ENTERPRISE | Contact | Owner-configurable | Owner-configurable | —                                |

Configurable from Admin. No payments, no credit cards, no Sparks purchasing.

## 6. Sparks engine

- **One unified wallet per user.** Team membership never creates extra wallets.
- **Daily refill = TOP-UP at 00:00 UTC:** `new = max(current, daily_limit)` using the
  **highest eligible** entitlement; never stack. Examples: 700/1000 → 1000; 1200/1000 → 1200.
- **Cost from token usage:** reference **100 equivalent tokens = 1 Spark**, with configurable
  input/output weights, model multipliers, vision usage, search ops, deep-research ops.
- **Lifecycle:** atomic operations, append-only transaction ledger, request idempotency,
  usage reservation → settlement → refund of unused reserve, full refund on failed requests.
- **Clients never dictate balances.**

## 7. AI Gateway

Provider-independent. Initial provider: Ollama Cloud. Streaming (SSE), conversation history,
model selection, **ConAI Auto routing** + manual choice, model registry, capability
detection, typed error handling, controlled fallback, token usage tracking, Sparks
accounting. Provider keys are platform-Owner-managed server-side env secrets; admin manages
availability/pricing/routing; multiple credentials allowed for rotation/HA only (no quota
evasion).

## 8. AI Governance

Global instructions, safety policies, Should Do / Should Not Do rules, personality,
per-tool instructions, prompt library, draft→publish, version history, rollback, testing
playground, audit logs. Hierarchy: **Core Safety → Admin Global → Tool → User Preferences →
User Request**, enforced in backend code.

## 9. Account platform sections

Overview · Profile · Security · Devices · Connected Accounts · Plans · Sparks · Referrals ·
Storage · AI Memory · Preferences · Notifications · Student Verification.
Username format `@username`. Flow: **Account Setup → Workspace**; Personal is default; no
plan forced during registration.

**Smart Memory:** opt-in; AI suggests; user approves before save; view/edit/delete/disable/
delete-all; never auto-shared with Teams.

## 10. Workspace

- **Home (minimal):** welcome heading, AI Composer, quick actions, recent conversations.
  No analytics-chart overload.
- **Chat:** classic layout; AI messages as readable markdown; user messages in subtle
  lavender bubbles; in-app composer. Markdown, code blocks, LaTeX, streaming, copy,
  regenerate, edit message, stop generation, history search, pin, export.

## 11. File storage

Backblaze B2 for files, D1 for metadata, KV for cache. Per AI message: **2 images,
2 documents, 50 PDF pages**; **10 MB/image, 20 MB/document** (all configurable). Private
files, personal library, team shared files, download, preview, search, delete, permissions.
Private buckets split: personal / team / verification / temp / public. Do not assume extra
buckets increase the free allowance.

## 12. Teams

Notion-style docs + Linear-style projects + Discord-style channels + AI collaboration.
Limits: 30 members, 5 teams/account, 2 GB/team storage. Invites: link, email, @username.
Roles: Owner, Admin, Member, Viewer, Custom — fine-grained permissions, server-enforced.
Owner-toggleable modules: Overview, Projects, Tasks, Channels, Documents, Calendar,
Activity, Members, Automations, Settings. Project views: Kanban, List, Calendar, Timeline.
Channels: text, announcements, AI. Threads, mentions, reactions, pins, voice + video
messages (**≤ 5 min**), media counts toward team quota. **AI in Teams spends the calling
user's Sparks.**

## 13. Automations

`WHEN → IF → THEN` no-code rules (e.g. task completed → notify channel; deadline soon →
notify assignee; member joins → welcome). Rule editor, enable/disable, execution logs,
loop protection, permission checks, rate limits. AI may suggest a configuration; **explicit
confirmation required before activation**.

## 14. Calendar

ConAI Calendar, Google Calendar, Microsoft Outlook, ICS import/export. Begin one-way sync,
minimal OAuth scopes, disconnect anytime.

## 15. Student verification

Submit → Pending Review → Admin Review → Approved / Rejected / More Info. Documents
protected (private bucket, reviewer-scoped access), deletion & re-verification policies.

## 16. Referrals

Every user gets a referral code + link. Rewards to both sides **after successful
verification and anti-abuse checks**; amounts configurable; no self-referral; no duplicate
rewards; atomic Sparks transactions.

## 17. Admin system

Roles: Owner, Administrator, Moderator, Student Reviewer, AI Manager, Support Agent + custom,
fine-grained. Modules: Dashboard, Users, Student Verification, Teams, AI Providers, AI Models,
API Credentials, Sparks, Referrals, Storage, AI Governance, Trust & Safety, Reports,
Maintenance, Notifications, Audit Logs, Settings. MFA required; trusted devices; Emergency
Lockdown; secure recovery; **only Owner grants Owner**.

## 18. Audit & retention

Team activity: **30 days**. Admin audit: **90 days**. Scheduled cleanup. Never log
passwords, API keys, session tokens, or sensitive secrets.

## 19. Notifications

In-app center. Web Push for: AI completion (opt-in), team invitations, mentions, task
assignments, important announcements, team messages (when enabled). Preferences + quiet
hours. **No marketing push.** Browser permission prompts only after explicit user action.

## 20. Web search & Deep research

Pluggable Search Gateway (configurable provider): web search, real citations, source URLs,
timestamps, usage tracking. **Never fabricate citations.**
Deep research: planning, multi-source search, progress tracking, source analysis, structured
reports with citations, export, save to Library, resumable jobs, configurable Sparks budget.

## 21. Status page

Components: AI Services, Authentication, Workspace, Teams, Database, Notifications.
States: Operational, Degraded, Partial Outage, Major Outage, Maintenance. Incident history,
scheduled maintenance, health monitoring, announcements — **must reflect actual monitoring
data** (unknown components display as unknown until probed).

## 22. Trust & safety

Public Trust Center: privacy info, AI safety info, community guidelines, report abuse,
appeals, transparency info. Admin moderation: reports, review queue, enforcement actions,
appeals, safety events. Respect user privacy.

## 23. Constraints

Free-tier first (see `docs/FREE_TIER.md`), no credit cards, no silently introduced paid
services — unimplementable-on-free features get documented limitations + free alternatives.
Strict TypeScript, validated inputs, server-side authz, migrations, loading/error states,
responsive, accessible, no hardcoded secrets, no faked integrations, meaningful tests,
environment-variable configuration, documented deployment. **No production deployment
without explicit authorization.**
