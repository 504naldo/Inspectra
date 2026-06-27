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

- **Offline sync — now wired for all technician write paths.** Device test results, deficiency create/edit, CAN/ULC-S536 checklist responses (`ChecklistCompletion.tsx`), generic inspection-template responses (`TemplateFormRenderer.tsx`), fire-alarm checklist items (`FireAlarmInspection.tsx`), and — as of 2026-06-27 — smoke-alarm test results (`SmokeAlarmInspection.tsx`) all save offline and sync through SyncScreen/OfflineBanner (tracked in `OFFLINE_SYNC_AUDIT.md`). Smoke alarm got its own `pendingSmokeAlarmTests` IndexedDB store (DB v3), an offline-result overlay on the page, SyncScreen wiring via `smokeAlarm.recordTest`, and a reconnect auto-sync. The service worker provides static-asset caching/installability, not data sync. No known offline write-path gaps remain; offline *creation* of new entities (new smoke-alarm devices, new deficiencies from scratch) is still online-only by design.
- **Duplicate/superseded todo.md sections** — Cleaned up this session: marked "Fix CompanyId Fallbacks + Technician Dedup..." (old), "XLSM Import Refactoring (Critical)", "Asset Import Pipeline (Excel → ...)", and parts of "Definitive Reporting Pipeline Refactor" as superseded by their newer, completed counterparts.
- **Dual-location migration history** — `drizzle/*.sql` (0000–0028, tracked by `drizzle/meta/_journal.json`) vs. `drizzle/migrations/*.sql` (0029–0075+, untracked by the journal, applied manually per CLAUDE.md). `npm run db:push` (`drizzle-kit generate && drizzle-kit migrate`) only knows about the journal-tracked half — running it would not apply or account for the newer 47 migrations. This is a real maintainability hazard, not just untidiness: a teammate following the literal `package.json` script would silently diverge from production schema.
- **No global technician wage-rate table** — Payroll computation appears to rely on per-quote `techLabourRate` (`drizzle/schema.ts:1064`); there's no company-level rate config. Likely fine for current scale, worth flagging before payroll math is trusted at scale.
- **Missing indexes** — `inspectionChecklistResponses`, `jobAssignments`, and `attachments` have no secondary indexes on their most-queried columns (`jobId`, `userId`, `entityId`/`entityType`). Not urgent at current data volume, but cheap to fix alongside any migration touching these tables.

## 3. Broken workflow handoffs — ✅ RESOLVED (verified 2026-06-27)

> **Status: closed.** All four inspection-data write paths now enforce the
> finalization lock. Verified by direct read on 2026-06-27 (see line refs below)
> and covered by `server/crossTenantSecurity.test.ts` ("rejects writes against an
> already-finalized job"). The original finding (below) is retained for history.

| Router | Mutations | Calls `assertJobNotFinalized`? |
|---|---|---|
| `server/routers/inspectionRouter.ts` — `inspectionResultRouter` | `upsert`, `bulkMarkPass` | ✅ Yes (lines 30, 48) |
| `server/routers/inspectionRouter.ts` — `checklistRouter` | `saveResponse`, `bulkSaveResponses` | ✅ Yes (lines 108, 146, 163) |
| `server/fireAlarmRouter.ts` | `saveInspectionResult` | ✅ Yes (line 210) |
| `server/sprinklerRouter.ts` | `createInspection`, `updateInspection`, child mutations | ✅ Yes (via `assertJobNotFinalized` / `assertInspectionMutable` / `assertChildMutable`) |

_Original finding (now historical):_ The core handoff — "a job is finalized" must
lock all inspection data — was broken in three of the four places that record
inspection data, letting a technician edit CAN/ULC-S536 checklist responses, fire
alarm test results, or sprinkler inspection data **after** a job had been
cryptographically sealed, silently invalidating the finalization hash. This has
since been fixed in all paths.

## 4. Security / data-integrity risks (highest severity finding) — ✅ RESOLVED (verified 2026-06-27)

> **Status: closed.** Every `jobId`-keyed procedure in the inspection,
> checklist, fire-alarm, sprinkler, and compliance routers now enforces the
> established `assertJobCompany(jobId, ctx.user.companyId)` ownership check
> (a shared helper in `server/db.ts:1739`), and the sprinkler child records
> resolve ownership through `assertInspectionCompany`/`assertChildCompany`.
> `finalizeJob.ts:90` and `complianceRouter.ts:88` (`verifyJobHash`) both
> reject cross-company jobs with `FORBIDDEN`. Covered end-to-end by the 21
> passing cases in `server/crossTenantSecurity.test.ts`. The original finding
> (below) is retained for history.

_Original finding (now historical):_ The same routers above — plus
`complianceRouter.ts` — skipped the job-company-ownership check that is the
established convention everywhere else in the codebase, making the core
inspection workflow reachable cross-tenant for both reads and writes (any job,
any company, by guessing a numeric `jobId`). The correct pattern — now applied
universally — is:
```ts
const job = await db.getJobById(input.jobId);
if (!job || job.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
```
extracted into the shared `assertJobCompany` helper. This was the most severe
finding in the audit and has been fully remediated.

**Lower-severity findings** (style/maintainability, not exploitable):
- Two unnecessary `as any` casts (`customerRecordsRouter.ts:122`, `server/routers/technicianRouter.ts:39`) that mask type info but sit behind already-correct scoping.
- `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_MAPS_API_KEY` are used (`client/src/const.ts:5`, `client/src/components/Map.tsx:27`) but missing from `.env.example` — public keys, not a leak, but an onboarding trap.
- `inspectionChecklistResponses`, `jobAssignments`, `inspectionResults`, `attachments` tables have no `companyId` column at all (defense-in-depth gap — the fix in §6 closes the actual vulnerability at the router layer without needing a schema migration, but adding `companyId` to these tables would be a good follow-up hardening step).

## 5. Runtime / build risks

- ~~**No CI**~~ — ✅ RESOLVED (verified 2026-06-27): `.github/workflows/ci.yml` now exists and provisions a fresh `mysql:8` service container + runs `drizzle-kit migrate` and the test suite (see CLAUDE.md "Database Migrations").
- ~~**No healthcheck endpoint**~~ — ✅ RESOLVED (2026-06-27): added a liveness `/health` route in `server/_core/index.ts` (registered first, before all middleware; returns `{ status, uptime, timestamp }` via the pure `buildHealthPayload` in `server/_core/health.ts`, unit-tested in `server/health.test.ts`) and a `railway.json` wiring `healthcheckPath: "/health"`. Liveness only — deliberately no DB round-trip, so a DB blip can't trigger a Railway restart loop.
- **Migration drift** (see §2) — risk is to future schema changes, not current runtime.
- **Test suite has ~13 files that fail without `DATABASE_URL`** set in the shell (pre-existing, confirmed environmental via `git stash` isolation, not caused by recent changes). If CI is added without setting `DATABASE_URL`/a test DB, it will inherit this and look broken on day one.

## 6. The single best next implementation task — ✅ DONE (verified 2026-06-27)

> **This task has been completed.** The cross-tenant job-access gap is closed:
> the `assertJobCompany` / `assertJobNotFinalized` helpers (`server/db.ts:1739`,
> `:1708`) are applied to every `jobId`-keyed procedure in the inspection,
> checklist, fire-alarm, sprinkler, and compliance routers, including
> `finalizeJob` and `verifyJobHash`. All §8 acceptance-criteria tests exist and
> pass (`server/crossTenantSecurity.test.ts`, 21/21 green as of 2026-06-27).
> See §3 and §4 above for the per-file verification.
>
> **Update (2026-06-27): the §2 smoke-alarm offline gap and the §5 `/health`
> endpoint are also now closed.** `SmokeAlarmInspection.tsx` has a full offline
> queue (`pendingSmokeAlarmTests` store, page overlay, SyncScreen wiring,
> reconnect auto-sync), and a liveness `/health` route + `railway.json` are in
> place. CI already exists (`.github/workflows/ci.yml`).
>
> **Remaining audit items are now mostly maintainability, not gaps:** missing
> secondary indexes (§2), no company-level wage-rate table (§2), two `as any`
> casts and `.env.example` omissions (§4). Note the "migration drift" item in §2
> is **intentional per CLAUDE.md** ("two parallel migration histories — this is
> intentional, not drift to 'fix'") and should NOT be reconciled. The
> defense-in-depth `companyId`-column additions (§4) are the most substantive
> remaining hardening follow-up.

_Original recommendation (now completed):_ Close the cross-tenant job-access gap
by adding the established `companyId`-ownership check (and, where missing, the
`assertJobNotFinalized` check) to every `jobId`-keyed procedure in the
inspection/checklist/fire-alarm/sprinkler/compliance routers. This was the
highest-severity, most central finding in the audit; it has been remediated and
regression-tested.

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
