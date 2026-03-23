# Security Audit Report — Invoke Platform

**Date:** 2026-03-23  
**Last Updated:** 2026-03-23  
**Scope:** Full codebase scan across all services (`invoke-admin`, `invoke-gateway`, `invoke-execution`, `invoke-scheduler`, `shared/`)

---

## Table of Contents

- [Summary](#summary)
- [Critical Issues](#critical-issues)
- [High Severity Issues](#high-severity-issues)
- [Medium Severity Issues](#medium-severity-issues)
- [Low Severity Issues](#low-severity-issues)
- [Positive Findings](#positive-findings)
- [Recommendations](#recommendations)

---

## Summary

| Severity | Count | Open | Resolved |
|----------|-------|------|----------|
| Critical | 2     | 0    | 2        |
| High     | 4     | 0    | 4        |
| Medium   | 6     | 2    | 4        |
| Low      | 3     | 2    | 1        |

---

## Critical Issues

### C1. Hardcoded JWT Secret Fallback ✅ RESOLVED

**Resolution (2026-03-23):**  
A module-level `JWT_SECRET` constant was added at the top of `invoke-admin/lib/middleware.ts` that throws `FATAL: JWT_SECRET environment variable is required` at boot if the variable is missing. All `jwt.verify()` and `jwt.sign()` calls across `middleware.ts`, `login.ts`, `change-email.ts`, and `change-password.ts` now reference this constant with no fallback.

~~**Files:**~~
- ~~`invoke-admin/lib/middleware.ts` (lines 29, 103, 231)~~
- ~~`invoke-admin/pages/api/auth/login.ts` (line 123)~~
- ~~`invoke-admin/pages/api/auth/change-password.ts` (line 23)~~
- ~~`invoke-admin/pages/api/auth/change-email.ts` (line 23)~~

~~**Description:**  
JWT signing and verification falls back to `'default-secret'` when `JWT_SECRET` environment variable is not set. An attacker who knows this default can forge valid authentication tokens for any user.~~

~~**OWASP Category:** A07:2021 — Identification and Authentication Failures~~

---

### C2. TLS Certificate Verification Disabled for Database ✅ RESOLVED

**Resolution (2026-03-23):**  
`rejectUnauthorized` in `shared/config/config.js` now follows `NODE_TLS_REJECT_UNAUTHORIZED`: it is `true` by default and only `false` when `NODE_TLS_REJECT_UNAUTHORIZED=0` is explicitly set (the standard Node.js convention). An optional CA certificate path can be supplied via `DB_SSL_CA`.

~~**File:** `shared/config/config.js` (line 22)~~

~~**Description:**  
Production database SSL configuration uses `rejectUnauthorized: false`, which disables TLS certificate verification. This makes the database connection vulnerable to man-in-the-middle (MITM) attacks.~~

~~**OWASP Category:** A02:2021 — Cryptographic Failures~~

---

## High Severity Issues

### H1. Hardcoded S3/MinIO Credentials ✅ RESOLVED

**Resolution (2026-03-23):**  
Removed the `|| 'invoke-minio'` and `|| 'invoke-minio-password-123'` fallbacks from `shared/s3.js`. `S3_ACCESS_KEY` and `S3_SECRET_KEY` are now required environment variables with no default.

~~**File:** `shared/s3.js` (lines 48–49)~~

~~**Description:**  
S3 access key and secret key use hardcoded defaults (`invoke-minio` / `invoke-minio-password-123`) when environment variables are not set.~~

~~**OWASP Category:** A07:2021 — Identification and Authentication Failures~~

---

### H2. JWT Token Stored in localStorage (XSS Token Theft)

**File:** `invoke-admin/contexts/AuthContext.tsx` (lines 38, 78, 93)

**Description:**  
Authentication tokens are stored in `localStorage`, which is accessible to any JavaScript running on the page. If any XSS vulnerability exists in the application, tokens can be stolen.

**Code:**
```typescript
localStorage.getItem('auth-token')   // read
localStorage.setItem('auth-token', token)  // write
```

**OWASP Category:** A07:2021 — Identification and Authentication Failures

**Recommendation:**  
Store tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies set by the server. Cookies with these flags are not accessible via JavaScript.

---

### H3. Error Messages Expose Internal Details ✅ RESOLVED

**Resolution (2026-03-23):**  
All three endpoints now return generic error messages to the client while logging the full error server-side:
- `change-email.ts` → `'An internal error occurred'`
- `change-password.ts` → `'An internal error occurred'`
- `upload.ts` → `'Upload failed. Please try again.'` / `'Failed to parse multipart form data'`

~~**Files:**~~
- ~~`invoke-admin/pages/api/auth/change-email.ts` (line 88) — returns `'Failed to update email: ' + error.message`~~
- ~~`invoke-admin/pages/api/auth/change-password.ts` (line 91) — returns `'Failed to change password: ' + error.message`~~
- ~~`invoke-admin/pages/api/functions/upload.ts` (lines 188–202) — returns `'Upload failed: ' + errorMessage`~~

~~**OWASP Category:** A04:2021 — Insecure Design~~

---

### H4. Hardcoded Database Password Defaults ✅ RESOLVED

**Resolution (2026-03-23):**  
Removed `|| 'postgres'` fallback from `shared/database.js` and `shared/service-database.js`. `DB_PASSWORD` is now passed as-is (undefined if not set, which causes Sequelize to require it from env). The `development` block in `shared/config/config.js` retains the `'postgres'` default for local dev convenience only; production has no fallback.

~~**Files:**~~
- ~~`shared/database.js` (line 30)~~
- ~~`shared/service-database.js` (line 33)~~
- ~~`shared/config/config.js` (line 6)~~

~~**Description:**  
Database connection falls back to `'postgres'` as the password when `DB_PASSWORD` is not set — a well-known default for PostgreSQL.~~

~~**OWASP Category:** A07:2021 — Identification and Authentication Failures~~

---

## Medium Severity Issues

### M1. In-Memory Rate Limiting (Not Persistent) ✅ RESOLVED

**Resolution (2026-03-23):**  
Rate limiting migrated from an in-memory `Map` to a PostgreSQL UNLOGGED table (`login_attempts`). The composite key is now `<client-ip>:<username>`, where the client IP is resolved via `proxy-addr` honouring the `TRUST_PROXY` environment variable (same logic as Express's `app.set('trust proxy', ...)`). A Sequelize model (`LoginAttempt`) and migration (`004_add_login_attempts.js`) were added.

~~**File:** `invoke-admin/lib/rate-limiter.ts` (line 13)~~

~~**Description:**  
Failed login attempt tracking uses an in-memory `Map`. Rate limit state is lost on service restart, and is not shared across multiple instances in distributed deployments. An attacker can bypass rate limits by restarting the target service or distributing requests across instances.~~

~~**Code:**~~
```typescript
const loginAttempts = new Map<string, LoginAttempt>()
```

~~**OWASP Category:** A07:2021 — Identification and Authentication Failures~~

~~**Recommendation:**  
Use a persistent store (Redis or database) for rate limiting in production.~~

---

### M2. Long JWT Expiration Without Refresh Token Rotation

**File:** `invoke-admin/pages/api/auth/login.ts` (line 124)

**Description:**  
JWT tokens are issued with a 7-day expiration and no refresh token mechanism. If a token is compromised, it remains valid for up to 7 days with no way to revoke it.

**Code:**
```typescript
{ expiresIn: '7d' }
```

**OWASP Category:** A07:2021 — Identification and Authentication Failures

**Recommendation:**  
- Reduce access token lifetime (e.g., 15–60 minutes)
- Implement refresh token rotation
- Add a token revocation mechanism (e.g., token blocklist in Redis)

---

### M3. Bcrypt Salt Rounds Inconsistency ✅ RESOLVED

**Resolution (2026-03-23):**  
`create-admin.ts` and `change-password.ts` now use the shared `hashPassword()` / `verifyPassword()` functions from `utils.ts`, which consistently use 12 rounds. The direct `bcrypt` imports were removed from both files.

~~**Files:**~~
- ~~`invoke-admin/lib/utils.ts` (line 43) — uses **12** rounds ✅~~
- ~~`invoke-admin/lib/create-admin.ts` (line 56) — uses **10** rounds ⚠️~~
- ~~`invoke-admin/pages/api/auth/change-password.ts` (line 75) — uses **10** rounds ⚠️~~

~~**Description:**  
Password hashing uses different bcrypt cost factors across the codebase. The admin user and password changes use 10 rounds, while the utility function uses 12.~~

~~**OWASP Category:** A02:2021 — Cryptographic Failures~~

~~**Recommendation:**  
Standardize on 12 rounds and use the shared `hashPassword()` function from `utils.ts` everywhere.~~

---

### M4. Missing Security Headers in invoke-admin (Next.js) ✅ RESOLVED

**Resolution (2026-03-23):**  
Added a `headers()` block to `invoke-admin/next.config.js` setting `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` for all routes.

~~**File:** `invoke-admin/next.config.js`~~

~~**Description:**  
The Next.js `invoke-admin` service does not configure security headers. While `invoke-gateway` and `invoke-execution` use `helmet`, `invoke-admin` lacks `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Strict-Transport-Security` headers.~~

~~Note: `poweredByHeader: false` is correctly set ✅~~

~~**OWASP Category:** A05:2021 — Security Misconfiguration~~

---

### M5. Login Response Reveals Failed Attempt Count ✅ RESOLVED

**Resolution (2026-03-23):**  
Failed login error responses now return the generic `'Invalid credentials'` message without attempt counts or max-attempt details.

~~**File:** `invoke-admin/pages/api/auth/login.ts` (lines 72–73, 88–89)~~

~~**Description:**  
Error messages on failed login include the current attempt count and maximum allowed attempts (e.g., `"Failed attempts: 3/5"`). This gives attackers knowledge of exactly how many attempts remain before lockout.~~

~~**Code:**~~
```typescript
`Invalid credentials. Failed attempts: ${attempts}/${config.maxAttempts}`
```

~~**OWASP Category:** A07:2021 — Identification and Authentication Failures~~

~~**Recommendation:**  
Return a generic `"Invalid credentials"` message without attempt count details.~~

---

### M6. Docker Containers Run as Root ✅ RESOLVED

**Resolution (2026-03-23):**  
All four Dockerfiles (`invoke-admin`, `invoke-gateway`, `invoke-execution`, `invoke-scheduler`) now create a non-root user (`appuser`, uid 1001, group `appgroup`) after the build step, `chown` the `/app` directory, and switch to that user with `USER appuser` before the container starts.

~~**Files:**~~
- ~~`invoke-admin/Dockerfile`~~
- ~~`invoke-gateway/Dockerfile`~~

~~**Description:**  
Docker containers do not specify a non-root user. All processes run as `root` by default, which increases the blast radius of any container escape or code execution vulnerability.~~

~~**OWASP Category:** A05:2021 — Security Misconfiguration~~

---

## Low Severity Issues

### L1. Health Endpoint Exposes Cache Metadata ✅ RESOLVED

**Resolution (2026-03-23):**  
`invoke-gateway/src/routes/health.ts` now returns only `{ status: 'ok', service: 'invoke-gateway' }` on success and `{ status: 'error' }` on failure, with no cache state or internal error messages exposed.

~~**File:** `invoke-gateway/src/routes/health.ts` (lines 10–16)~~

~~**Description:**  
The unauthenticated `/health` endpoint returns `projectCount` and `lastRefreshed` timestamp, which reveals internal system state.~~

---

### L2. Gateway Error Response Leaks Internal Error Messages

**File:** `invoke-gateway/src/routes/health.ts` (line 21)

**Description:**  
When the health check fails, the raw error message is returned in the response:

```typescript
res.status(503).json({ status: 'error', message });
```

**Recommendation:**  
Return a generic error without internal details on publicly accessible endpoints.

---

### L3. CORS Allows Wildcard Origin with Credentials

**File:** `invoke-gateway/src/routes/gateway.ts` (lines 44–46)

**Description:**  
When `allowedOrigins` is `['*']` or empty, the `Access-Control-Allow-Origin: *` header is set. While the current code does not simultaneously set credentials in this case, if `allowCredentials` is enabled alongside wildcard origin, browsers will reject it — but the misconfiguration indicates a potential design gap.

**Recommendation:**  
Validate at configuration time that `allowCredentials: true` cannot be combined with wildcard origins. Add an explicit check.

---

## Positive Findings

The following security practices are well-implemented:

| Area | Status | Details |
|------|--------|---------|
| SQL Injection | ✅ Secure | All database access uses Sequelize ORM with parameterized queries |
| XSS (React) | ✅ Secure | No `dangerouslySetInnerHTML` or `innerHTML` in production code |
| Command Injection | ✅ Secure | No `eval()`, `Function()`, or `child_process` with user input |
| Header Stripping | ✅ Secure | Gateway strips `Authorization`, `X-API-Key`, `X-Forwarded-*` before proxying |
| Helmet | ✅ Secure | Used in `invoke-gateway` and `invoke-execution` |
| Password Hashing | ✅ Secure | bcrypt used for all password storage |
| File Upload Validation | ✅ Secure | 50MB limit, MIME type validation, extension checking |
| API Key Hashing | ✅ Secure | API keys stored as SHA-256 hashes |
| Turnstile CAPTCHA | ✅ Secure | Login protected by Cloudflare Turnstile verification |
| CORS | ✅ Secure | Per-route CORS configuration with origin validation |
| `poweredByHeader` | ✅ Secure | Disabled in Next.js config |
| File Uploads to S3 | ✅ Secure | Files stored in S3, not served directly from filesystem |
| Project Access Control | ✅ Secure | Proper owner/member checks on project-scoped endpoints |

---

## Recommendations

### Immediate Priority (Critical/High)

1. **Remove all hardcoded secret fallbacks** — **✅ Resolved** (`JWT_SECRET`, `S3_SECRET_KEY`, `S3_ACCESS_KEY`, `DB_PASSWORD`)
2. **Fix TLS certificate verification** — **✅ Resolved** (follows `NODE_TLS_REJECT_UNAUTHORIZED`)
3. **Sanitize error responses** — **✅ Resolved**
4. **Migrate JWT storage** — Move from `localStorage` to `httpOnly` cookies

### Short-term Priority (Medium)

5. **Implement Redis-backed rate limiting** for distributed deployments — **✅ Resolved: DB-backed (PostgreSQL UNLOGGED table)**
6. **Reduce JWT expiration** and implement refresh token rotation
7. **Standardize bcrypt rounds** to 12 across all password hashing — **✅ Resolved**
8. **Add security headers** to `invoke-admin` via `next.config.js` — **✅ Resolved**
9. **Remove attempt count from login error messages** — **✅ Resolved**
10. **Run containers as non-root** in all Dockerfiles — **✅ Resolved**

### Long-term Priority (Low / Defense-in-Depth)

11. **Restrict health endpoint** — Remove cache metadata from public responses — **✅ Resolved**
12. **Add input validation library** (e.g., `zod`) for consistent request validation across all API endpoints
13. **Implement token revocation** — Maintain a blocklist for compromised tokens
14. **Add audit logging** — Log authentication events, permission changes, and admin actions to a persistent audit trail
15. **Environment variable validation** — Add a startup check that validates all required env vars before the application accepts traffic

### Startup Environment Validation Example

```typescript
const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'DB_PASSWORD',
  'DB_HOST',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Required environment variable ${envVar} is not set`);
    process.exit(1);
  }
}
```
