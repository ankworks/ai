# ConAI — DNS & Routing

## 1. Verified DNS state (2026-10-17, from build sandbox)

| Name                  | Result                            |
| --------------------- | --------------------------------- |
| `dpdns.org`           | resolves → `142.171.123.133`      |
| `www.dpdns.org`       | `SERVFAIL` (no usable record)     |
| `conai.dpdns.org`     | **no records** (zone not created) |
| `app.conai.dpdns.org` | **not found**                     |

**Conclusion:** the target zone does not exist yet. Whether the DNS provider supports
creating `conai.dpdns.org` **and nested records** (`app.`, `account.`, `admin.`, `api.`,
`status.`) — i.e. a delegated sub-zone or wildcard `*.conai.dpdns.org` — **cannot be
verified until someone with an account creates it.** This is tracked as `BLOCKED` in
`PROGRESS.md`.

### Verification checklist (run before choosing a mode)

```bash
# 1. create conai.dpdns.org (A/CNAME or NS delegation) in the provider panel, then:
dig conai.dpdns.org +short
# 2. create a nested test record, then:
dig app.conai.dpdns.org +short     # if empty → nested subdomains unsupported
dig '*.conai.dpdns.org' +short      # try wildcard
```

If nested/wildcard records work → **subdomain mode**. If only the apex works → **path mode**.

## 2. Two supported routing modes

ConAI is configured, not coded, for either mode. The mode is chosen by environment
variables on both the Worker and the frontend builds.

### Mode A — subdomain (target)

```
conai.dpdns.org        → apps/web assets        (Worker route)
app.conai.dpdns.org    → apps/workspace assets
account.conai.dpdns.org→ apps/account assets
admin.conai.dpdns.org  → apps/admin assets
status.conai.dpdns.org → apps/status assets
api.conai.dpdns.org    → apps/api (Hono)
```

- API origin: `https://api.conai.dpdns.org` → frontend `VITE_API_BASE_URL`.
- Auth cookie: set by API with `Domain=.conai.dpdns.org; Secure; HttpOnly; SameSite=Lax`
  so `app.`/`account.` share the session; **admin uses a separate cookie name**, also
  domain-scoped but rejected by user-plane handlers.
- CORS allowlist: the five app origins.

### Mode B — path (fallback, fully supported)

Single Worker on whatever hostname the free DNS gives us (e.g. `conai.dpdns.org`):

```
/          → web          /app       → workspace
/account   → account      /admin     → admin
/status    → status       /api/v1    → api
```

- API origin: same host → frontend `VITE_API_BASE_URL=/api` (Vite dev proxies `/api` → `:8787`).
- Cookie: host-only, `__Host-conai_session` prefix rules.
- CORS: same-origin, minimal.

### Configuration switch

| Variable            | Where               | Values                                                |
| ------------------- | ------------------- | ----------------------------------------------------- |
| `ROUTING_MODE`      | API worker env      | `subdomain` \| `path`                                 |
| `ALLOWED_ORIGINS`   | API worker env      | CSV of app origins                                    |
| `VITE_API_BASE_URL` | each frontend build | `https://api.conai.dpdns.org` or `/api`               |
| `VITE_BASE_PATH`    | each frontend build | `""` or `/app` etc. (path mode)                       |
| `VITE_*_URL`        | cross-app links     | full origins in subdomain mode; relative in path mode |

All of these are **read from config** — no code assumptions about the domain shape.

## 3. Cloudflare-side notes

- If the zone is on Cloudflare: point the provider's NS delegation at Cloudflare, or use
  CNAME/ANAME flattening where the free DNS only allows CNAMEs (apex CNAME flattening is a
  Cloudflare feature — if `dpdns.org` is NOT on Cloudflare, apex must be A-record based).
- Workers custom domains (`workers.dev` alternative) attach per-route; in path mode a single
  `custom_domain` suffices.
- Turnstile hostname list must include whichever hostnames actually serve forms.

## 4. Decision record

| Date       | Decision                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-17 | Ship **both** modes in config; default local dev = path mode (Vite proxy). DNS verification = launch blocker for subdomain mode only. |
