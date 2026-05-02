# Inspectra Security Audit
**Date:** 2026-05-02  
**Scope:** Authentication, authorization/tenant isolation, secrets handling, file uploads, API validation  
**Method:** Direct code inspection of all auth-path and mutation files

---

## Files Inspected

- `server/_core/index.ts` — Express setup, rate limiting, CORS, body parser
- `server/_core/context.ts` — tRPC context creation
- `server/_core/trpc.ts` — Procedure definitions and role middleware
- `server/_core/sdk.ts` — JWT session management, OAuth token exchange, `authenticateRequest`
- `server/_core/oauth.ts` — OAuth callback handler, user upsert, role resolution
- `server/_core/cookies.ts` — Session cookie options
- `server/_core/env.ts` — Environment variable definitions
- `server/_core/upload.ts` — Multipart file upload handler
- `server/routers/filesRouter.ts` — S3 upload tRPC procedures, Excel import
- `server/routers/quoteRouter.ts` — Public `accept` endpoint
- `server/routers/jobRouter.ts` — Job CRUD with companyId handling
- `server/routers/dashboardRouter.ts` — User management, stats
- `server/db.ts` — `getAllUsers`, `getQuoteByToken`, `authenticateRequest` helpers
- `drizzle/schema.ts` — Column definitions for `users`, `approved_work`, `quotes`

---

## Ranked Findings

### 1. CRITICAL — Deactivated users bypass the `isActive` guard

**File:** `server/_core/sdk.ts:251–278`

`sdk.authenticateRequest()` fetches the user from the DB and returns them without checking `user.isActive`. The `isActive=0` gate only runs in the OAuth redirect (shows "Account Pending Approval" HTML), not on the API path. Any user who already has a valid JWT cookie — including one an admin set to inactive — can call every `protectedProcedure`, `officeProcedure`, and `technicianProcedure` endpoint indefinitely.

```typescript
// Current — no isActive check
let user = await db.getUserByOpenId(sessionUserId);
if (!user) { throw ForbiddenError(...); }
return user; // ← isActive never checked
```

**Recommended fix:** Add one check in `authenticateRequest` immediately after the null check.  
**Patch status: APPLIED** (see below)

---

### 2. HIGH — `filesRouter.uploadToS3` uses client-supplied `companyId` for S3 key

**File:** `server/routers/filesRouter.ts:28`

```typescript
const fileKey = `${input.companyId}/jobs/${input.jobId}/${input.fileName}-${randomSuffix}`;
```

Any authenticated user can pass any `companyId` in the tRPC input and their file lands in another company's S3 prefix. No check validates `input.companyId === ctx.user.companyId`. This allows cross-tenant storage pollution and could expose files to the wrong company if a future listing query is scoped by prefix.

**Recommended fix:** Use `ctx.user.companyId` instead of `input.companyId`.  
**Patch status: APPLIED**

---

### 3. HIGH — `jobRouter.create` trusts client-supplied `companyId`

**File:** `server/routers/jobRouter.ts:86–138`

`job.create` is an `officeProcedure` that accepts `companyId: z.number()` from the client and inserts it directly into the `jobs` table (and the linked work order). No check that `input.companyId === ctx.user.companyId` is performed. An office-role user at company 1 can create a job attributed to company 2.

**Recommended fix:** Validate `input.companyId === ctx.user.companyId` at the top of the mutation.  
**Patch status: APPLIED**

---

### 4. HIGH — `dashboardRouter.user.list` can return all users across all companies

**File:** `server/routers/dashboardRouter.ts:8–9`

```typescript
list: adminProcedure.input(z.object({ companyId: z.number().optional() }))
  .query(async ({ input }) => db.getAllUsers(input.companyId))
```

`db.getAllUsers()` without a `companyId` returns every user in every company. `companyId` is optional in the input — omitting it exposes the full user table to any admin-role user. In a single-company deployment impact is low; in multi-tenant it leaks all user PII (names, emails, roles, Google tokens metadata).

**Recommended fix:** Fall back to `ctx.user.companyId` when `input.companyId` is omitted.  
**Patch status: APPLIED**

---

### 5. MEDIUM — `console.log("[OAuth Debug] redirect_uri: ...")` runs unconditionally in production

**File:** `server/_core/sdk.ts:63`

```typescript
redirect_uri: (() => { const uri = `...`; console.log("[OAuth Debug] redirect_uri:", uri); return uri; })(),
```

This IIFE executes on every OAuth token exchange regardless of `ENV.isProduction`. Not a secret leak (the redirect_uri is not sensitive), but it pollutes production logs and reveals deployment URL structure. It was clearly a debug line that was never removed.

**Recommended fix:** Remove the IIFE; just use the URI directly.  
**Patch status: APPLIED**

---

### 6. MEDIUM — Quote `acceptToken` never expires

**File:** `server/routers/quoteRouter.ts:546–598`, `server/db.ts:1546–1551`

The public `quote.accept` endpoint validates only that the token matches and the status is `"sent"`. There is no expiry column; tokens remain valid indefinitely. If a sent quote email is intercepted months or years later the link still works.

The token itself is strong (32 bytes of `crypto.randomUUID`-equivalent entropy), so brute-force is not a practical risk. The concern is long-lived acceptance links.

**Recommended fix:** Add a `acceptTokenExpiresAt timestamp` column to `quotes`; set it to now + 90 days when sending; check it in `getQuoteByToken` or the `accept` handler.  
**Patch status: NOT APPLIED** — requires a schema migration. Recommended as follow-up.

---

### 7. MEDIUM — `filesRouter.listByJob` has no company ownership check

**File:** `server/routers/filesRouter.ts:49–67`

```typescript
listByJob: protectedProcedure.input(z.object({ jobId: z.number() }))
  .query(async ({ input, ctx }) => {
    // Returns attachments for any jobId — no company check
  })
```

Any authenticated user from any company can enumerate attachments (including file URLs) for any job ID. Guessing or brute-forcing job IDs would leak attachment metadata and URLs.

**Recommended fix:** Join through `jobs` table to verify `jobs.companyId === ctx.user.companyId` before returning results.  
**Patch status: NOT APPLIED** — requires a join query change. Recommended as follow-up.

---

### 8. LOW — Session JWT valid for one year with no revocation

**File:** `server/_core/sdk.ts:197`, `server/_core/oauth.ts:149`

Sessions are signed JWTs with a 1-year TTL (`ONE_YEAR_MS`). There is no server-side session store and no revocation mechanism. A stolen cookie is valid until expiry. Combined with finding #1 (deactivated users), this means even after `isActive=0` is set a user's stolen cookie would continue to work until the JWT expires — unless finding #1 is patched (which it now is via the `isActive` check).

**Recommended fix (long-term):** Add a `sessionVersion` integer to the `users` table. Embed it in the JWT payload and verify it on each request. Incrementing `sessionVersion` instantly revokes all existing sessions for that user. Low urgency after #1 is patched.  
**Patch status: NOT APPLIED**

---

### 9. LOW — `driveRouter` DB writes accept `input.companyId` without ctx validation

**File:** `server/routers/driveRouter.ts:509–669`

Several Drive import mutations (`createOrgsAndSitesFromDrive`) insert records using `input.companyId` directly. Shares the same root cause as finding #3 but lower priority because Drive integration is admin/office-only.

**Recommended fix:** Follow-up with the same pattern as the `jobRouter` fix — validate `input.companyId === ctx.user.companyId`.  
**Patch status: NOT APPLIED** — follow-up

---

## Summary

| # | Severity | Description | Patched |
|---|----------|-------------|---------|
| 1 | **Critical** | Deactivated users bypass `isActive` check on API path | ✅ Yes |
| 2 | **High** | `uploadToS3` uses client-supplied `companyId` for S3 key | ✅ Yes |
| 3 | **High** | `job.create` trusts client-supplied `companyId` | ✅ Yes |
| 4 | **High** | `user.list` can return all-company user data | ✅ Yes |
| 5 | **Medium** | Unconditional `[OAuth Debug]` `console.log` in production | ✅ Yes |
| 6 | **Medium** | Quote accept tokens never expire | Follow-up |
| 7 | **Medium** | `filesRouter.listByJob` has no company ownership check | Follow-up |
| 8 | **Low** | 1-year sessions, no server-side revocation | Follow-up |
| 9 | **Low** | `driveRouter` DB writes trust client `companyId` | Follow-up |

---

## Positive Findings (no action needed)

- Cookie settings are correct: `httpOnly: true`, `secure` based on request protocol, `sameSite: "lax"`.
- `JSON` body size limit is 50 MB — large, but required for base64 file uploads via tRPC. The separate multipart endpoint has a 50 MB `formidable` limit. Acceptable.
- Only one `publicProcedure` beyond auth/logout — `quote.accept`, which is intentionally public and token-gated.
- OAuth redirect state is validated to be same-origin (`startsWith('/')`) — open redirect is prevented.
- Rate limiting is configured on all three surface areas (`/api/trpc`, `/api/oauth`, `/api/upload`).
- Helmet is applied. CSP is disabled (intentional — Vite dev requires it).
- `trust proxy: 1` is correct for Railway's single-proxy setup.
- No secrets or tokens are logged to console.
- Google tokens (access/refresh) are stored in the DB, not returned to the frontend.
- Drizzle ORM is used throughout — no raw SQL string interpolation found.

---

## Follow-up Recommendations (not patched)

1. **Quote token expiry** — Add `acceptTokenExpiresAt` to `quotes` table; set to now+90 days on send.
2. **`filesRouter.listByJob` ownership check** — Join through `jobs` to enforce `companyId`.
3. **`driveRouter` companyId validation** — Mirror the `jobRouter.create` fix across Drive import mutations.
4. **Session revocation** — Add `sessionVersion` to users; increment on logout/deactivation to immediately invalidate tokens.
5. **Systemic `input.companyId` audit** — A broader pass over all mutations that accept `companyId` from the client should validate it against `ctx.user.companyId`. Affects: `dashboardRouter.getStats/getRecentJobs`, `importRouter`, `repairLetterRouter`, `serviceScheduleRouter`.
6. **File type allowlist in `upload.ts`** — The multipart endpoint infers MIME from extension but does not reject unknown extensions. Consider an explicit allowlist of permitted MIME types.
