# Inspectra — Production-Readiness Audit

Date: 2026-06-22
Scope: frontend routes/layouts, backend routers, DB schema, company/role scoping, core workflows, technician mobile, offline sync, reports/PDF, payroll, Customer/Sites/Work Site Info/Contacts, Codespaces & deployment config.

No code was changed during this pass. All findings below are based on direct reads of the current repository (file paths and line numbers cited), not assumptions.

---

## 1. What is already complete

- **Routing & role guards** — `client/src/App.tsx`: every `/admin/*`, `/tech/*`, and `/customer/*` route is wrapped in `ProtectedRoute` with an explicit `allowedRoles` list. `/admin/users` is correctly admin-only. No orphaned or unguarded sensitive routes found.
- **companyId fallback bug (frontend)** — Just fixed and merged to `main`: the `user?.companyId || 1` anti-pattern has been removed from all 9 affected admin/technician pages (Jobs, Dashboard, Sites, Customers, JobsList, Schedule, SiteFiles, Devices, AssetImport, Reports), replaced with a loading guard. Verified via repo-wide grep: zero remaining matches.
- **Customer Records / Sites / Work Site Info / Contacts** — All have full CRUD. `Contacts` are a genuine normalized entity (`customerContacts` table, `drizzle/schema.ts:2488`) with role types, recipient flags, and primary-contact logic — not a text field. `WorkSiteInfo.tsx` persists a 22-field form correctly via `createOrUpdate`.
- **PDF generation** — `pdfGeneratorFirePro.ts` and `pdfGeneratorCompliance.ts` correctly pre-fetch all async image/signature buffers before entering the synchronous `new Promise` PDFKit callback, per the CLAUDE.md invariant. Annual/Compliance, Fire-Pro Deficiency, Invoice, and Quote PDFs are wired end-to-end (button → endpoint → generator → download).
- **Payroll/accounting** — Real, not stubbed: `payrollTimeEntries` table + full draft → submit → approve/reject → export workflow (`server/routers/timeTrackingRouter.ts`), plus `financialReportingRouter.ts` (AR aging, revenue by period, invoice summary, customer concentration, pipeline forecast).
- **Build/deploy** — `package.json` build/start scripts are coherent and were confirmed to run end-to-end. `nixpacks.toml` is correctly configured for Railway (`pnpm install` → `pnpm run build` → `pnpm run start`).
- **Codespaces** — `.devcontainer/devcontainer.json` is present, current, and functional (correct base image, post-create install, port forwarding for Vite/API).
- **Finalization/hash design** — `server/compliance/finalizeJob.ts` implements a deliberate immutability model: status transition matrix, signature requirement, SHA-256 finalization hash, and a separate `verifyJobHash` integrity check. The *design* is sound — the gap is that several write paths don't respect it (see §3–4).

## 2. Incomplete or duplicated implementations

- **Offline sync is partial, not full offline-first** — Two unintegrated storage layers exist: `useOfflineStorage.ts` (localStorage, device test results only) and `offlineStorage.ts` (IndexedDB, fire alarm checklist items). Deficiency creation/editing and inspection-template responses have **no offline path at all** (`DeficiencyEditor.tsx` never calls `saveOfflineDeficiency`, despite it being referenced). The service worker provides static-asset caching/installability, not data sync. If the product positions itself as "offline-capable" for field technicians, that claim is currently overstated for deficiencies and templates.
- **Duplicate/superseded todo.md sections** — Cleaned up this session: marked "Fix CompanyId Fallbacks + Technician Dedup..." (old), "XLSM Import Refactoring (Critical)", "Asset Import Pipeline (Excel → ...)", and parts of "Definitive Reporting Pipeline Refactor" as superseded by their newer, completed counterparts.
- **Dual-location migration history** — `drizzle/*.sql` (0000–0028, tracked by `drizzle/meta/_journal.json`) vs. `drizzle/migrations/*.sql` (0029–0075+, untracked by the journal, applied manually per CLAUDE.md). `npm run db:push` (`drizzle-kit generate && drizzle-kit migrate`) only knows about the journal-tracked half — running it would not apply or account for the newer 47 migrations. This is a real maintainability hazard, not just untidiness: a teammate following the literal `package.json` script would silently diverge from production schema.
- **No global technician wage-rate table** — Payroll computation appears to rely on per-quote `techLabourRate` (`drizzle/schema.ts:1064`); there's no company-level rate config. Likely fine for current scale, worth flagging before payroll math is trusted at scale.
- **Missing indexes** — `inspectionChecklistResponses`, `jobAssignments`, and `attachments` have no secondary indexes on their most-queried columns (`jobId`, `userId`, `entityId`/`entityType`). Not urgent at current data volume, but cheap to fix alongside any migration touching these tables.

## 3. Broken workflow handoffs

The core handoff — **"a job is finalized" must lock all inspection data** — is broken in three of the four places that record inspection data:

| Router | Mutations | Calls `assertJobNotFinalized`? |
|---|---|---|
| `server/routers/inspectionRouter.ts` — `inspectionResultRouter` | `upsert`, `bulkMarkPass` | ✅ Yes (line 27, 44) |
| `server/routers/inspectionRouter.ts` — `checklistRouter` | `saveResponse`, `bulkSaveResponses` | ❌ **No** (lines 127–149) |
| `server/fireAlarmRouter.ts` | `saveInspectionResult` | ❌ **No** (line 194) |
| `server/sprinklerRouter.ts` | `createInspection`, `updateInspection`, and others | ❌ **No** (file has zero references) |

A technician (or anyone with `technicianProcedure`/`protectedProcedure` access) can edit CAN/ULC-S536 checklist responses, fire alarm test results, or sprinkler inspection data **after** a job has been cryptographically sealed — silently invalidating the finalization hash's integrity guarantee without any error. This defeats the entire point of `compliance/finalizeJob.ts`'s hash-sealing design and is a real compliance/legal exposure for a fire-safety inspection business (finalized reports are meant to be tamper-evident records).

## 4. Security / data-integrity risks (highest severity finding)

This is the most important finding of the audit. **The same routers above — plus `complianceRouter.ts` — also skip the job-company-ownership check that is the established convention everywhere else in the codebase.**

The correct, existing pattern (used consistently in `jobRouter.ts`, `quoteRouter.ts`, `mediaRouter.ts`, `filesRouter.ts`, `workSiteInfoRouter.ts`, `repairQuoteRouter.ts`, `inspectionTemplateRouter.ts`):
```ts
const job = await db.getJobById(input.jobId);
if (!job || job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
```

**Confirmed missing** in:
- `server/routers/inspectionRouter.ts` — every procedure in both `checklistRouter` and `inspectionResultRouter` (`listByJob`, `getByJobAndDevice`, `upsert`, `bulkMarkPass`, `getStats`, `syncBatch`, `saveResponse`, `bulkSaveResponses`, `getByJob`, `getByJobAndItem`, `deleteByJob`) takes a bare `jobId` and never checks it against `ctx.user.companyId`.
- `server/fireAlarmRouter.ts` — `saveInspectionResult` (line 194), `getInspectionResults` (line 181).
- `server/sprinklerRouter.ts` — all `jobId`-keyed procedures (`createInspection`, `getInspectionByJobId`, `updateInspection`, `finalizeInspection`, etc.), file-wide.
- `server/compliance/finalizeJob.ts` + `server/routers/complianceRouter.ts` — **`finalizeJob` and `verifyJobHash` never check `companyId` at all** (verified: zero `companyId` references in `finalizeJob.ts`; `complianceRouter.ts` only checks `companyId` in the procedures that take `companyId` directly as input, not the `jobId`-keyed ones). Concretely: any admin or office user on the platform — or any technician who happens to match a job's `leadTechnicianId` — can finalize, or verify the finalization hash of, **a job belonging to a different company**, just by knowing/guessing the numeric `jobId`.

Severity: this affects the single most central business workflow (recording and sealing fire-safety inspection results) and is reachable cross-tenant for both reads and writes. It is more severe than the finalization-bypass issue in §3 because it isn't limited to "your own company's already-finalized jobs" — it's any job, any company.

**Lower-severity findings** (style/maintainability, not exploitable):
- Two unnecessary `as any` casts (`customerRecordsRouter.ts:122`, `server/routers/technicianRouter.ts:39`) that mask type info but sit behind already-correct scoping.
- `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_MAPS_API_KEY` are used (`client/src/const.ts:5`, `client/src/components/Map.tsx:27`) but missing from `.env.example` — public keys, not a leak, but an onboarding trap.
- `inspectionChecklistResponses`, `jobAssignments`, `inspectionResults`, `attachments` tables have no `companyId` column at all (defense-in-depth gap — the fix in §6 closes the actual vulnerability at the router layer without needing a schema migration, but adding `companyId` to these tables would be a good follow-up hardening step).

## 5. Runtime / build risks

- **No CI** — `.github/workflows/` does not exist. Nothing currently blocks a broken `tsc --noEmit` or failing test from reaching `main`.
- **No healthcheck endpoint** — Railway infers health from the listening port only; no explicit `/health` route.
- **Migration drift** (see §2) — risk is to future schema changes, not current runtime.
- **Test suite has ~13 files that fail without `DATABASE_URL`** set in the shell (pre-existing, confirmed environmental via `git stash` isolation, not caused by recent changes). If CI is added without setting `DATABASE_URL`/a test DB, it will inherit this and look broken on day one.
- **`console.log` debug statement** left in `FireAlarmInspection.tsx:225` (sync operation) — harmless but should be removed before shipping.

## 6. The single best next implementation task

**Close the cross-tenant job-access gap by adding the established `companyId`-ownership check (and, where missing, the `assertJobNotFinalized` check) to every `jobId`-keyed procedure in the inspection/checklist/fire-alarm/sprinkler/compliance routers.**

Rationale: this is the highest-severity, most concrete, most central finding in the entire audit. It's a confirmed cross-tenant read/write vulnerability in the core product workflow (not a hypothetical), it has an exact existing fix pattern already proven correct in 7 other files, and it directly restores the integrity guarantee that `compliance/finalizeJob.ts`'s hash-sealing system was built to provide.

## 7. Exact files that task should modify

1. `server/routers/inspectionRouter.ts` — add ownership check to `inspectionResultRouter.{listByJob, getByJobAndDevice, upsert, bulkMarkPass, getStats, syncBatch}` and `checklistRouter.{saveResponse, bulkSaveResponses, getByJob, getByJobAndItem, deleteByJob}`. Add `assertJobNotFinalized` to `checklistRouter.saveResponse` and `bulkSaveResponses` (the `inspectionResultRouter` mutations already have it).
2. `server/fireAlarmRouter.ts` — add ownership check to `saveInspectionResult` and `getInspectionResults`; add `assertJobNotFinalized` to `saveInspectionResult`.
3. `server/sprinklerRouter.ts` — add ownership check to every `jobId`-keyed procedure; add a finalization guard to mutations (`createInspection`, `updateInspection`, etc.) consistent with how `finalizeInspection` already validates state.
4. `server/compliance/finalizeJob.ts` — add `if (job.companyId !== user.companyId) throw FORBIDDEN` immediately after the job is fetched (around the existing permission-check block).
5. `server/routers/complianceRouter.ts` — add the same ownership check to `verifyJobHash` (and any other `jobId`-keyed query/mutation in this router lacking it).
6. (Optional, same PR or fast follow) `server/db.ts` — extract the repeated `if (!job || job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" })` pattern into a shared helper (e.g. `assertJobBelongsToCompany(jobId, companyId, db?)`) so the 7+ existing call sites and the new ones share one implementation instead of copy-pasted checks.

## 8. Acceptance criteria

- `npm run check` passes with no new TypeScript errors.
- `npm test` passes (excluding the pre-existing `DATABASE_URL`-dependent suite, which is environmental and unrelated).
- A new test (or extension of an existing router test) proves: a technician/office/admin user from Company B receives `FORBIDDEN` when calling any of the modified procedures with a `jobId` belonging to Company A — covering at minimum `checklistRouter.saveResponse`, `fireAlarmRouter.saveInspectionResult`, `sprinklerRouter.updateInspection`, and `complianceRouter.finalizeJob`.
- A new/extended test proves: `checklistRouter.saveResponse` and `bulkSaveResponses` return an error (not a silent success) when called against a job that is already finalized — mirroring the existing `inspectionResultRouter.upsert` finalization test if one exists, or following the same pattern as `deficiencyRouter`'s finalization tests.
- Manual smoke check: existing same-company flows (technician saving checklist responses on their own company's job, admin finalizing their own company's job) continue to work unchanged — this is a guard addition, not a behavior change for legitimate same-company calls.

## 9. Commands that must be run

```bash
npm run check                 # TypeScript — must stay clean
npm test                      # vitest — DATABASE_URL must be set in this shell for the DB-backed suites to run
git diff --stat                # review the diff before committing
```

Per CLAUDE.md workflow: commit on the feature branch, push, then merge to `main` with `--no-ff` and push `main`.
