# Inspectra Application Audit

Date: 2026-06-10
Scope: Main Inspectra fire-protection operating system repository (this repo).
The separate public marketing website is **out of scope** and was not touched.

This audit was performed by reading actual source files (routers, schema,
client pages, config) and, where noted, dispatching focused review agents over
specific subsystems. Findings are evidence-based; nothing here is speculative
about "a module probably has X problem" without confirming it in code.

Given the size of the requested scope (18 audit parts across ~30 modules),
this pass focused on the areas with the highest blast radius if broken:
**multi-tenant security/authorization (Part 3)**, **runtime crash risks
(Part 8)**, **financial/payroll integrity (Part 12)**, **route/navigation
hygiene (Part 2)**, and **dev environment / Codespaces readiness (Part 18)**.
Parts 4-7, 9-11, 13-17 were **not** exhaustively covered in this pass — see
"Not Covered In This Pass" at the end. This is stated explicitly per the
instruction not to hide gaps in coverage.

---

## Part 1 — Architecture Overview

- **Frontend**: React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, wouter
  routing, tRPC client + TanStack Query.
- **Backend**: Express + tRPC server (`server/_core/index.ts`), Drizzle ORM
  against MySQL/PlanetScale (`server/db.ts`, `drizzle/schema.ts`).
- **Tenancy model**: every authenticated user has `companyId` (office staff /
  technicians / admins) or `customerOrgId` (customer-portal users). Almost all
  data tables carry a `companyId` (directly, or transitively via `jobId` /
  `siteId` / `deficiencyId`).
- **Permission layers** (`server/_core/trpc.ts`): `publicProcedure`,
  `protectedProcedure`, `adminProcedure`, `adminOrOfficeProcedure`,
  `officeProcedure`, `technicianProcedure`, `customerProcedure`. The
  authorization model is consistently "any authenticated user of the right
  role can call the procedure; the procedure body must additionally verify the
  *specific record* belongs to the caller's company/org."
- **Offline support**: technician mobile job packets (`getOfflineJobPacket`),
  sync log (`syncRouter`), client-side queue.
- **Storage**: S3/R2 (`server/storage.ts`) for attachments/media, Google Drive
  integration for customer records.
- **PDF generation**: PDFKit, async pre-fetch pattern (images/signatures
  fetched before entering the synchronous PDFKit `new Promise` callback).
- **Deployment**: Railway via `nixpacks.toml` — `pnpm install --frozen-lockfile`,
  `pnpm run build`, `pnpm run start`.
- **Module count / size**: `server/routers/jobRouter.ts` and several other
  routers are large (multiple operational concerns per file — jobs,
  scheduling, assignment, offline packets, customer decline). This is
  consistent with prior audits flagging some routers as oversized; no router
  was split in this pass (would be a broad refactor, out of scope per
  "no broad rewrite").
- **Duplication**: 40+ pre-existing audit `.md` files at repo root document
  prior passes over master data, offline sync, technician mobile, security,
  workflow health, etc. This audit builds on top of those rather than
  re-deriving the same findings from scratch.

---

## Part 2 — Routes and Navigation

**Result: clean.** No broken links, no missing imports, no stale/duplicate
routes, and no role-gating leaks were found in the route table or sidebar
navigation components.

Two minor (P3) housekeeping items found:

- `client/src/pages/ComponentShowcase.tsx` — not referenced by any route or
  import. Dead file.
- `client/src/components/DashboardLayout.tsx` — unused scaffold component;
  contains a placeholder nav link to `/some-path`, which does not exist as a
  route. The component itself is never imported, so this does not affect the
  running app, but it's dead code that could confuse future contributors.

Neither was removed in this pass (low risk, low value, and removing files
isn't necessary for stability — flagged for future cleanup instead).

---

## Part 3 — Authentication, Permissions & Tenancy Audit

This was the highest-value area of this pass. The general pattern across the
codebase is correct (role-gated procedures + per-record company/org checks),
but several procedures accepted a record id from the client and then either
(a) trusted a client-supplied `companyId` directly, or (b) operated on the
record without checking it belonged to the caller's company/org at all.

### P0 — Cross-tenant data exposure / mutation (FIXED)

1. **`reportRouter.approve` (customerProcedure)** — a customer could approve
   *any* report by id; the procedure didn't verify the report's parent job
   belonged to the customer's org (`customerOrgId`). **Fixed**: now loads the
   report and its parent job first, and throws `FORBIDDEN` unless
   `parentJob.customerOrgId === ctx.user.customerOrgId`.

2. **`jobRouter.get` / `getWithDetails` / `getSummary`** (protectedProcedure,
   used by both staff and customer-portal users) — these returned any job by
   id with no ownership check at all. A customer user could read another
   company's job (and its summary/details) by guessing/incrementing an id, and
   staff could read another company's job. **Fixed**: all three now branch on
   `ctx.user.role === 'customer'` (check `customerOrgId === job.customerOrgId`)
   vs. staff (check `companyId === job.companyId`), throwing `FORBIDDEN`
   otherwise.

3. **`jobRouter.listByCompany`, `listBySite`, `search`, `getScheduleSummary`**
   — all accepted a `companyId` (or, for `listBySite`, an implicit company via
   `siteId`) directly from client input without checking it matched
   `ctx.user.companyId`. A logged-in user from Company A could pass Company
   B's id and read Company B's job lists/schedule. **Fixed**: each now throws
   `FORBIDDEN` if the resolved company doesn't match `ctx.user.companyId`.

4. **`jobRouter.update`, `start`, `complete`, `saveSignatures`, `unassignJob`,
   `clone`, `delete`, `assignLeadTechnician`, `addAdditionalTechnician`,
   `removeAdditionalTechnician`, `setTechnicians`** — these mutated a job by
   id after only checking `assertJobNotFinalized` (or, for some, after no
   check at all besides existence). None verified the job belonged to the
   caller's company before mutating it. A technician/office user from Company
   A could start/complete/clone/delete/reassign a job belonging to Company B
   simply by passing its id. **Fixed**: every one of these now loads the job
   and throws `FORBIDDEN` unless `job.companyId === ctx.user.companyId`,
   *before* any finalization check or mutation. A new shared helper,
   `db.assertJobCompany(jobId, companyId)`, was added to `server/db.ts` to make
   this pattern consistent and reusable (mirrors the existing
   `assertJobNotFinalized` helper).

5. **`deficiencyRouter.listByJob`, `create`, `update`** and
   **`repairRouter.listByDeficiency`, `get`, `create`, `update`** — same class
   of bug: a deficiency/repair could be read or mutated via an id belonging to
   another company's job, because only the deficiency/repair's own existence
   was checked, not its parent job's company. **Fixed**: each now resolves the
   parent job (via the deficiency) and calls `assertJobCompany`.

6. **`reportRouter.create`, `update`, `generatePDF`, `generateCompliancePDF`**
   — `create` and the two (deprecated but still routable) PDF generators
   accepted a `jobId`/looked up a job without a company check; `update`
   checked finalization but not company. **Fixed**: all four now call
   `assertJobCompany` before proceeding.

7. **`aiRouter.generateReportSummary`, `prePublishReview`, `runQACheck`** — all
   three accepted a `jobId` and loaded the job via `getJobById` with only a
   "job exists" check (`NOT_FOUND`), not a company check — so any
   office/technician/admin user could generate AI summaries, run the
   pre-publish QA review, or trigger a full QA check against another
   company's job (this also means another company's job/inspection data would
   be sent to OpenAI on the caller's behalf). **Fixed**: all three replaced
   with `db.assertJobCompany(input.jobId, ctx.user.companyId!)`.

8. **`aiRouter.saveReviewOverrides`** — accepted a `reviewId` and wrote
   `overrides` to it with no ownership check at all; any technician could
   overwrite another company's AI review record. **Fixed**: now loads the
   review, throws `NOT_FOUND` if missing, and calls
   `assertJobCompany(review.jobId, ctx.user.companyId!)` before updating.

9. **`mediaRouter.reorderDeficiencyMedia`** — verified the *deficiency*
   belonged to the caller's company, but then updated `sortOrder` for
   arbitrary attachment ids supplied in `orderedIds` with no check that those
   attachment ids actually belonged to that deficiency. A user could pass
   attachment ids from a different deficiency (potentially a different
   company's) and silently rewrite their `sortOrder`. **Fixed**: the update's
   `WHERE` clause now also requires
   `entityType = 'deficiency' AND entityId = input.deficiencyId`, so only
   attachments that actually belong to the target deficiency can be reordered.

10. **`dashboardRouter.userRouter.get`** (protectedProcedure) — returned *any*
    user record by id with no check; any authenticated user could read another
    company's user records (names, emails, roles) by id. **Fixed**: now allows
    a user to read their own record, or a record where
    `target.companyId === ctx.user.companyId`; otherwise `FORBIDDEN`.

11. **`dashboardRouter.userRouter.updateRole`** (adminProcedure) — accepted an
    optional `companyId` from the client and passed it through to
    `db.updateUserRole`, and did not verify the target user belonged to the
    admin's company. An admin of Company A could potentially change the role
    of a user in Company B, or (via the optional `companyId` param) reassign a
    user's company. **Fixed**: now verifies `target.companyId ===
    ctx.user.companyId` before mutating, and always passes
    `ctx.user.companyId` (never the client-supplied value) to
    `db.updateUserRole`.

### Verified Correct (no change needed)

- `invoiceRouter`, `quoteRouter`, `approvedWorkRouter`, `workOrderRouter`,
  `payrollHoursRouter`, `timeTrackingRouter`, `contactRouter`, `mediaRouter`
  (other procedures), `aiAssistantRouter`/`globalSearchRouter`,
  `financialReportingRouter`, `companySettingsRouter`, `accessControlRouter`,
  `documentCenterRouter` — all already follow "load by id, then check
  `record.companyId === ctx.user.companyId`" before reading/writing.
- `jobRouter.getOfflineJobPacket` and `jobRouter.recordCustomerDecline` were
  already correctly scoped.

---

## Part 8 — Runtime Crash Audit

The codebase is notably defensive. One confirmed P0 crash was found and fixed;
everything else checked was already guarded.

### P0 — `<SelectItem value="">` crash (FIXED)

`client/src/pages/admin/FeedbackCenter.tsx` had three Radix `<Select>`
components (status / type / priority filters) each containing
`<SelectItem value="">All ...</SelectItem>`. Radix throws
`A <Select.Item /> must have a value prop that is not an empty string` at
render time — this is a guaranteed crash the moment the Feedback Center page
renders, for every user with access to it (admin).

**Fixed**: each Select now uses the established sentinel pattern used
elsewhere in the codebase — the trigger renders `value={filterX || "all"}`,
`onValueChange` maps `"all"` back to `""`, and the "All ..." item uses
`value="all"`. The underlying filter state remains `""`-based for the
downstream query logic (`filterX || undefined`), so no behavioral change
beyond fixing the crash.

### Checked, already safe (no change needed)

- `.map()` on potentially-undefined arrays — all instances checked use
  optional chaining or default to `[]`.
- `new Date(undefined)` patterns — all date inputs checked are guarded or
  come from non-null DB columns.
- `parseInt`/route-param parsing — guarded with `isNaN` checks or default
  redirects where checked.
- Non-null assertions (`!`) on `ctx.user.companyId` — these are safe because
  `officeProcedure`/`adminProcedure`/etc. guarantee `companyId` is set for
  staff roles.

### P2 (not fixed, low severity)

- Widespread `key={index}` / `key={i}` usage in `.map()` across
  `DataQuality.tsx`, `FinancialReports.tsx`, `SystemsTab.tsx`,
  `DevicesTab.tsx`, and others. Not a crash risk, but can cause React
  reconciliation glitches (lost focus/animation state) on lists that can be
  reordered or filtered. Recommend switching to stable ids in a future pass —
  deferred because it touches many files for a cosmetic-only issue.

---

## Part 12 — Financial & Payroll Audit

### P1 — Self-approval of time entries (FIXED)

`timeTrackingRouter.approve` and `timeTrackingRouter.reject`
(officeProcedure) allowed an office user to approve/reject **their own** time
entries — the same gap that `payrollHoursRouter` had already been fixed for in
a prior pass. **Fixed**: both now throw `FORBIDDEN` ("You cannot
approve/reject your own time entry") if `entry.userId === ctx.user.id`,
mirroring the existing `payrollHoursRouter` guard.

### P1 — CSV/Sage export formula injection (FIXED)

`invoiceRouter`'s CSV export helper (`csvCell`) quoted values containing
commas/quotes/newlines but did not neutralize values starting with `=`, `+`,
`-`, or `@` — these are interpreted as formulas by Excel/Sage when the export
is opened, allowing a malicious customer/contact name or line-item description
to execute a formula (e.g. `=HYPERLINK(...)`, `=cmd|...`) on whoever opens the
exported file. **Fixed**: `csvCell` now prefixes such values with a leading
`'` (single quote), which Excel/Sage treat as "force text" and do not
evaluate.

### P1 — Re-exporting an already-exported invoice to Sage (FIXED)

`invoiceRouter.markReadyForSageExport` allowed resetting `sageExportStatus`
back to `pending` on an invoice that had already been marked `exported` (or
was `void`), which could cause the same invoice to be exported to Sage twice
with no warning. **Fixed**: now throws `BAD_REQUEST` if the invoice is `void`
or already `sageExportStatus === "exported"`, with a message instructing the
user to reverse the export in Sage first.

### P2 — `markPaid` doesn't recalculate totals before locking (NOT FIXED)

`invoiceRouter.markPaid` compares the recorded payment against `inv.total`
without first calling `recalculateInvoiceTotals`. If line items were edited
in a way that should have changed `total` but the recalculation step was
skipped/raced, an invoice could be marked `paid` (a terminal, locked state)
against a stale total. This is a narrow race condition, not a routine
operational issue, and fixing it well requires understanding all callers of
`recalculateInvoiceTotals` and the transaction boundaries around `markPaid` —
deferred as a documented known risk rather than a rushed fix.

---

## Part 18 — Codespaces / Dev Container & Onboarding

- `.devcontainer/devcontainer.json` previously only specified an image with no
  Node/pnpm setup, no port forwarding, and no `.env` bootstrap. **Fixed**:
  now uses the TypeScript/Node 20 devcontainer image, enables Corepack and
  pins `pnpm@10.4.1` (matching `package.json`'s `packageManager` field), runs
  `pnpm install --frozen-lockfile`, and copies `.env.example` to `.env` if
  `.env` doesn't exist. Forwards and labels ports `5173` (Vite dev server,
  auto-opens browser) and `5000` (API server).
- `.env.example` did not exist. **Created** — documents every variable read by
  `server/_core/env.ts` with placeholder values and explanatory comments,
  grouped by feature area (core, database, auth, storage, email, AI, Maps,
  customer records / Google Drive, legacy SMB share, push notifications,
  analytics). No secrets included.
- `README.md` was effectively empty (3 lines of redeploy-marker comments).
  **Rewritten** with a stack overview and a 10-step Codespaces/dev-container
  setup guide (open in Codespaces, install deps, configure `.env`, run
  migrations manually, run seed/backfill scripts safely with `:dry` variants
  first, start dev server, open forwarded ports, run `check`/`test`/`build`,
  rebuild container, troubleshooting).

---

## Not Covered In This Pass

Given the scope of the request (18 audit parts × ~30 modules), the following
parts were **not** exhaustively investigated in this pass and should be
treated as open work for a future audit session:

- **Part 4** — Master data audit (Customer Records / Sites / WSI / Contacts /
  Devices / Jobs alignment, backfill script safety). Note: extensive prior
  audit work already exists in `MASTER_DATA_VALIDATION_AUDIT.md` and related
  files at repo root.
- **Part 5** — Database dependency / orphan audit.
- **Part 6** — End-to-end core workflow tracing (7 workflows).
- **Part 7** — Status consistency / enum-vs-label audit.
- **Part 9** — Technician mobile usability audit (beyond the FeedbackCenter
  crash fix, which affects admin not technician).
- **Part 10** — Offline/sync queue and conflict-handling audit.
- **Part 11** — Report/PDF privacy audit (no leaked internal notes / AI
  prompts / payroll / pricing / access codes in customer-facing PDFs).
- **Part 13** — Contacts and Send Center recipient-resolution audit.
- **Part 14** — AI safety audit beyond the tenancy fixes above (e.g.
  guarantees against auto-approval/auto-sending).
- **Part 15** — Notifications / activity timeline / workflow health audit.
- **Part 16** — Accessibility and responsive-layout audit (320px–1440px).
- **Part 17** — Performance audit (N+1 queries, unpaginated lists, bundle
  size).

These are not "found and ignored" — they were simply not investigated in this
pass, and no claims are made about their state either way.

---

## Priority Summary

| # | Finding | Priority | Status |
|---|---|---|---|
| 1 | `reportRouter.approve` cross-org approval | P0 | Fixed |
| 2 | `jobRouter.get`/`getWithDetails`/`getSummary` cross-tenant read | P0 | Fixed |
| 3 | `jobRouter.listByCompany`/`listBySite`/`search`/`getScheduleSummary` trusted client companyId | P0 | Fixed |
| 4 | `jobRouter` mutations (update/start/complete/clone/delete/assign/etc.) missing company check | P0 | Fixed |
| 5 | `deficiencyRouter`/`repairRouter` missing parent-job company check | P0 | Fixed |
| 6 | `reportRouter.create`/`update`/PDF generators missing company check | P0 | Fixed |
| 7 | `aiRouter` job-scoped procedures missing company check | P0 | Fixed |
| 8 | `aiRouter.saveReviewOverrides` no ownership check | P0 | Fixed |
| 9 | `mediaRouter.reorderDeficiencyMedia` arbitrary attachment id update | P1 | Fixed |
| 10 | `dashboardRouter.userRouter.get` cross-company user read | P0 | Fixed |
| 11 | `dashboardRouter.userRouter.updateRole` cross-company role change | P0 | Fixed |
| 12 | FeedbackCenter `<SelectItem value="">` crash | P0 | Fixed |
| 13 | `timeTrackingRouter` self-approval | P1 | Fixed |
| 14 | Invoice CSV/Sage formula injection | P1 | Fixed |
| 15 | Re-export of already-exported invoice to Sage | P1 | Fixed |
| 16 | `invoiceRouter.markPaid` totals not recalculated | P2 | Documented, not fixed |
| 17 | `key={index}` in reorderable lists | P2 | Documented, not fixed |
| 18 | `ComponentShowcase.tsx` / `DashboardLayout.tsx` dead files | P3 | Documented, not fixed |
| 19 | Missing `.env.example`, minimal devcontainer, empty README | P1 | Fixed |
| 20-30 | Parts 4-7, 9-11, 13-17 | — | Not covered this pass |
