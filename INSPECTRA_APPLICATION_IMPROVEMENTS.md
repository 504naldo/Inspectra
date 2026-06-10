# Inspectra Application Improvements — Implementation Report

Companion to `INSPECTRA_APPLICATION_AUDIT.md`. This document records what was
actually changed in this pass, why, and the verification performed.

## Audit Summary

A focused audit covering tenancy/security (Part 3), runtime crashes (Part 8),
financial/payroll integrity (Part 12), routes/navigation (Part 2), and
Codespaces/dev onboarding (Part 18) found **11 distinct cross-tenant
authorization gaps** (read or write access to another company's/customer's
data via a client-supplied id), **1 guaranteed-crash UI bug**, **3 financial
integrity gaps** (self-approval, CSV formula injection, double Sage export),
and a missing dev-environment setup (`.env.example`, devcontainer, README).
All of these were fixed. Parts 4-7, 9-11, 13-17 were not covered in this pass
(see audit doc for the explicit list) — no claims are made about their state.

## P0 Issues (Fixed)

1. Customers could approve reports belonging to other customer orgs
   (`reportRouter.approve`).
2. Any authenticated user could read another company's/customer's job, job
   details, or job summary by id (`jobRouter.get`, `getWithDetails`,
   `getSummary`).
3. `jobRouter.listByCompany`, `listBySite`, `search`, `getScheduleSummary`
   trusted a client-supplied `companyId`/site without verifying it matched the
   caller's company.
4. `jobRouter` mutations (`update`, `start`, `complete`, `saveSignatures`,
   `unassignJob`, `clone`, `delete`, `assignLeadTechnician`,
   `addAdditionalTechnician`, `removeAdditionalTechnician`, `setTechnicians`)
   could act on another company's job.
5. `deficiencyRouter` (`listByJob`, `create`, `update`) and `repairRouter`
   (`listByDeficiency`, `get`, `create`, `update`) could read/mutate
   deficiencies and repairs belonging to another company's job.
6. `reportRouter` (`create`, `update`, `generatePDF`, `generateCompliancePDF`)
   could create/update/generate reports for another company's job.
7. `aiRouter` (`generateReportSummary`, `prePublishReview`, `runQACheck`)
   could run AI operations (including sending data to OpenAI) against another
   company's job.
8. `aiRouter.saveReviewOverrides` could overwrite another company's AI review
   record by id.
9. `dashboardRouter.userRouter.get` could read any user record (name, email,
   role) across companies by id.
10. `dashboardRouter.userRouter.updateRole` could change the role (and
    potentially company assignment) of a user in another company.
11. `client/src/pages/admin/FeedbackCenter.tsx` rendered
    `<SelectItem value="">`, which Radix throws on at render time —
    guaranteed crash for any admin opening the Feedback Center.

## P1 Issues (Fixed)

12. `mediaRouter.reorderDeficiencyMedia` updated `sortOrder` on arbitrary
    attachment ids without confirming they belonged to the target deficiency.
13. `timeTrackingRouter.approve`/`reject` allowed self-approval/rejection of
    one's own time entries.
14. Invoice CSV/Sage export was vulnerable to spreadsheet formula injection
    (`=`, `+`, `-`, `@` prefixed values not neutralized).
15. `invoiceRouter.markReadyForSageExport` allowed resetting export status on
    an already-`exported` (or `void`) invoice, risking duplicate Sage exports.
16. Repo had no `.env.example`, a minimal devcontainer with no port forwarding
    or pnpm setup, and an effectively empty `README.md`.

## Files Changed

| File | Change |
|---|---|
| `server/db.ts` | Added `assertJobCompany(jobId, companyId)` helper |
| `server/routers/jobRouter.ts` | Added company-scoping checks to ~15 procedures |
| `server/routers/reportRouter.ts` | Fixed `approve` cross-org check; added company checks to `create`/`update`/PDF generators |
| `server/routers/deficiencyRouter.ts` | Added `assertJobCompany` to `listByJob`/`create`/`update` and repair sub-router |
| `server/routers/aiRouter.ts` | Added `assertJobCompany`/ownership checks to 4 procedures |
| `server/routers/dashboardRouter.ts` | Fixed `userRouter.get`/`updateRole` cross-company access |
| `server/routers/mediaRouter.ts` | Constrained `reorderDeficiencyMedia` update to attachments owned by the target deficiency |
| `server/routers/invoiceRouter.ts` | Added CSV formula-injection protection; blocked re-export of locked invoices |
| `server/routers/timeTrackingRouter.ts` | Added self-approval/rejection guards |
| `client/src/pages/admin/FeedbackCenter.tsx` | Fixed `<SelectItem value="">` crash via sentinel pattern |
| `server/inspection.test.ts` | Updated mocks for new `assertJobCompany` contract |
| `.env.example` | New — documents all env vars, no secrets |
| `.devcontainer/devcontainer.json` | Added pnpm setup, port forwarding, `.env` bootstrap |
| `README.md` | Rewritten with stack overview + 10-step setup guide |

## Security / Company-Scoping Fixes

See "P0 Issues" 1-11 above and `INSPECTRA_APPLICATION_AUDIT.md` Part 3 for
full detail and code-level evidence. The unifying pattern applied: every
procedure that accepts a record id (job, deficiency, repair, report, AI
review, user) or a company/site id directly from the client now verifies that
record/company belongs to `ctx.user.companyId` (or, for customer-portal
procedures, `ctx.user.customerOrgId`) before reading or mutating it. The new
`db.assertJobCompany` helper centralizes the job-ownership check and mirrors
the existing `assertJobNotFinalized` helper's calling convention.

## Data-Integrity Fixes

- `mediaRouter.reorderDeficiencyMedia` (P1 #12) — prevents a client from using
  the reorder endpoint to rewrite `sortOrder` on attachments outside the
  target deficiency.
- `invoiceRouter.markReadyForSageExport` (P1 #15) — prevents resetting export
  status on a `void` or already-`exported` invoice, avoiding duplicate Sage
  exports.

## Workflow Fixes

No core workflow logic was changed beyond the authorization checks above
(which fail closed with `FORBIDDEN`/`NOT_FOUND` rather than altering business
rules). `assertJobNotFinalized` checks were preserved in their original
position relative to the new company checks (company check now runs first,
finalization check unchanged after it).

## Technician Mobile / Offline Fixes

None in this pass. `getOfflineJobPacket` and `recordCustomerDecline` were
checked and found already correctly company-scoped (see audit Part 3,
"Verified Correct").

## Report / PDF Fixes

`reportRouter.create`, `update`, `generatePDF`, and `generateCompliancePDF`
now verify the report's job belongs to the caller's company before proceeding
(P0 #6). `reportRouter.approve` now verifies the report's job belongs to the
approving customer's org (P0 #1). No changes to PDF content/layout/privacy
were made — PDF privacy (Part 11) was not audited in this pass.

## Financial / Payroll Fixes

- `timeTrackingRouter.approve`/`reject` now block self-approval/rejection
  (P1 #13), matching the existing `payrollHoursRouter` guard.
- Invoice CSV/Sage export now neutralizes formula-injection payloads (P1 #14).
- `markReadyForSageExport` blocks re-export of locked invoices (P1 #15).
- **Known risk, not fixed**: `invoiceRouter.markPaid` does not call
  `recalculateInvoiceTotals` before comparing against `inv.total` — see audit
  Part 12, P2.

## Navigation / Responsive Fixes

None required — Part 2 route/navigation audit came back clean (see audit
Part 2). Two dead files (`ComponentShowcase.tsx`, `DashboardLayout.tsx`) were
identified but not removed (P3, low value/risk either way).

## Performance Fixes

None in this pass — Part 17 was not covered.

## Codespaces / Dev Experience Fixes

- `.env.example` created (no secrets) documenting every variable in
  `server/_core/env.ts`.
- `.devcontainer/devcontainer.json` updated: TS/Node 20 image, Corepack +
  pnpm 10.4.1, `pnpm install --frozen-lockfile`, auto-creates `.env` from
  `.env.example`, forwards/labels ports 5173 (Vite) and 5000 (API).
- `README.md` rewritten with a stack overview and 10-step setup guide
  (Codespaces, install, env config, manual migrations, safe seed/backfill
  with dry-run first, dev server, forwarded ports, checks/build, container
  rebuild, troubleshooting).

## Checks / Build Results

- `npx tsc --noEmit` — **clean**, no errors.
- `npx vitest run` — **782 passed / 2 failed / 59 skipped (843 total)**. Both
  failures are **pre-existing and unrelated** to this pass:
  - `Auth Router > logout clears session cookie` (`server/inspection.test.ts`)
  - `Import Schemas > should assign correct categories` (`server/import.test.ts`)
  Confirmed via `git stash` that both failures exist on the pre-change
  baseline as well. The mocked-`db` test regressions introduced by the new
  `assertJobCompany` calls (4 additional failures at one point) were fixed by
  updating `server/inspection.test.ts`'s mock factory and mock job fixtures.
  13 test *files* report 26 *skipped* tests due to `Error: Database not
  available` (no `DATABASE_URL` in this sandbox) — pre-existing environmental
  limitation, not caused by this pass.
- `npx vite build` — **clean**, `✓ built in ~9.4s`.
- `esbuild server/_core/index.ts ... --bundle --format=esm` — **clean**,
  ~1.3 MB bundle, builds in ~60ms.

## Remaining Known Risks

- **P2**: `invoiceRouter.markPaid` doesn't recalculate invoice totals before
  locking (audit Part 12).
- **P2**: Widespread `key={index}` in reorderable `.map()` lists (audit
  Part 8) — not a crash, but can cause UI state glitches on reorder/filter.
- **P3**: `ComponentShowcase.tsx` and `DashboardLayout.tsx` are dead files
  (audit Part 2).
- **Unaudited in this pass**: Parts 4-7, 9-11, 13-17 (master data, DB
  orphans, end-to-end workflows, status consistency, technician mobile UX,
  offline/sync, report PDF privacy, contacts/Send Center, AI safety beyond
  tenancy, notifications/workflow health, accessibility/responsiveness,
  performance). No issues were found in these areas because they were not
  investigated — this is a coverage gap, not a clean bill of health.

## Recommended Next Phase

Given the size of the remaining scope, recommend splitting Parts 4-17 into
2-3 focused follow-up sessions:

1. **Data integrity & workflows** (Parts 4-7): master data alignment, DB
   orphan/dependency audit, end-to-end workflow tracing, status consistency.
2. **Field operations** (Parts 9-11, 13): technician mobile usability,
   offline/sync robustness, report/PDF privacy, contacts/Send Center
   recipient resolution — these directly affect daily technician and office
   usage.
3. **Platform health** (Parts 14-17): AI safety guarantees beyond tenancy,
   notifications/activity/workflow health, accessibility/responsiveness,
   performance (N+1/pagination/bundle size).

## Manual Smoke-Test Results

**Manual UI smoke testing of the running application was not performed.**
This sandbox does not have a configured `DATABASE_URL` or live OAuth
credentials, so the dev server cannot be exercised end-to-end (data-backed
pages render empty states, and login is not possible). Verification for this
pass was limited to:

- Static analysis / code reading of every changed procedure and component.
- `tsc --noEmit`, `vitest run`, `vite build`, and an `esbuild` server-bundle
  check, all passing as described above.

This is stated explicitly per "do not hide existing failures" — a real
smoke test against a populated database and live login should be performed
before/after deploying these changes to Railway.

---

# Phase 2 — Data Integrity & Workflows (Parts 4-7)

This phase covers the first item of the "Recommended Next Phase" above:
master data alignment, DB orphan/dependency audit, end-to-end workflow
tracing, and status consistency.

## Part 4 — Master Data Alignment (Fixed)

Several create/update mutations accepted client-supplied foreign keys
(`customerOrgId`, `siteId`, `areaId`, `companyId`) without verifying they
belonged to the caller's company — a cross-tenant data-integrity gap (a
malicious or buggy client could attach a job/site/device to another
company's customer org).

- `siteRouter.listByCompany` — now rejects if `input.companyId !==
  ctx.user.companyId`.
- `siteRouter.create` / `siteRouter.update` — now validate
  `customerOrgId` via `db.getCustomerOrgById()` and check
  `customerOrg.companyId === ctx.user.companyId`.
- `deviceRouters.areaRouter.create` — now validates the parent site belongs
  to the caller's company before creating the area.
- `deviceRouters.deviceRouter.create` — now validates `companyId`, the
  parent `siteId`, and (if provided) `areaId` belongs to that site.
- `deviceRouters.deviceRouter.addDuringInspection` — replaced a manual job
  lookup with `db.assertJobCompany()`, added a finalized-job guard, validated
  the site, and **always attributes the new device to the job's own
  `companyId`** rather than trusting client input.
- `deviceRouters.smokeAlarmRouter.create` — same `companyId`/site validation
  as `deviceRouter.create`.
- `jobRouter.create` — now validates `siteId` and `customerOrgId` both
  belong to the caller's company before creating the job.

## Part 5 — DB Orphan / Dependency Audit (Fixed)

`db.deleteJobCascade()` previously deleted a job and only some of its
dependents, silently leaving orphaned rows in several derivative tables and
allowing a job with **billing records** (quotes/invoices/approved work) to be
deleted out from under them.

- Added a pre-flight check: if the job has any `quotes`, `invoices`, or
  `approvedWork` rows, deletion is now rejected with a `BAD_REQUEST` —
  financial records must never silently disappear with a job delete.
- Cascade now also deletes: `repairs` (via the job's deficiencies),
  `sprinklerInspections` and its child tables (`sprinklerSystems`,
  `sprinklerChecklistItems`, `sprinklerDevices`), `aiReviews`, `attachments`,
  `fireAlarmAttendanceLog`, `fireAlarmAncillaryCircuits`,
  `inspectionChecklistResponses`, `fireAlarmInspectionResults`,
  `fireAlarmFormHeader`.
- Tracking tables that merely *reference* a deleted job
  (`monthlyServiceTracking.linkedJobId`, `repairLetterTracking.linkedJobId`)
  are now nulled instead of left dangling.

## Part 6 — End-to-End Workflow Tracing (Fixed)

Two workflow breaks were found by tracing the inspection → finalize and
quote → work-order paths end-to-end:

- **P0 — Job finalization was unreachable.** `jobRouter.complete`
  (technician-side "finish job") sets `status: 'completed'` *before*
  `finalizeJob()` runs. But `finalizeJob()`'s status matrix threw
  `JOB_ALREADY_FINALIZED` whenever `job.status === "completed"`, regardless
  of whether `finalizedAt` was actually set. Since the only UI entry point
  (`FinalizeJobDialog`, shown whenever `!job.finalizedAt`) always hit this
  dead branch, **no job could ever be finalized** — the immutability/
  compliance-hash sealing step was permanently dead code. Fixed by removing
  that branch so a job with `status === 'completed' && finalizedAt === null`
  can proceed through the existing signature-check and hash-computation
  logic. `completedAt` is preserved if already set (`job.completedAt ?? now`)
  rather than overwritten.
- **P1 — Customer portal quote approval skipped work-order creation.**
  `quoteRouter.approveFromPortal` only marked linked deficiencies `quoted`,
  but never created the corresponding `work_orders` row — unlike the
  office-side accept flow. Customers approving quotes via the portal left
  office staff to manually run "Create Work Order" afterward. Fixed by
  exporting `_createWorkOrderFromQuote()` from `repairQuoteRouter.ts` and
  calling it from `approveFromPortal`, mirroring the office flow.

## Part 7 — Status Consistency (Fixed)

Status labels/colors for the same underlying enum were defined
independently (and inconsistently) across many pages, and some statuses
(`deferred`, `quoted` for deficiencies) had no UI mapping at all and rendered
as raw enum strings (e.g. `in_progress`).

Per the "centralized label maps over enum migrations" guidance, added
`client/src/lib/statusLabels.ts` — presentation-only label/badge-class maps
and getters for: quote status, deficiency status, job status, and approved-
work status. No enum values changed.

- **Quotes** (`AdminQuotes.tsx`, `BuildingQuoteDetail.tsx`,
  `RepairQuoteDetail.tsx`, `customer/Quotes.tsx`) — replaced 4 separate
  partial `STATUS_CONFIG`/`STATUS_BADGE`/`STATUS_LABELS` maps (some only
  covering 4 of 11 statuses) with the shared `getQuoteStatusLabel` /
  `getQuoteStatusBadgeClass`.
- **Deficiencies** (`technician/DeficiencyList.tsx`,
  `admin/JobDetails.tsx`, `technician/JobDetails.tsx`) — `deferred` and
  `quoted` previously fell through to raw `def.status` text or a generic
  "pending" color; now use `getDeficiencyStatusLabel` /
  `getDeficiencyStatusBadgeClass`, which map all 6 statuses.
- **Jobs** (`technician/JobsList.tsx`, `admin/Jobs.tsx`) — removed two
  duplicated `getStatusBadgeClass` functions (which rendered `in_progress`
  as raw `"in progress"` text with a one-off color) in favor of
  `getJobStatusLabel` / `getJobStatusBadgeClass`, both now showing
  "In Progress".
- **Approved Work** (`admin/Dashboard.tsx`, `admin/ApprovedWorkDetail.tsx`)
  — removed two diverging local color maps (`AW_STATUS_COLORS` vs.
  `statusBadgeClass()`, which used different colors and dark-mode variants
  for the same statuses) in favor of `getApprovedWorkStatusLabel` /
  `getApprovedWorkStatusBadgeClass`, so the dashboard snapshot and the work
  order detail page now render identical badges for the same status.

## Deferred Items (Documented, Not Implemented)

Per "no broad rewrites / no destructive master-data operations / requires
manual migration":

- **P3**: `scripts/backfillSiteBuildingIds.ts` defaults to a live run
  instead of dry-run, inconsistent with sibling backfill scripts.
- **P2**: `jobs`, `devices`, `sites`, and `customer_orgs` lack indexes on
  their `companyId`/`siteId` foreign-key columns. Adding indexes is
  additive and safe outside a transaction (per CLAUDE.md, PlanetScale just
  doesn't support `ALTER TABLE` *inside* transactions), but should be run
  manually on Railway as a follow-up migration, not bundled into this code
  change.
- **P3**: No manual "generate next job now" UI trigger for the recurring
  work scheduler.
- **P2**: `PAYROLL_STATUS_COLORS` is triplicated across
  `admin/PayrollHours.tsx`, `admin/PayrollReview.tsx`, and
  `technician/PayrollHours.tsx`. The three copies are currently identical
  (no visible bug), so left as-is — a future cleanup could move this into
  `statusLabels.ts` alongside the other maps added in this phase.

## Phase 2 Checks / Build Results

- `npx tsc --noEmit` — **clean**, no errors.
- `npx vitest run` — **782 passed / 2 failed / 59 skipped (843 total)**,
  same 2 pre-existing failures as Phase 1 (confirmed via `git stash` to
  exist on the pre-change baseline too — unrelated to this phase).
- `npx vite build` — **clean**.
- `esbuild server/_core/index.ts ... --bundle --format=esm` — **clean**,
  ~1.3 MB bundle.

## Phase 2 Manual Smoke-Test Results

As with Phase 1, this sandbox has no `DATABASE_URL`/OAuth configured, so a
live UI smoke test was not possible. Verification was limited to static
analysis and the build/test/typecheck commands above. A real smoke test of
job finalization, customer-portal quote approval → work order creation, and
the updated status badges should be performed against a populated
environment before/after deploying.
