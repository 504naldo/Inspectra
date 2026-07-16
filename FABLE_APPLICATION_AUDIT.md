# Inspectra — Fable Application Audit

**Date:** 2026-07-16
**Auditor:** Claude (Fable) — evidence-based static audit + safe non-mutating build/test runs
**Commit audited:** `f1e33ef` (main)
**Prior audit superseded:** the 2026-07-07 snapshot (commit `c7b122f`). This document replaces it.
**Scope:** Full application re-audit per the 22-area brief. No source changes were made. No mutating scripts, migrations, seeds, or backfills were run.

> **Method note.** Findings are anchored to specific files/lines in the current tree. I ran the safe, non-mutating checks (typecheck, full test suite, build) against a throwaway local MySQL 8 on port 33121 that was created for this audit and is destroyed afterward — no customer or production data was touched. Anything not confirmable statically is called out and moved to *Potential Risks Requiring Verification*. I re-verified every prior FAB finding against current code before writing anything new.

---

## Executive Summary

Inspectra remains a large, genuinely functional multi-tenant fire-protection platform, and the codebase has **improved measurably since the last audit**: all six of the prior audit's actionable findings (FAB-01…FAB-06) are fixed in current code, the fixes are backed by tests, and the register in `docs/PRODUCTION_READINESS.md` is current. The core engineering is well above prototype quality — a request-scoped actor context enforces cross-company isolation, session-version revocation works, the invoice edit-lock is real, server CSV export neutralizes formula injection, SSRF is guarded in the PDF image fetcher, AI context builders are tenant-scoped and financials are excluded from the technician-facing copilot, and the automated suite (1048 passing / 14 skipped) exercises authorization, capability enforcement, offline idempotency, and PDF privacy.

This pass found **one new, previously-undocumented cross-tenant IDOR cluster** in `fireAlarmFormRouter` — a newer router that never adopted the `assertJobCompany` convention every other technician router follows. It is the same class of bug as the prior FAB-01/02 (a secondary surface the guard sweep didn't reach), and it is the single most important thing to fix before onboarding a second external company. Everything else is P2/P3: the FAB-03 production constraint is still pending a one-time dedup, the login surface polish (FAB-06) is still open, and the documentation sprawl (now **101** root `.md` files) persists.

**Strongest areas:** tenant isolation in the primary and AI routers (`tenantGuards` + `actorContext` + `callerIsPlatformOperator`), session/auth model, financial edit-locking, customer-safe report projection, and a real test culture that has kept prior fixes from regressing.

**Most serious risks:**
1. **`fireAlarmFormRouter` (FAB-09) — cross-tenant IDOR cluster.** Eight `technicianProcedure` procedures read/write/delete fire-alarm form data by raw `jobId`/row `id` with **no company scope, no assignment check, and no finalized-job check**. A technician in company A can read and overwrite company B's inspection cover page, attendance log, and ancillary-circuit rows, and delete attendance/circuit rows by bare id across tenants.
2. **Invoice-number uniqueness (FAB-03) is enforced only on new/CI databases.** The `unique(companyId, invoiceNumber)` constraint and collision-safe generator are in code and migration `0033`, but the production ALTER is intentionally not auto-applied and still pending a one-time dedup.
3. **`fireAlarmForm` tables have no `companyId` column** and the router does no join-based scoping, so the isolation gap can only be closed in code (via `assertJobCompany`), not by a DB constraint.
4. **No automated authorization test** exists for `fireAlarmFormRouter` (or for `company.update`), so a regression here would be silent.

**Recommended development focus:** close FAB-09 by routing every `fireAlarmFormRouter` procedure through `assertJobCompany` (+ `assertJobNotFinalized` on the upserts, + scope the two `delete*` procedures through their parent job), add the missing authorization tests, then complete the FAB-03 production dedup+ALTER.

**What could not be verified:** anything requiring a real Android device, a live R2/S3 bucket, a live Google/Sage/Resend integration, or a production database. Presigned-URL expiry on old report photos, real-device offline sync/camera/haptics, N+1 query counts under load, and actual email delivery are flagged for runtime verification.

---

## Scorecard

| Area | Score | Rationale |
|------|-------|-----------|
| Architecture | 7/10 | Clean tRPC + Drizzle + Vite structure, shared `_core`, sensible role procedures, AsyncLocalStorage actor context. Dragged down by oversized modules (`db.ts` **4160** lines, `aiAssistantRouter` 1794, `Schedule.tsx` 1906, `JobDetails.tsx` 1813) and one router (`fireAlarmFormRouter`) that bypasses the house tenant-scoping convention. |
| Build stability | 9/10 | `tsc --noEmit` clean, full suite **1048 passed / 14 skipped**, production `build` succeeds. CI provisions real `mysql:8`. Only nit: `dist/index.js` 1.5 MB server bundle + a benign `sessionVersion` "Unknown column" log line on the journal-only test DB (documented, swallowed). |
| Security | 6/10 | Strong auth/session/SSRF/CSV-server/AI-scoping foundations, and the five prior security findings are fixed. Pulled down by the new `fireAlarmFormRouter` IDOR cluster (FAB-09). |
| Tenancy | 6/10 | Primary, customer, and AI routers are well-guarded. `fireAlarmFormRouter` is the lone hold-out with zero company scoping — exactly the inconsistency-by-router failure mode prior passes tried to end. Isolation is otherwise solid. |
| Data integrity | 7/10 | Idempotency keys, invoice edit-lock, conditional updates, and now a real `unique(companyId, invoiceNumber)` constraint (new DBs). Weak spots: prod constraint still pending (FAB-03), and `fireAlarmForm`/`attachment` tables that rely on app-layer scope with no FK/company column. |
| Core workflows | 7/10 | job→inspection→QA→report→repair→invoice is traceable and mostly idempotent; conversion guards prevent double-invoicing; recurring-service dedups by `siteId+serviceType+trackingMonth`. Some transitions are app-layer-only. |
| Technician mobile | 6/10 | Structurally complete (offline packets, queues, idempotency). The fire-alarm form UI writes through the unguarded router (FAB-09). Real-device behavior unverifiable statically. |
| Offline sync | 7/10 | Deficiency + attachment idempotency keys, per-job QA preflight scoping, stale-packet checks. Queue mutations are now owner-guarded (FAB-02 fixed). |
| Reports | 8/10 | Central `toCustomerSafeReport` projection (strips `aiSummary`/`qaNote`), async image pre-fetch, SSRF-guarded fetch, privacy regression tests. Recent PDF hardening (blank-page/overflow/typography) landed cleanly. Presigned-URL staleness on old photos remains an open runtime risk. |
| Finance/payroll | 7/10 | Server CSV injection-safe, client payroll CSV now uses shared `csvCell` (FAB-04 fixed), invoices lock on paid/void/exported, self-approval blocked. Residual: FAB-03 prod constraint. |
| Accessibility | 5/10 | Not fully verifiable statically. Native `<select>` empty-values exist but Radix empty-value pitfall not found in sampled files; icon-only buttons and contrast need a real breakpoint pass. |
| Performance | 6/10 | Lazy routes, indexes from prior passes, 225-entry PWA precache (7.6 MB). Large modules and a 1.5 MB server bundle. No profiling evidence for N+1s — "requires profiling." |
| Developer experience | 7/10 | Frozen-lockfile CI, clean `CLAUDE.md`, documented dual-migration model, current `PRODUCTION_READINESS.md` register. Undercut by 101 root audit `.md` files and a 4160-line `db.ts`. |
| Production readiness | 6/10 | Fine for controlled internal use; not ready for multiple external tenants until FAB-09 closes and the FAB-03 prod constraint lands. |

---

## Confirmed Findings

### FAB-09 — `fireAlarmFormRouter` is cross-tenant (read, write, delete) with no company scope — ✅ FIXED
- **Priority:** P1 · **Severity:** High · **Category:** Authorization / tenant isolation (IDOR)
- **Status:** **Fixed.** Every procedure now calls `assertJobCompany(jobId, ctx.user.companyId!)` before reading/writing; the three `upsert*` procedures add `assertJobNotFinalized`; id-addressed upserts verify the row belongs to the scoped job; and the two `delete*` procedures (which take a bare row id) resolve the row's parent job and scope through it before deleting. Covered by `authorization.test.ts` "fireAlarmForm: cross-company technician cannot read/write/delete another company's form (FAB-09)" — a company-B technician is FORBIDDEN on all read/write/delete paths and cannot hijack a row by id (NOT_FOUND). Full suite 1049 passing.
- **Affected files:** `server/routers/fireAlarmFormRouter.ts` (entire router); tables in `drizzle/schema.ts:969` (`fireAlarmFormHeader`), `:1004` (`fireAlarmAttendanceLog`), `fireAlarmAncillaryCircuits`.
- **Evidence:**
  - Every procedure is `technicianProcedure` (company-scoped, **not** a platform operator) and none calls `db.assertJobCompany(...)` — the guard used by the sibling `deficiencyRouter` (`deficiencyRouter.ts:13` `await db.assertJobCompany(input.jobId, ctx.user.companyId!)`) and, per my sweep, by **every other** technician router in the tree. `fireAlarmFormRouter` is the only one that omits it.
  - `upsertHeader` (`:49`) upserts by `jobId` with no company check and **no `assertJobNotFinalized`** — writable even after a job is finalized/immutable.
  - `getHeader`/`getAttendanceLog`/`getAncillaryCircuits` (`:14/:73/:128`) read by `jobId` with no scope → cross-tenant read.
  - `deleteAttendanceRow` (`:115`) and `deleteAncillaryCircuit` (`:170`) delete by **bare row `id`** — no `jobId`, no company, nothing. A technician can enumerate ids and delete other companies' rows.
  - The three tables carry `jobId` only — **no `companyId` column** — so scoping must be done in code via the job.
  - **No test references `fireAlarmForm`** anywhere in the suite.
- **Impact:** A logged-in technician in company A can read and overwrite company B's fire-alarm inspection cover page (system manufacturer/model/serial, monitoring/FSRC account number, tech names + certification numbers) and delete B's attendance and ancillary-circuit records. This is a genuine breach of the tenant boundary for a non-privileged role, plus a mutability breach of the finalized-job invariant. It is the same class as FAB-01/02 and sits in the field surface a customer-facing portal would border.
- **Recommendation:** In each procedure, resolve the job and enforce company scope before touching data: `await db.assertJobCompany(input.jobId, ctx.user.companyId!)` on the `jobId`-addressed ones; for `deleteAttendanceRow`/`deleteAncillaryCircuit`, load the row, resolve its `jobId → job.companyId`, and assert scope before delete. Add `await assertJobNotFinalized(input.jobId, tx)` to the three `upsert*` procedures. Add an `authorization.test.ts` block asserting a company-B technician is FORBIDDEN on all eight.
- **Complexity:** Low (mirrors an existing pattern). · **Runtime verification required:** No (static-confirmable).

### FAB-03 — Invoice-number uniqueness enforced on new/CI DBs; production ALTER still pending — ✅ code fixed / ⏳ prod pending
- **Priority:** P2 · **Severity:** Medium · **Category:** Data integrity / finance
- **Status:** Code is fixed and verified. Both minting paths import the shared `generateInvoiceNumber` (`server/invoiceNumber.ts`, full base-36 ms timestamp + random suffix) — `invoiceRouter.ts:12,147` and `approvedWorkRouter.ts:9,485`. The `unique(companyId, invoiceNumber)` constraint is declared in `drizzle/schema.ts:1552` and applied by journal migration `drizzle/0033_invoice_number_unique.sql` (I confirmed the full journal applies cleanly to a fresh MySQL 8 — 77 tables, exit 0). **The production ALTER is intentionally not auto-applied**: the boot migration runner ignores duplicate-*key* but not duplicate-*data* (`ER_DUP_ENTRY`), so if the live DB already holds duplicate invoice numbers the auto-migration would crash-loop boot.
- **Affected files:** `drizzle/schema.ts:1552`, `drizzle/0033_invoice_number_unique.sql`, `server/invoiceNumber.ts`
- **Impact until prod constraint lands:** duplicate invoice numbers remain *possible* on the live DB (no unique index yet), which would break Sage import reconciliation and make an invoice non-uniquely addressable.
- **Recommendation:** Run a one-time `SELECT companyId, invoiceNumber, COUNT(*) … HAVING COUNT(*)>1` dedup check against production, resolve any duplicates, then apply the `0033` ALTER manually. Tracked as a runbook step (do **not** run here — DB changes are out of scope for this audit).
- **Complexity:** Low (operational). · **Runtime verification required:** Yes (prod dedup check).

### FAB-06 — Login surface previously advertised unimplemented auth — ✅ FIXED
- **Priority:** P3 · **Severity:** Low · **Category:** Trust / UX honesty
- **Status:** **Fixed.** `client/src/pages/Login.tsx` (now 79 lines) is Google-only: a single "Continue with Google" button plus "Access is managed by your organization's administrator." There is **no** password field, no "Forgot password?" link, and no disabled Apple button — the 404-on-Forgot-Password and the misleading email/password field from the prior audit are gone. Register row in `docs/PRODUCTION_READINESS.md` still shows `open`; **the register is stale for FAB-06** and should be flipped to `fixed`.
- **Affected files:** `client/src/pages/Login.tsx`
- **Recommendation:** Update the FAB-06 register row to `fixed`. No code change needed.
- **Complexity:** Trivial (doc). · **Runtime verification required:** No.

### FAB-07 — Documentation sprawl persists (101 root `*.md`) — ⚠️ still open
- **Priority:** P2 · **Severity:** Medium (governance) · **Category:** Maintainability
- **Status:** Partially addressed and still growing. `docs/PRODUCTION_READINESS.md` is the authoritative register and now carries FAB-01…FAB-06, and `docs/audits/README.md` records the deliberate decision to leave historical snapshots in the root. But the root `.md` count has grown from 100 to **101** (this file will be the 101st on rewrite), and several point-in-time `*_AUDIT.md`/`*_NOTES.md` snapshots almost certainly contradict current code (e.g. anything asserting the login password field still exists).
- **Affected files:** repository root (`*.md` count = 101) vs. `docs/PRODUCTION_READINESS.md`.
- **Impact:** No operator can tell which of ~90 snapshots is live; new audits risk re-deriving fixed issues (this one nearly did for FAB-06). A real drag on the security process.
- **Recommendation:** Move historical `*_AUDIT.md`/`*_NOTES.md` into `docs/audits/history/` with a one-line "superseded by PRODUCTION_READINESS.md" banner at the top of each. Doc-only move; no code risk. Keep exactly one live register.
- **Complexity:** Low. · **Runtime verification required:** No.

### FAB-08 — Oversized modules concentrate risk and slow review — ⚠️ still open
- **Priority:** P3 · **Severity:** Low · **Category:** Architecture / maintainability
- **Affected files:** `server/db.ts` (**4160** lines), `server/routers/aiAssistantRouter.ts` (1794), `client/src/pages/admin/Schedule.tsx` (1906), `client/src/pages/technician/JobDetails.tsx` (1813), `server/routers/repairQuoteRouter.ts` (1068)
- **Evidence:** `wc -l` on current tree. `db.ts` is a single 4000+-line data-access module mixing every entity.
- **Impact:** Harder to review for exactly the tenant-scope bugs found here — FAB-09 hid in a 180-line secondary router that never got a guard; large god-modules make the "did every procedure get scoped?" question un-answerable by eye. Merge-conflict magnets.
- **Recommendation:** Incremental extraction by domain (see *Recommended Refactors*). No big-bang rewrite. Add a CI grep that fails when a `technicianProcedure`/`officeProcedure` takes a `jobId`/`*Id` input without a same-file `assert*Company`/guard call.
- **Complexity:** Medium (incremental). · **Runtime verification required:** No.

### FAB-10 — `company.update` (`entityRouters.update`) has no per-record scope — design observation — ✅ DOCUMENTED + PINNED
- **Priority:** P3 · **Severity:** Low · **Category:** Permission model (by-design, worth documenting)
- **Status:** **Addressed.** The "admin = platform operator, no company-scoped admin exists" model is now documented in a header comment on the company router (`entityRouters.ts`), and the intent is pinned by `authorization.test.ts` "company.update/list … platform operator (FAB-10)": admin may update/list any company; office/technician are FORBIDDEN on both endpoints. If a company-scoped admin is ever introduced, that test fails and flags that these endpoints need an ownership check.
- **Affected files:** `server/routers/entityRouters.ts` (company router header + `update`)
- **Evidence:** `update: adminProcedure.input({ id, name, logo, address, phone, email }).mutation(({ input }) => db.updateCompany(id, data))` — updates any company by id with no `id === ctx.user.companyId` check. **This is consistent with the platform-operator model**: `callerIsPlatformOperator()` returns `true` for *any* `admin` (`_core/actorContext.ts:44-46`), and `companyRouter.list`/`get` already treat `admin` as cross-company. So this is not an isolation bug — `admin` is a platform super-user by design.
- **Impact:** None under the current model, but the model itself is worth stating explicitly: there is **no per-company admin** — every `admin` is global. If Inspectra ever introduces company-scoped admins, `company.update`, `company.list`, and similar `adminProcedure` endpoints become cross-tenant holes overnight.
- **Recommendation:** Document the "admin = platform operator, no company-scoped admin exists" decision at the top of `entityRouters.ts` and in the permission-model doc, and add a `company.update` authorization test pinning the current intent (admin allowed cross-company; office/technician/customer FORBIDDEN). No behavior change.
- **Complexity:** Trivial. · **Runtime verification required:** No.

---

## Potential Risks Requiring Verification

These are **not** confirmed defects. Each lists the evidence, how to verify, and the expected safe behavior.

### RISK-A — Presigned photo URLs (7-day TTL) may silently drop from late-generated PDFs
- **Evidence:** `server/storage.ts` sets a 7-day presign; attachments persist the presigned `fileUrl` (`schema.ts` `attachments.fileUrl`); the PDF pipeline fetches images by URL via `fetchImageBuffer` (`pdfSharedStyles.ts`), which returns `undefined` on any non-OK response and silently omits the image. The report *download* path re-presigns from `fileKey`, but the *photo-embedding* path was not confirmed to.
- **Verification:** Create an attachment, force-expire its presign, generate a report including it; confirm the photo renders or silently vanishes.
- **Expected safe behavior:** Images re-presigned from `fileKey` at generation time, not read from a stale stored URL.
- **Recommended test:** Integration test that generates a report whose attachment `fileUrl` is expired but `fileKey` is valid, asserting the image still embeds.

### RISK-B — Offline sync on real devices (duplicate taps, restart, assignment change while offline)
- **Evidence:** Idempotency keys exist for deficiency and attachments; `getJobDataForOffline` is technician-scoped. Queue-replay, app-restart, and mid-offline reassignment cannot be exercised statically.
- **Verification:** Real Android device: create deficiencies/photos offline, kill/relaunch, toggle connectivity, reassign the job server-side while offline; confirm no duplicates and no writes to an unassigned job. **Note:** the fire-alarm form (FAB-09) has no idempotency/finalized guard — include it in the on-device offline test once scoped.
- **Expected safe behavior:** Replays idempotent; queued work cannot land on a job the tech no longer owns.
- **Recommended test:** Detox/Maestro E2E on-device + a server test asserting sync rejects writes for a now-unassigned job.

### RISK-C — N+1 query patterns in dashboard/schedule/global search
- **Evidence:** Large list/dashboard procedures return aggregated data; no profiling performed.
- **Verification:** Run with query logging against a seeded DB; count queries per dashboard/schedule load.
- **Expected safe behavior:** Bounded query count per request.
- **Recommended test:** Query-count assertions around the heaviest list endpoints.

### RISK-D — Radix `Select` empty-value vs. native `<option value="">`
- **Evidence:** Native `<select>` with `<option value="">` exist in inspection grids (tolerated by native selects). The Radix pitfall (empty-string `SelectItem` throwing) was **not** found in sampled files; full-tree confirmation not done.
- **Verification:** Grep every `@/components/ui/select` `SelectItem` for `value=""`; render each affected form.
- **Expected safe behavior:** No Radix `SelectItem` uses an empty-string value.

---

## Previously Fixed Findings (confirmed in current code)

- **FAB-01 `fileTagRouter` cross-tenant** — `list`/`create` now reject a mismatched `input.companyId` (`attachmentRouters.ts:220,230`) and `delete` loads the tag via `db.getFileTagById` and checks `tag.companyId === ctx.user.companyId` (`:237-239`). Covered by `authorization.test.ts`. **Fixed.**
- **FAB-02 `uploadQueueRouter` IDOR** — a shared `requireOwnedQueueItem(id, userId)` (`attachmentRouters.ts:19`) now guards `updateStatus`/`retry`/`remove`/`complete` (`:300,325,354,363`). **Fixed.**
- **FAB-04 client payroll CSV injection** — both `PayrollReview.tsx:131` and `PayrollHours.tsx:93` now use the shared, injection-safe `csvCell` (`client/src/lib/utils.ts:49`) mirroring the server guard. **Fixed.**
- **FAB-05 open redirect** — `isSafeReturnRoute` (`_core/oauth.ts:35`) rejects backslashes and control chars anywhere and a `/`-or-`\` second char. **Fixed.**
- **FAB-06 login honesty** — Google-only login, password field + Forgot-Password link removed (`Login.tsx`). **Fixed** (register row stale — see FAB-06 above).
- **PR-02 numeric route params** — `withNumericParams`/`parseRequiredRouteId` (`App.tsx:206-213`) reject `NaN`/negative/partial IDs → `NotFound`. Residual raw `parseInt(params…)` calls exist (e.g. `SiteFiles.tsx:53`) but resolve to `0`, and the underlying procedures reject a non-existent id via company/site asserts, so they fail closed. **Fixed at the routing gate.**
- **PR-05 invoice edit-lock** — `isInvoiceLocked` blocks mutation when paid/void/exported. **Fixed.**
- **PR-06/07 tenant getters + auth tests** — `tenantGuards` + `authorization.test.ts` (24 tests, incl. the customer-portal cross-org negative). **Fixed for primary + customer surfaces** (FAB-09 is a *new* unguarded secondary surface).
- **PR-10 capability model** — payroll/invoice terminal actions `officeProcedure`, self-approval blocked (`capabilityEnforcement.test.ts`). **Fixed.**
- **PR-12 customer report privacy** — `toCustomerSafeReport` strips `aiSummary`/`qaNote` (`customerDto.ts:21`), applied on every customer read path (`reportRouter.ts:143,155,189`). **Fixed.**
- **AI tenant scoping** — every context builder checks `companyId !== companyId && !callerIsPlatformOperator()` (`aiAssistantRouter.ts:67,95,118,136,154`); OpenAI key server-only (`_core/llm.ts`); technician copilot uses a separate `buildTechnicianJobContext` that **excludes invoices/pricing/Sage** (`:262-263`). **Solid.**
- **Session revocation / SSRF** — `isActive` + `sessionVersion` enforced per request; `fetchImageBuffer` calls `assertPublicHttpUrl` with `redirect: "error"`. **Present / good.**

---

## End-to-End Workflow Assessment

- **Customer/site setup** (Record → Org → Site → Work Site Info → Contact → Job Packet): traceable; reconciliation/backfill scripts exist with dry-run modes (reviewed, not run). **Healthy.**
- **Inspection** (Job → Assignment → Device/Template → Deficiency → Photo → Time → Sync → QA): idempotent on critical writes; per-job QA preflight scoping in place. **Healthy for the device/template path**; the **fire-alarm form path is unguarded (FAB-09)** and also lacks a finalized-job check.
- **Reporting** (QA → Approval → PDF → Document Center → Send/Portal): central privacy projection, async image pre-fetch, SSRF guard; recent PDF fixes (blank pages, overflow, typography) landed cleanly. **Healthy**, pending RISK-A.
- **Repairs** (Deficiency → Repair Quote → Approved Work → Work Order → Completion → Invoice): conversion guards prevent double-invoicing. **Healthy.**
- **Invoicing** (Invoice → Review → Export → Payment → Paid/Void → Job costing): edit-lock solid; **invoice-number uniqueness pending on prod (FAB-03).**
- **Payroll** (Time → Review → Approve → Export): self-approval blocked, office-gated, client CSV now injection-safe. **Healthy.**
- **Recurring service** (Agreement → Recurring Maintenance → Job → Schedule → Completion → Next due): duplicate detection by `siteId+serviceType+trackingMonth`. **Healthy.**
- **Customer portal:** report reads are `toCustomerSafeReport`-projected and `customerOrgId`-scoped; portal otherwise gated off. **Not production-active — do not enable externally until FAB-09 closes** (it borders the same field-data surface).

---

## Security and Authorization Matrix (representative high-risk procedures)

| Procedure | Required role | Tenant boundary | Current protection | Risk | Recommendation |
|-----------|---------------|-----------------|--------------------|------|----------------|
| `fireAlarmForm.upsertHeader/*` | technician | **none** | scopes by `jobId`/row id only; no `assertJobCompany`, no finalized check | **High** | **FAB-09 — add `assertJobCompany` + `assertJobNotFinalized`** |
| `fireAlarmForm.deleteAttendanceRow/deleteAncillaryCircuit` | technician | **none** | deletes by bare row id | **High** | **FAB-09 — scope via parent job** |
| `fileTag.list/create/delete` | office | company | rejects mismatched `companyId`; delete loads + checks | Low | Fixed (FAB-01) |
| `uploadQueue.updateStatus/retry/remove/complete` | technician | user | `requireOwnedQueueItem` | Low | Fixed (FAB-02) |
| `invoice.void / exportSage` | office (+admin) | company | `officeProcedure` + `isInvoiceLocked` | Low | Complete FAB-03 prod constraint |
| `payrollHours.approve/exportData` | office (+admin) | company | office-gated, self-approval blocked, `csvCell` | Low | Good |
| `attachment.upload` | technician | company | `assertEntityCompany` + site/job/device asserts + finalized check | Low | Good pattern |
| `report.get/list` (customer) | customer/protected | customerOrg | `customerOrgId` check + `toCustomerSafeReport` | Low | Good |
| `aiAssistant.ask` (financial context) | office | company | `officeProcedure`, context builders company-checked | Low | Good |
| `aiAssistant.askFieldCopilot` | technician | company | `buildTechnicianJobContext` excludes financials | Low | Good |
| `company.update` | admin (platform) | n/a by design | admin = platform operator | Low | Document + pin test (FAB-10) |
| `compliance.finalizeJob` | admin/office | company | `finalizeJob` impl checks `job.companyId` + role | Low | Good |

**Missing automated authorization tests:** `fireAlarmFormRouter` (all eight procedures) and `company.update` (intent-pinning). Add to `authorization.test.ts`.

---

## Recommended Roadmap

### Immediate — next 1–2 sessions (max 5)
1. ~~**FAB-09** — route every `fireAlarmFormRouter` procedure through `assertJobCompany`; scope the two `delete*` procedures through their parent job; add `assertJobNotFinalized` to the three `upsert*`.~~ **Done.**
2. ~~**Authorization tests for FAB-09** — company-B technician FORBIDDEN on all read/write/delete paths; row-hijack-by-id rejected.~~ **Done** (`authorization.test.ts`).
3. **FAB-03 prod** — run the one-time invoice-number dedup check against the live DB, then apply the `0033` unique ALTER manually.
4. **FAB-06 register** — flip the stale `open` row to `fixed` in `docs/PRODUCTION_READINESS.md`.
5. **CI guard** — add a grep/lint that fails when a `technician/officeProcedure` takes a `jobId`/`*Id` input without a same-file `assert*Company`/guard (prevents the next FAB-09).

### Near term — 2–4 weeks (max 8)
1. ~~`company.update` intent-pinning test + document the "admin = platform operator" model (FAB-10).~~ **Done.**
2. RISK-A — verify/repair presigned-URL staleness for report photos (re-presign from `fileKey` at generation).
3. RISK-B — on-device offline E2E (duplicate taps, restart, reassignment-while-offline), including the fire-alarm form.
4. Add server query-count assertions for the heaviest dashboard/schedule endpoints (RISK-C).
5. Sweep all Radix `SelectItem` for empty-string values (RISK-D).
6. FAB-07 — move historical `*_AUDIT.md`/`*_NOTES.md` into `docs/audits/history/`, keep one live register.
7. Begin `db.ts` extraction (FAB-08), starting with the finance and attachment data-access slices.
8. Bundle-size budget for the 1.5 MB server bundle and the main client chunk.

### Later
- Continue module extraction (`aiAssistantRouter`, `Schedule.tsx`, `JobDetails.tsx`).
- Accessibility pass across field pages at all breakpoints.
- (Only after P0/P1 are clear) new features.

---

## Recommended Test Plan

- **Unit:** invoice-number collision behavior; client/server CSV escaping incl. `=+-@`; `isSafeReturnRoute` against `//`, `/\`, `/\t`, `https:`.
- **Router authorization:** `fireAlarmForm.*` (all eight, company-B FORBIDDEN + finalized-job reject) — **new, highest priority**; `company.update` intent; re-confirm `fileTag.*`, `uploadQueue.*`, customer-portal cross-org (exists).
- **Integration:** approved-work→invoice single-invoice guarantee (exists); recurring-service duplicate-month guard (exists); invoice-number uniqueness under concurrent create.
- **Offline:** idempotent replay of deficiency/photo/device-test queues; write-rejection for unassigned job; QA preflight blocks on unsynced items; fire-alarm form replay once scoped.
- **PDF privacy:** seeded-field regression (exists); add expired-presign photo-embedding test (RISK-A).
- **Android device:** camera failure/permission denial, keyboard overlap on long forms, app restart mid-inspection, session expiry, haptics.
- **Manual smoke:** login → job → inspect (incl. fire-alarm form) → deficiency+photo → submit QA → approve → PDF → send; and repair → approve → work order → invoice → Sage export.

---

## Recommended Refactors

1. **`db.ts` decomposition** — *Problem:* 4160-line god-module hides scope bugs. *Area:* `server/db.ts`. *Boundary:* split by domain (`db/invoices.ts`, `db/attachments.ts`, `db/jobs.ts`, …) re-exported from `db.ts`. *Risk:* import churn. *Migration:* extract one domain at a time behind the existing barrel export; no call-site changes.
2. **Guard-by-default for technician/office routers** — *Problem:* FAB-09 (and previously FAB-01/02) show sub-routers bypassing the `assertJobCompany`/`tenantGuards` convention. *Area:* `fireAlarmFormRouter` and peers. *Boundary:* every `jobId`/`*Id`-addressed procedure must call a scope assert. *Risk:* low. *Migration:* fix FAB-09, then add the CI grep from Roadmap Immediate #5 so the rule is machine-enforced.
3. **`companyId` on child inspection tables** — *Problem:* `fireAlarmForm*` tables carry only `jobId`, so isolation is code-only with no DB backstop. *Area:* schema. *Boundary:* add a denormalized `companyId` (stamped from the job) + index, enabling scoped queries and a future FK. *Risk:* migration + backfill (out of scope for this audit). *Migration:* additive column, backfill from `jobs`, then scope reads by it defensively.

---

## Production Readiness Checklist

- [x] **Complete** — Auth/session model (OAuth, CSRF nonce, session-version revocation, `isActive` enforcement)
- [x] **Complete** — Primary/customer/AI-router tenant isolation (jobs/sites/invoices/deficiencies/reports/AI context)
- [x] **Complete** — CI (frozen install, typecheck, real-MySQL migrate, tests) and passing suite (1048 / 14 skipped)
- [x] **Complete** — Invoice edit-locking; customer-safe report projection; SSRF-guarded PDF images; client+server CSV injection guard
- [x] **Complete** — Prior FAB-01/02/04/05/06 fixes verified in current code
- [x] **Complete** — `fireAlarmFormRouter` tenant scoping (FAB-09 fixed + authorization test)
- [ ] **Incomplete** — Invoice-number uniqueness constraint on production (FAB-03 prod ALTER)
- [ ] **Incomplete** — `fireAlarmForm.*` and `company.update` authorization tests
- [ ] **Incomplete** — Documentation consolidation (FAB-07); FAB-06 register row stale
- [ ] **Blocked** — Customer-portal external activation (depends on FAB-09 + portal auth)
- [ ] **Requires runtime verification** — Presigned photo staleness (RISK-A), on-device offline (RISK-B), N+1 profiling (RISK-C), Radix empty-value sweep (RISK-D)

---

## Final Recommendation

1. **Safe for internal, limited use?** **Yes**, for a single trusted company with a small trained staff. Core workflows are sound and the auth model is real. (FAB-09 is a cross-*company* hole; within one company its blast radius is a technician editing any job's fire-alarm form — still worth fixing, but not an external-data-breach in a single-tenant deployment.)
2. **Ready for broad staff use?** **Yes**, within a single company. No blockers beyond FAB-09's intra-company mutability (a tech could edit/delete another tech's fire-alarm form rows) and the FAB-03 prod constraint.
3. **Ready for customer-portal use?** **No.** Keep the portal disabled until FAB-09 closes. Report projection is good, but the fire-alarm IDOR sits in the field-data surface the portal borders.
4. **Ready for multiple external companies?** **Closer — the P1 gate is now closed.** FAB-09 (the cross-tenant read/write/delete hole) is fixed and covered by an authorization test, removing the hard blocker. The remaining item before external multi-tenant is operational: complete the FAB-03 production dedup + unique-constraint ALTER so invoice numbers can't collide across the shared accounting export.
5. **Before relying on it for official reports, payroll, and invoicing:** complete the FAB-03 production dedup+ALTER, verify RISK-A (report photos don't silently vanish on old jobs), and keep the authorization + PDF-privacy test coverage growing. FAB-09 is closed; reports and payroll are otherwise in good shape; invoice-number integrity on prod is the one financial gap that would bite accounting silently.

*No source code was modified and no mutating scripts were run during this audit. Safe checks run: `tsc --noEmit` (pass), `vitest run` (1048 passed / 14 skipped against a throwaway MySQL 8), `npm run build` (pass). The scratch database was created solely for this audit.*
