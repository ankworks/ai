# ConAI — Admin plane runbook (Phase 6, slice 1)

How the admin system works and the exact dashboard steps to turn it on. No CLI
required — every operational step below is a Cloudflare dashboard or browser action.

## 1. What was built

| Piece | Detail |
| --- | --- |
| Separate auth instance | Admin sessions live under `/api/admin-auth/*` with cookie prefix `conai_admin`. A normal user cookie (`conai.session_token`) can never reach an admin route — the API returns `admin_session_required` (401). |
| No self-serve sign-up | The admin instance has sign-up disabled. Admin accounts exist only via the Owner bootstrap or a grant from another authorized admin. |
| Mandatory TOTP MFA | Every admin must enroll an authenticator app (RFC 6238, 6 digits, 30 s) and receives 10 one-time backup codes. Pre-MFA, every admin API route except `/me` returns `mfa_required` (403). |
| Six roles | `owner`, `administrator`, `moderator`, `student_reviewer`, `ai_manager`, `support_agent` — permission matrix in `packages/permissions/src/admin.ts` (23 `admin.*` permissions), enforced server-side on every request. |
| Owner bootstrap | Emails listed in `ADMIN_OWNER_EMAILS` self-provision the Owner role on first admin sign-in. The event is written to the audit log as `admin.bootstrap`. |
| Audit log | Every admin mutation appends an immutable row to `admin_audit_log` (actor, action, target, JSON metadata, IP, timestamp). |
| User lock/unlock | Locking sets `user.banned = 1`, which blocks all **new** sessions on both the user and admin auth instances. Existing cookies stop working on their next request. |
| Live modules (5/16) | Dashboard, Users, Admins, Audit log, Platform settings. The other 11 modules show an honest "not implemented" placeholder. |

## 2. One-time setup (dashboard only)

### Step 1 — Apply migration `0006_admin.sql`

1. Cloudflare dashboard → **Workers & Pages → D1 SQL Database → `conai`**.
2. Open the **Console** tab.
3. Open `packages/database/migrations/0006_admin.sql`, copy the whole file, paste it
   into the console, and run it. It adds:
   - `banned` and `twoFactorEnabled` columns on `user`,
   - the `twoFactor` table (TOTP secrets + backup codes),
   - `admin_members` (the roster) and `admin_audit_log`.
4. Confirm with: `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('admin_members','admin_audit_log','twoFactor');` — three rows should come back.

### Step 2 — Set the Owner allowlist variable

1. Worker `ai` → **Settings → Variables and Secrets**.
2. Add a plaintext variable (it is an allowlist, not a secret):
   - Name: `ADMIN_OWNER_EMAILS`
   - Value: the Owner email address, e.g. `owner@example.com` (multiple addresses are comma-separated).
3. Save. The Worker picks it up on the next request; no rebuild is needed for variables,
   but a new Workers Build is still required to ship the code itself.

### Step 3 — Create and verify the Owner account

The Owner email must belong to an existing, **verified** ConAI user:

1. Open `https://conai.dpdns.org/account/` and sign up with the exact email from Step 2
   (password ≥ 10 characters, username 3–30 lowercase).
2. Verify the email:
   - with a configured email relay: click the link in the email;
   - without one (dev mode): the verification link is printed in the Worker logs
     (Worker → **Logs**) — rewrite its host to `conai.dpdns.org` before opening.

### Step 4 — First admin sign-in + MFA enrollment

1. Open `https://conai.dpdns.org/admin/` and sign in with the Owner credentials.
2. The app immediately shows the **two-factor setup** screen:
   - copy the manual key (or `otpauth://` URI) into an authenticator app
     (Google Authenticator, Authy, 1Password, etc.);
   - save the 10 backup codes somewhere safe (each works once);
   - enter the current 6-digit code to confirm.
3. The dashboard unlocks. From now on every sign-in requires password **and** TOTP.

## 3. Daily operations

| Task | Where | Required permission |
| --- | --- | --- |
| Search/inspect users, lock or unlock an account | `/admin/` → Users | `admin.users.view` / `.manage` |
| Grant/revoke admin roles (Owner-only for Owner grants) | `/admin/` → Admins | `admin.roles.manage` (+ `admin.grant_owner` for Owners) |
| Review the immutable audit trail | `/admin/` → Audit log | `admin.audit.view` |
| Edit allowlisted platform settings | `/admin/` → Settings | `admin.settings.manage` |
| Platform counts | `/admin/` → Dashboard | `admin.dashboard.view` |

Rules enforced by the API (not just the UI):

- an admin cannot lock or remove their own account (`self_lock` / `self_revoke`, 400);
- the last active Owner cannot be removed (`last_owner`, 409);
- only an Owner can grant or revoke the Owner role (`forbidden`, 403);
- locked roster rows lose access immediately and cannot sign in again (`ADMIN_LOCKED`);
- all admin mutations require the double-submit CSRF token (`csrf_failed`, 403 otherwise).

## 4. Reference

### Admin REST routes (`/api/admin/*`, `conai_admin` cookie + MFA required)

| Method & path | Purpose |
| --- | --- |
| `GET /me` | Current admin, role, effective permissions, MFA state |
| `POST /me/confirm-mfa` | Mark TOTP enrolled after the verify step |
| `GET /dashboard` | Platform counts |
| `GET /users?q=&limit=&offset=` · `GET /users/:id` | User search/detail |
| `POST /users/:id/lock` · `POST /users/:id/unlock` | Ban / unban |
| `GET /admins` · `POST /admins` · `DELETE /admins/:userId` | Roster management |
| `GET /audit?action=&limit=&offset=` | Audit query |
| `GET /settings` · `PUT /settings` | Allowlisted platform settings |
| `GET /csrf` | Double-submit token mint for the admin SPA |

### Admin auth endpoints (`/api/admin-auth/*`, better-auth)

`sign-in/email`, `sign-out`, `two-factor/enable`, `two-factor/verify-totp`,
`two-factor/disable`, `two-factor/generate-backup-codes`, plus password reset flows.

### Error codes

| Code | Meaning |
| --- | --- |
| `admin_session_required` (401) | No valid admin-plane cookie |
| `admin_access_required` (403) | User is not in `admin_members` (and not a bootstrap Owner) |
| `admin_locked` (403) | Roster row is locked, or sign-in gate refused a locked admin |
| `mfa_required` (403) | TOTP enrollment required before using admin routes |
| `forbidden` (403) | Authenticated admin lacks the needed `admin.*` permission |
| `csrf_failed` (403) | Missing/mismatched double-submit token on a mutation |
| `last_owner` (409) / `self_lock`, `self_revoke` (400) | Safety guards |

## 5. Local development

1. Put `ADMIN_OWNER_EMAILS=you@local.test` in `apps/api/.dev.vars`.
2. `npm run dev:api` (Worker on :8787) and `npm run dev:admin` (Vite on :5176).
3. Sign up `you@local.test` via the account app, mark it verified through the
   verification link printed in the Worker logs, then sign in at the admin app.
4. TOTP secrets and backup codes are stored encrypted with `SESSION_SECRET` —
   rotating the secret invalidates enrolled factors and requires re-enrollment.
