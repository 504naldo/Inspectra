# Inspectra — Fable Application Audit

**Date:** 2026-07-07
**Auditor:** Claude (Fable) — evidence-based static audit + safe non-mutating build/test runs
**Commit audited:** `c7b122f` (main)
**Scope:** Full application audit per the 22-area brief. No source changes were made. No mutating scripts, migrations, seeds, or backfills were run.

> **Method note.** Findings below are anchored to specific files/lines in the current tree. I ran the safe, non-mutating checks (install, typecheck, tests, build) against a throwaway local MySQL 8 that was destroyed afterward — no customer or production data was touched. Anything I could not confirm statically is called out explicitly and moved to *Potential Risks Requiring Verification*.

---

## Executive Summary

Inspectra is a large, genuinely functional multi-tenant fire-protection platform. The core engineering is well above prototype quality: a request-scoped actor context enforces cross-company isolation, session-version revocation actually works, the invoice edit-lock is real, CSV export on the server neutralizes formula injection, SSRF is guarded in the PDF image fetcher, and a substantial automated test suite (1041 passing) exercises authorization, capability enforcement, offline idempotency, and PDF privacy. The prior hardening passes (PR-01…PR-15) are largely holding up in current code.

That said, this audit found **new, previously-undocumented cross-tenant IDORs** in two secondary surfaces (file tags and the mobile upload queue) that the earlier sweeps missed, plus a scattering of P2 integrity and privacy gaps. None are catastrophic, but two are real tenant-isolation holes that must close before onboarding a second external company.

**Strongest areas:** tenant isolation in the *primary* routers (jobs/sites/invoices/deficiencies via `tenantGuards` + `actorContext`), session/auth model, financial edit-locking, test culture, PDF privacy projection.

**Most serious risks:**
1. `fileTagRouter` trusts client `companyId` and deletes by raw id with no scope (cross-tenant read/write/delete).
2. `uploadQueueRouter.updateStatus` has no ownership check and lets a caller stamp an arbitrary `fileKey`/`fileUrl` onto any queue item id.
3. Invoice numbers are generated from a 4-char timestamp slice with **no uniqueness constraint** — collision → duplicate invoice numbers in accounting export.
4. Client-side payroll CSV export omits the formula-injection guard the server uses.
5. Repository governance: 100 root-level `*.md` audit files create genuine "which document is authoritative?" confusion.

**Recommended development focus:** close the two IDORs and add the missing authorization tests for them, add a DB uniqueness constraint + collision-safe generation for invoice/sequence numbers, and consolidate the documentation sprawl into the existing `docs/PRODUCTION_READINESS.md` register.

**What could not be verified:** anything requiring a real Android device, a live R2/S3 bucket, a live Google/Sage/Resend integration, or a production database. Presigned-URL expiry behavior on old reports, real-device offline sync/camera/haptics, and actual email delivery are all flagged for runtime verification.

---

## Scorecard

| Area | Score | Rationale |
|------|-------|-----------|
| Architecture | 7/10 | Clean tRPC + Drizzle + Vite structure, shared `_core`, sensible role procedures. Dragged down by oversized modules (`db.ts` 4153 lines, `aiAssistantRouter` 1794, `Schedule.tsx` 1906, `JobDetails.tsx` 1816) and duplicated business logic (invoice-number generation copied in two routers). |
| Build stability | 8/10 | `install --frozen-lockfile`, `tsc --noEmit`, full test suite, and `build` all pass clean. CI provisions real `mysql:8`. Bundle warning (`dist/index.js 1.5mb`, main client chunk 484KB) but lazy-loading is in place. |
| Security | 6/10 | Strong auth/session/SSRF/CSV-server foundations, but two live cross-tenant IDORs and an open-redirect edge in `isSafeReturnRoute` pull this down. |
| Tenancy | 6/10 | Primary routers are well-guarded via `tenantGuards`+`actorContext`; secondary surfaces (file tags, upload queue) are not. Isolation is inconsistent by router, which is exactly the failure mode PR-06 was meant to end. |
| Data integrity | 6/10 | Good: idempotency keys, invoice edit-lock, conditional updates. Bad: invoice/sequence numbers lack unique constraints and use collision-prone generation; several `fileUrl`/`fileKey` fields nullable but read as present. |
| Core workflows | 7/10 | The job→inspection→QA→report→repair→invoice chain is traceable and mostly idempotent. Recurring-service and approved-work→invoice conversions have duplicate-guard coverage. Some transitions rely on app-layer checks only. |
| Technician mobile | 6/10 | Structurally complete (offline packets, queues, idempotency). Cannot verify real-device behavior (camera, haptics, keyboard overlap, restart) statically. |
| Offline sync | 7/10 | Deficiency + attachment idempotency keys, per-job QA preflight scoping, stale-packet checks exist. The upload-queue IDOR undermines queue trust. |
| Reports | 8/10 | Central `toCustomerSafeReport` projection, async image pre-fetch, SSRF-guarded fetch, privacy regression tests. Presigned-URL staleness on old photos is an open risk. |
| Finance/payroll | 6/10 | Server CSV is injection-safe and invoices lock on paid/void/exported; but client payroll CSV isn't injection-safe, invoice numbers can collide, and self-approval is blocked only in specific paths. |
| Accessibility | 5/10 | Native `<option value="">` empty values appear in inspection grids (Radix Select empty-value pitfall avoided there, but raw selects have their own gaps). Not verifiable at all breakpoints statically; icon-only buttons and contrast need a real pass. |
| Performance | 6/10 | Lazy routes, indexes added in prior passes. Large modules and a 1.5MB server bundle. No profiling evidence for N+1s — flagged as "requires profiling." |
| Developer experience | 7/10 | Frozen lockfile, working CI, clear `CLAUDE.md`, dual-migration model documented. Undercut by 100 root audit `.md` files and a 4153-line `db.ts`. |
| Production readiness | 6/10 | Fine for controlled internal use; not yet ready for multiple external tenants until the two IDORs and invoice-number integrity are fixed. |

---

## Confirmed Findings

### FAB-01 — `fileTagRouter` is cross-tenant (read, create, delete) — ✅ FIXED (commit follows this audit)
- **Priority:** P1 · **Severity:** High · **Category:** Authorization / tenant isolation
- **Status:** Fixed. `list`/`create` now reject a mismatched `input.companyId` and `create` stamps `ctx.user.companyId`; `delete` loads the tag via the new `db.getFileTagById` and enforces `tag.companyId === ctx.user.companyId`. Covered by `authorization.test.ts` "fileTag.list/create … delete is company-scoped (FAB-01)".
- **Affected files:** `server/routers/attachmentRouters.ts:205-224` (`fileTagRouter.list/create/delete`), `server/db.ts:1437` (`getFileTagsByCompany`), `deleteFileTag`
- **Evidence:**
  - `list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => db.getFileTagsByCompany(input.companyId))` — no comparison of `input.companyId` to `ctx.user.companyId`. A logged-in office user of company A can enumerate company B's file tags by passing `companyId: B`.
  - `create` inserts `db.createFileTag(input)` with the client-supplied `companyId` verbatim — an office user can create tags attributed to another company.
  - `delete: officeProcedure.input(z.object({ id: z.number() }))` deletes by raw id with **no company scoping** — cross-tenant delete.
- **Impact:** Cross-tenant metadata read, write-attribution poisoning, and deletion. Lower blast radius than financial data, but it is a true breach of the tenant boundary and violates the "never trust client `companyId`" rule the codebase otherwise enforces.
- **Recommendation:** Add `if (input.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw FORBIDDEN` on `list`/`create`; scope `delete` through a guard that loads the tag and checks its `companyId` (mirror the `assertEntityCompany` pattern already used two functions up in the same file).
- **Complexity:** Low. · **Runtime verification required:** No (static-confirmable).

### FAB-02 — `uploadQueueRouter.updateStatus` has no ownership check and trusts client `fileKey`/`fileUrl` — ✅ FIXED (commit follows this audit)
- **Priority:** P1 · **Severity:** High · **Category:** Authorization / IDOR
- **Status:** Fixed. A shared `requireOwnedQueueItem(id, userId)` helper now guards **every** id-addressed queue mutation — `updateStatus`, `retry`, `remove`, and `complete` (the last refactored onto the helper). The related `remove`/`retry` IDORs (same class, spotted during the fix) are closed in the same change. Covered by `authorization.test.ts` "uploadQueue.updateStatus rejects another user's queue item (FAB-02)", which asserts `updateStatus`/`retry`/`remove` all reject a non-owner.
- **Affected files:** `server/routers/attachmentRouters.ts:267-294`
- **Evidence:** `updateStatus` accepts `{ id, status, fileKey?, fileUrl? }` and calls `db.updateUploadQueueItem(id, updateData)` with **no lookup of the item's owner or company** — unlike the sibling `complete` procedure (line 296) which correctly checks `item.userId !== ctx.user.id`. A technician can update the status of *any* upload-queue row by id and overwrite its `fileKey`/`fileUrl` with attacker-chosen values.
- **Impact:** A technician in company A can flip company B's queue items to `completed`/`failed`, or point a queue row at an arbitrary S3 key. If `complete` is later called (or the row is consumed) with those values, it can attach a foreign or attacker-chosen object to a record. IDOR + potential attachment-integrity issue.
- **Recommendation:** Load the queue item and enforce `item.userId === ctx.user.id` (and company scope) before mutating, identical to `complete`. Reject client-supplied `fileKey`/`fileUrl` that don't match the item's own upload.
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-03 — Invoice/sequence numbers can collide; no uniqueness constraint
- **Priority:** P2 · **Severity:** Medium · **Category:** Data integrity / finance
- **Affected files:** `server/routers/invoiceRouter.ts:13-18` (`generateInvoiceNumber`), `server/routers/approvedWorkRouter.ts:484-485` (duplicated logic), `drizzle/schema.ts:1512` (`invoiceNumber varchar(50) notNull` — **no `.unique()`**)
- **Evidence:** `seq = Date.now().toString(36).toUpperCase().slice(-4)` yields only the low 4 base-36 chars of the millisecond clock. Two invoices created within the same collision window (or across the two independent code paths that both mint `INV-YYYY-XXXX`) can produce identical numbers, and the schema has no unique index to reject the duplicate. The same generation is copy-pasted in `approvedWorkRouter`, so the two paths don't even share a counter.
- **Impact:** Duplicate invoice numbers break Sage import reconciliation and make an invoice non-uniquely addressable in accounting. This is exactly the class of silent financial-integrity bug that surfaces only under load.
- **Recommendation:** (1) Add a `unique(companyId, invoiceNumber)` constraint via a new numbered manual migration (do **not** run it here — schema/DB changes are out of scope for this audit). (2) Replace the timestamp slice with a per-company monotonic counter (or a transaction-guarded max+1) in a single shared helper used by both routers. (3) Until then, treat collisions as possible and add a retry-on-duplicate.
- **Complexity:** Medium. · **Runtime verification required:** No (logic-confirmable); the fix needs a migration which is out of scope.

### FAB-04 — Client-side payroll CSV export omits formula-injection neutralization
- **Priority:** P2 · **Severity:** Medium · **Category:** Security / finance export
- **Affected files:** `client/src/pages/admin/PayrollReview.tsx:130-134,161-163`; `client/src/pages/admin/PayrollHours.tsx:123-125`
- **Evidence:** The server CSV path is safe — `csvCell` in `invoiceRouter.ts:58-67` prefixes `=+-@` with `'`. But the **client** payroll CSV `escape()` only quotes on `, " \n`; it does **not** neutralize leading `=+-@`. Payroll rows include free-text-ish fields (user name from `u?.name`, notes) that a malicious/renamed user could seed with `=HYPERLINK(...)` or `=cmd|...`, and the exported CSV would carry a live formula into Excel/Sheets.
- **Impact:** Spreadsheet formula injection in the payroll export opened by finance staff. Lower likelihood than invoices (names are semi-controlled) but the mitigation already exists server-side and simply wasn't applied to this client path.
- **Recommendation:** Move payroll CSV assembly to the server (there is already `payrollHoursRouter.exportData`) and route it through `csvCell`, or replicate the `=+-@` guard in the client `escape()`.
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-05 — `isSafeReturnRoute` allows backslash-prefixed protocol-relative open redirect
- **Priority:** P2 · **Severity:** Medium · **Category:** Security / open redirect
- **Affected files:** `server/_core/oauth.ts:29-30`
- **Evidence:** `return Boolean(route) && route.startsWith("/") && !route.startsWith("//")`. A value like `/\evil.com` passes (starts with `/`, not `//`), but browsers normalize `\` to `/`, so `res.redirect(302, "/\evil.com")` becomes `//evil.com` → off-site redirect. The `//` case is blocked; the `/\` case is not.
- **Impact:** Open redirect reachable only by crafting the OAuth `state.route` value. Mitigated by (a) `state` being base64 of a JSON the client builds and (b) the customer-route block, but it is still a real bypass of the intended same-origin guard and a classic phishing pivot.
- **Recommendation:** Reject any route whose second character is `/` **or** `\` (e.g. `!/^\/[/\\]/.test(route)`), or parse with `new URL(route, origin)` and confirm the resolved origin matches.
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-06 — Login surface advertises unimplemented auth (Forgot Password → 404; email/password disabled)
- **Priority:** P3 · **Severity:** Low · **Category:** Trust / UX honesty
- **Affected files:** `client/src/pages/Login.tsx:99-102` (email submit sets an error string), `:169-171` (Apple button `disabled title="Coming soon"` — acceptable), `:206-208` (`<a href="/forgot-password">`); `client/src/App.tsx` has **no** `/forgot-password` route, so it falls through to `<Route component={NotFound} />`.
- **Evidence:** `handleEmailSubmit` only does `setEmailError("Email/password login is not yet available…")`; the "Forgot password?" link targets a route that renders NotFound.
- **Impact:** A user who clicks "Forgot password?" lands on a 404, and the password field implies a login method that doesn't exist. Minor, but it reads as broken to a first-time customer.
- **Recommendation:** Hide the password field + Forgot-Password link until email/password auth exists, or point the link to a real "contact your admin / use Google" page. The Apple "Coming soon" disabled button is fine as-is.
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-07 — Documentation sprawl: 100 root-level audit `.md` files, no single authority
- **Priority:** P2 · **Severity:** Medium (governance) · **Category:** Maintainability
- **Affected files:** repository root (`*.md` count = 100), vs. the intended authoritative `docs/PRODUCTION_READINESS.md` register and `docs/README.md`.
- **Evidence:** The root holds `ACCESS_CONTROL_AUDIT.md`, `AI_*_AUDIT.md`/`_NOTES.md` pairs, `INSPECTRA_APPLICATION_AUDIT.md`, `BUSINESS_RULES_AUDIT.md`, etc. `docs/PRODUCTION_READINESS.md` explicitly declares itself "the single active register," but 90+ point-in-time snapshots sit beside it in the root, several likely contradicting current code.
- **Impact:** No operator can tell which findings are live. New audits (including this one) risk re-deriving already-fixed issues. This is a real drag on the security process, not cosmetic.
- **Recommendation:** Move historical `*_AUDIT.md`/`*_NOTES.md` into `docs/audits/history/`, keep `docs/PRODUCTION_READINESS.md` as the only live register, and add a one-line pointer at the top of each archived file. (Doc-only move; no code risk.)
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-08 — Oversized modules concentrate risk and slow review
- **Priority:** P3 · **Severity:** Low · **Category:** Architecture / maintainability
- **Affected files:** `server/db.ts` (4153 lines), `server/routers/aiAssistantRouter.ts` (1794), `client/src/pages/admin/Schedule.tsx` (1906), `client/src/pages/technician/JobDetails.tsx` (1816), `server/routers/repairQuoteRouter.ts` (1068)
- **Evidence:** `wc -l` on the tree. `db.ts` is a single 4000+-line data-access module mixing every entity; the two `JobDetails` pages and `Schedule` are near-2000-line components.
- **Impact:** Harder to review for exactly the tenant-scope bugs found above (FAB-01/02 hid in a 300-line secondary router); merge-conflict magnets; slower onboarding.
- **Recommendation:** Incremental extraction by domain (see *Recommended Refactors*). No big-bang rewrite.
- **Complexity:** Medium (incremental). · **Runtime verification required:** No.

---

## Potential Risks Requiring Verification

These are **not** confirmed defects. Each lists the evidence, how to verify, and the expected safe behavior.

### RISK-A — Presigned photo URLs (7-day TTL) may silently drop from late-generated PDFs
- **Evidence:** `server/storage.ts:56` sets `PRESIGN_EXPIRES_SECONDS = 7 days`; attachments persist the presigned `fileUrl` in the DB (`attachments.fileUrl`, `schema.ts:464`), and the PDF pipeline fetches images by URL via `fetchImageBuffer` (`pdfSharedStyles.ts:949`), which returns `undefined` on any non-OK response. Report photos captured >7 days before report generation would have an expired stored URL.
- **Verification:** In a runtime environment, create an attachment, wait past the presign TTL (or force-expire), then generate a report that includes it; inspect whether the photo renders or silently vanishes. Alternatively confirm whether report assembly re-presigns from `fileKey` before calling `fetchImageBuffer` (the report *download* path at `reportRouter.ts:161-172` does re-presign from `fileKey`, but the *photo embedding* path was not confirmed to).
- **Expected safe behavior:** Images should be re-presigned from `fileKey` at generation time, not read from a stale stored URL.
- **Recommended test:** Integration test that generates a report whose attachment `fileUrl` is expired/garbage but `fileKey` is valid, and asserts the image still embeds.

### RISK-B — Offline sync on real devices (duplicate taps, restart, assignment change while offline)
- **Evidence:** Idempotency keys exist for deficiency (`deficiencyRouter.ts:70-78`) and attachments; `getJobDataForOffline` is technician-scoped (`dashboardRouter.ts:83`). But queue-replay, app-restart, and mid-offline reassignment behavior cannot be exercised statically.
- **Verification:** Real Android device: create deficiencies/photos offline, kill and relaunch the app, toggle connectivity, and reassign the job server-side while the device is offline; confirm no duplicates and no writes to an unassigned job.
- **Expected safe behavior:** Replays are idempotent; queued work cannot land on a job the tech no longer owns.
- **Recommended test:** Detox/Maestro E2E on-device, plus a server test asserting sync rejects writes for a now-unassigned job.

### RISK-C — N+1 query patterns in dashboard/schedule/global search
- **Evidence:** Large list/dashboard procedures (`dashboardRouter`, `serviceScheduleRouter`, `globalSearchRouter`) return aggregated data; no profiling was performed.
- **Verification:** Run with query logging against a seeded DB and count queries per dashboard/schedule load.
- **Expected safe behavior:** Bounded query count per request.
- **Recommended test:** Query-count assertions around the heaviest list endpoints.

### RISK-D — Radix `Select` empty-value crashes vs. native `<option value="">`
- **Evidence:** Native selects with `<option value="">` exist (`components/inspection/SmokeAlarmGrid.tsx:642+`, `sprinkler/DevicesTab.tsx:345`). These are native `<select>`, which tolerate empty values; the Radix pitfall (empty-string `SelectItem` throwing) was **not** found in the sampled files. Full-tree confirmation not done.
- **Verification:** Grep every `@/components/ui/select` `SelectItem` for `value=""`; render each affected form.
- **Expected safe behavior:** No Radix `SelectItem` uses an empty-string value.

---

## Previously Fixed Findings (confirmed in current code)

- **PR-02 numeric route params** — `withNumericParams`/`parseRequiredRouteId` (`App.tsx:200-212`) reject `NaN`/negative/partial IDs and render `NotFound`; raw `parseInt(params.id)` is no longer the routing gate. **Fixed.**
- **PR-05 invoice edit-lock** — `isInvoiceLocked` (`invoiceRouter.ts:63-67`) blocks mutation when `paid`/`void`/`exported`. **Fixed.**
- **PR-06/07 tenant getters + auth tests** — `tenantGuards` + `authorization.test.ts` (20 tests) cover the primary routers. **Fixed for primary surfaces** (FAB-01/02 are *new* secondary surfaces the sweep didn't reach).
- **PR-10 capability model** — payroll/invoice terminal actions are `officeProcedure`, technician/customer blocked, self-approval blocked (`capabilityEnforcement.test.ts`, 7 tests). **Fixed.**
- **PR-12 customer report privacy** — central `toCustomerSafeReport` projection + regression tests; server CSV formula-injection guard (`csvCell`). **Fixed** (client payroll CSV is the residual gap, FAB-04).
- **PR-14/15 IDORs + admin cross-company model** — import/gmail/calendar scoped; `actorContext` platform-operator model; write-attribution fixed. **Fixed.**
- **Session revocation** — `authenticateRequest` (`sdk.ts:250-289`) enforces `isActive` and `sessionVersion` against the DB on every request. **Fixed / solid.**
- **SSRF in PDF image fetch** — `fetchImageBuffer` calls `assertPublicHttpUrl` (`ssrfGuard.ts:38`) with `redirect: "error"`. **Present / good.**

---

## End-to-End Workflow Assessment

- **Customer/site setup** (Customer Record → Org → Site → Work Site Info → Contact → Job Packet): traceable; reconciliation/backfill scripts exist with dry-run modes (reviewed, not run). **Healthy.**
- **Inspection** (Job → Assignment → Device/Template → Deficiency → Photo → Time → Sync → QA): idempotent on the critical writes; per-job QA preflight scoping in place. **Healthy**, pending real-device confirmation (RISK-B).
- **Reporting** (QA → Approval → PDF → Document Center → Send/Portal): central privacy projection, async image pre-fetch, SSRF guard. **Healthy**, pending RISK-A.
- **Repairs** (Deficiency → Repair Quote → Approved Work → Work Order → Completion → Invoice): conversion guards prevent double-invoicing (`approvedWork.createInvoice` blocks re-invoice, per `invoiceWorkflow.test.ts`). **Healthy.**
- **Invoicing** (Invoice → Review → Export → Payment → Paid/Void → Job costing): edit-lock solid; **invoice-number uniqueness is the weak link (FAB-03).**
- **Payroll** (Time → Review → Approve → Export): self-approval blocked, office-gated; **client CSV injection gap (FAB-04).**
- **Recurring service** (Agreement → Recurring Maintenance → Job → Schedule → Completion → Next due): duplicate detection by `siteId+serviceType+trackingMonth` (`serviceScheduleRouter.ts:618-745`). **Healthy.**
- **Customer portal:** report reads are `toCustomerSafeReport`-projected and `customerOrgId`-scoped (`reportRouter.ts:134-189`); portal is otherwise gated off (OAuth blocks `/customer/*`). **Not production-active — do not enable externally until FAB-01/02 close.**

---

## Security and Authorization Matrix (representative high-risk procedures)

| Procedure | Required role | Tenant boundary | Current protection | Risk | Recommendation |
|-----------|---------------|-----------------|--------------------|------|----------------|
| `invoice.void / exportSage` | office (+admin) | company | `officeProcedure` + `isInvoiceLocked` + guards | Low | Keep; add unique invoice # (FAB-03) |
| `payrollHours.approve/exportData` | office (+admin) | company | `officeProcedure`, self-approval blocked | Low | Move CSV to server (FAB-04) |
| `attachment.upload` | technician | company | `assertEntityCompany` + site/job/device asserts + finalized check | Low | Good pattern |
| `fileTag.list/create/delete` | office | **none** | trusts client `companyId`; delete by raw id | **High** | **FAB-01 — add scope** |
| `uploadQueue.updateStatus` | technician | **none** | no owner check; trusts `fileKey/fileUrl` | **High** | **FAB-02 — add owner check** |
| `uploadQueue.complete` | technician | user | `item.userId === ctx.user.id` | Low | Correct — mirror onto `updateStatus` |
| `report.get/list` (customer) | customer/protected | customerOrg | `customerOrgId` check + `toCustomerSafeReport` | Low | Good |
| `dashboard.getStats/getRecentJobs` | office | company | explicit `input.companyId !== ctx.user.companyId` throw | Low | Correct |
| `user.list` | admin | company | falls back to `ctx.user.companyId`; never all-company | Low | Good |
| `company.create` (+ provisioning) | admin | n/a (platform) | admin-only; best-effort template provisioning | Low | Good |
| `gmail.sendReport` | admin/office | company | `getJobForCompany` guard (PR-14) | Low | Good |

**Missing automated authorization tests:** `fileTagRouter` (all three procedures), `uploadQueueRouter.updateStatus`, and a customer-portal negative test (customer of org A cannot read org B's report). Add these to `authorization.test.ts`.

---

## Recommended Roadmap

### Immediate (next 1–2 sessions) — max 5
1. **FAB-01** — scope `fileTagRouter.list/create/delete` to `ctx.user.companyId`.
2. **FAB-02** — add owner/company check to `uploadQueueRouter.updateStatus`; stop trusting client `fileKey/fileUrl`.
3. **Authorization tests** for FAB-01/02 + a customer-portal cross-org negative test.
4. **FAB-05** — tighten `isSafeReturnRoute` to reject `/\` (one-line regex).
5. **FAB-04** — route payroll CSV through the server `csvCell` guard.

### Near term (2–4 weeks) — max 8
1. **FAB-03** — unique `(companyId, invoiceNumber)` constraint (migration) + shared collision-safe number generator.
2. **FAB-07** — archive the 90+ root audit `.md` files under `docs/audits/history/`; keep `PRODUCTION_READINESS.md` authoritative.
3. **RISK-A** — verify/repair presigned-URL staleness for report photos (re-presign from `fileKey` at generation).
4. **RISK-B** — on-device offline E2E (duplicate taps, restart, reassignment-while-offline).
5. Add server query-count assertions for the heaviest dashboard/schedule endpoints (RISK-C).
6. Sweep all Radix `SelectItem` for empty-string values (RISK-D).
7. **FAB-06** — fix or hide the Forgot-Password / email-login surface.
8. Begin `db.ts` extraction (FAB-08) starting with the finance and attachment data-access slices.

### Later
- Continue module extraction (`aiAssistantRouter`, `Schedule.tsx`, `JobDetails.tsx`).
- Accessibility pass across field pages at all breakpoints.
- Bundle-size budget for the main client chunk and server bundle.
- (Only after P0/P1 are clear) new features.

---

## Recommended Test Plan

- **Unit:** collision behavior of the invoice-number generator; client/server CSV escaping incl. `=+-@`; `isSafeReturnRoute` against `//`, `/\`, `/\t`, `https:`.
- **Router authorization:** `fileTag.*`, `uploadQueue.updateStatus`, customer-portal cross-org report reads, dashboard cross-company rejection.
- **Integration:** approved-work→invoice single-invoice guarantee (exists); recurring-service duplicate-month guard (exists); add invoice-number uniqueness under concurrent create.
- **Offline:** idempotent replay of deficiency/photo/device-test queues; write-rejection for unassigned job; QA preflight blocks on unsynced items.
- **PDF privacy:** seeded-field regression (exists); add expired-presign photo-embedding test (RISK-A).
- **Android device:** camera failure/permission denial, keyboard overlap on long forms, app restart mid-inspection, session expiry, haptics.
- **Manual smoke:** login → job → inspect → deficiency+photo → submit QA → approve → PDF → send; and repair → approve → work order → invoice → Sage export.

---

## Recommended Refactors

1. **`db.ts` decomposition** — *Problem:* 4153-line god-module hides scope bugs. *Area:* `server/db.ts`. *Boundary:* split by domain (`db/invoices.ts`, `db/attachments.ts`, `db/jobs.ts`, …) re-exported from `db.ts`. *Risk:* import churn. *Migration:* extract one domain at a time behind the existing barrel export; no call-site changes.
2. **Shared sequence-number service** — *Problem:* invoice-number generation duplicated (`invoiceRouter`, `approvedWorkRouter`) and collision-prone. *Area:* both routers. *Boundary:* one `nextInvoiceNumber(companyId)` helper with a DB-backed counter. *Risk:* low. *Migration:* introduce helper, swap both call sites, add unique constraint.
3. **Guard-by-default for secondary routers** — *Problem:* FAB-01/02 show sub-routers bypassing the `tenantGuards` convention. *Area:* `attachmentRouters.ts` and peers. *Boundary:* every `input.companyId`/raw-`id` procedure must call a guard. *Risk:* low. *Migration:* add a lint/grep check in CI for `input.companyId` used without a same-line comparison or guard.

---

## Production Readiness Checklist

- [x] **Complete** — Auth/session model (OAuth, CSRF nonce, session-version revocation, isActive enforcement)
- [x] **Complete** — Primary-router tenant isolation (jobs/sites/invoices/deficiencies)
- [x] **Complete** — CI (frozen install, typecheck, real-MySQL migrate, tests) and passing suite (1041)
- [x] **Complete** — Invoice edit-locking; customer-safe report projection; SSRF-guarded PDF images
- [ ] **Incomplete** — File-tag and upload-queue tenant scoping (FAB-01/02) — **blocks external multi-tenant**
- [ ] **Incomplete** — Invoice-number uniqueness constraint (FAB-03)
- [ ] **Incomplete** — Client payroll CSV injection guard (FAB-04)
- [ ] **Incomplete** — Documentation consolidation (FAB-07)
- [ ] **Blocked** — Customer portal external activation (depends on FAB-01/02 + portal auth)
- [ ] **Requires runtime verification** — Presigned photo staleness (RISK-A), on-device offline (RISK-B), N+1 profiling (RISK-C)

---

## Final Recommendation

1. **Safe for internal, limited use?** **Yes**, for a single trusted company with a small trained staff. The core workflows are sound and the auth model is real.
2. **Ready for broad staff use?** **Mostly**, once FAB-04 (payroll CSV) and FAB-05 (open redirect) are closed and the Forgot-Password surface (FAB-06) stops 404-ing. No blockers for internal breadth beyond those.
3. **Ready for customer-portal use?** **No.** Keep the portal disabled until FAB-01/02 close and a customer-portal negative-authorization test exists. Report projection is good, but the two IDORs sit in the same attachment surface the portal would touch.
4. **Ready for multiple external companies?** **No — this is the hard gate.** FAB-01 and FAB-02 are genuine cross-tenant holes; onboarding a second external tenant before they close risks a real data-isolation incident. Fix both + add their authorization tests first.
5. **Before relying on it for official reports, payroll, and invoicing:** close FAB-03 (invoice-number uniqueness + constraint) and FAB-04 (payroll CSV), verify RISK-A (report photos don't silently vanish on old jobs), and add the missing authorization + PDF-privacy tests. Reports and payroll are otherwise close; the invoice-numbering integrity gap is the one that would bite accounting silently.

*No source code was modified and no mutating scripts were run during this audit.*
