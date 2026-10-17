# ConAI — Missing Credentials & Services

Nothing in this list exists yet. Each row names what it unblocks and where to put it.
**Never commit real values** — Worker secrets go in `wrangler secret` / `apps/api/.dev.vars`
(git-ignored); frontend build vars are public `VITE_*` only.

| #   | Credential / service                                                                | Unblocks                                             | Phase | Where configured                                                                    | Status                                                          |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **Cloudflare account + API token** (Workers, D1, KV, Assets)                        | any local `wrangler` remote op, staging/prod deploys | 2/8   | `CLOUDFLARE_API_TOKEN` env / `wrangler login`                                       | MISSING                                                         |
| 2   | **DNS zone `conai.dpdns.org`** incl. nested records (or confirm path mode)          | subdomain routing, real domain launch                | 8     | DNS provider panel                                                                  | MISSING — see `DNS_AND_ROUTING.md`                              |
| 3   | **Backblaze B2 bucket(s) + application key** (S3 API)                               | file uploads, verification docs, library             | 4     | `B2_ENDPOINT/B2_BUCKET_REGION/B2_APP_KEY_ID/B2_APP_KEY` (Worker secrets)            | MISSING                                                         |
| 4   | **Ollama Cloud API key**                                                            | real AI responses, chat, everything Phase 3          | 3     | `OLLAMA_API_KEY` (Worker secret)                                                    | MISSING                                                         |
| 5   | **Turnstile site + secret key** (per hostname)                                      | signup/reset bot protection                          | 2     | `TURNSTILE_SITE_KEY` (public, per app), `TURNSTILE_SECRET_KEY` (secret)             | MISSING (dev can use test keys locally only)                    |
| 6   | **Google OAuth** client id/secret                                                   | Google login, later Google Calendar                  | 2/7   | `GOOGLE_CLIENT_ID/SECRET`                                                           | MISSING                                                         |
| 7   | **Microsoft OAuth** client id/secret                                                | Microsoft login, Outlook calendar                    | 2/7   | `MICROSOFT_CLIENT_ID/SECRET`                                                        | MISSING                                                         |
| 8   | **GitHub OAuth** client id/secret                                                   | GitHub login                                         | 2     | `GITHUB_CLIENT_ID/SECRET`                                                           | MISSING                                                         |
| 9   | **OIDC SSO** (generic provider) config                                              | enterprise SSO login                                 | 2     | `OIDC_ISSUER/CLIENT_ID/SECRET` (optional until needed)                              | OPTIONAL                                                        |
| 10  | **Email delivery** (MailChannels via CF, or Resend free tier — VERIFY availability) | verification emails, resets, invites                 | 2     | `EMAIL_FROM`, provider API key                                                      | MISSING — dev fallback: logged tokens in local `.dev.vars` mode |
| 11  | **Search API key** (Brave/Serper/Tavily — pick one)                                 | web search citations, deep research                  | 7     | `SEARCH_API_KEY` + `SEARCH_PROVIDER`                                                | MISSING                                                         |
| 12  | **VAPID key pair** (self-generated, free)                                           | Web Push                                             | 7     | `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY` (generate: `npx web-push generate-vapid-keys`) | PENDING (generate at Phase 7)                                   |
| 13  | **Session signing secret** (`SESSION_SECRET`, ≥ 32 random bytes)                    | cookie/CSRF signing                                  | 2     | Worker secret                                                                       | PENDING (generate at Phase 2, never commit)                     |
| 14  | **Platform encryption key** (`PLATFORM_ENC_KEY`)                                    | encrypting stored OAuth/provider metadata            | 2/3   | Worker secret                                                                       | PENDING                                                         |

## Owner onboarding checklist

1. Create accounts: Cloudflare, Backblaze B2, Ollama Cloud (verify free allowance),
   Google/Microsoft/GitHub developer consoles, DNS provider.
2. Create the DNS zone + verify nested subdomains (or declare path mode).
3. Fill `apps/api/.dev.vars` locally from the example file (placeholders only in git).
4. Put remote secrets with `wrangler secret put …` before first staging deploy.
5. Update statuses in this file and `PROGRESS.md` as each credential lands.

> Credential intake is a **launch blocker** for the phases named above; until then those
> features remain `PLANNED`/`BLOCKED` — never `IMPLEMENTED`.
