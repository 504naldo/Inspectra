# Inspectra — Production Readiness Register

**This is the single active register of production-readiness findings.** Historical
audit Markdown files in the repo root are point-in-time snapshots; this file is the
live status. Update it (don't fork it) when findings change.

Severity: P0 = blocks release / data-integrity / security · P1 = important · P2 = minor.
Status: open · in-progress · fixed · accepted-risk · wont-do.

**Current continuation (2026-10-17):** local checkout includes merged PR #18
(`179e8c8`) and further fixes published on the separate, unmerged
`codex/audit-acceptance-20261017` branch. Read the final hosted acceptance and
remaining-release-work sections below for current status; earlier tables and
"unrun" statements preserve the evidence available at each earlier commit.
Production still serves the successful October 2 deployment. The October 4
attempt failed on missing `jobs.googleCalendarOwnerId`; the audit branch has not
replaced it. Hosted disposable checks do not establish live schema, production
backup/PITR, historical evidence, provider or device acceptance.

| ID | Issue | Sev | Area | Status | Evidence | Fix commit | Validation | Owner | Next action |
|----|-------|-----|------|--------|----------|-----------|------------|-------|-------------|
| PR-01 | Full marketing site duplicated inside the app | P1 | Frontend | fixed | `Home.tsx` rendered `components/landing/*` | `refactor: separate app entry…` | build/check green; lightweight entry | eng | — |
| PR-02 | Raw `parseInt(params.id)` in numeric routes → NaN mounts / bad tRPC queries | P1 | Routing | fixed | `App.tsx` route table | `fix: harden routing…` + `client: route all numeric-param routes through strict parser, pass parsed props` | `routeParams.test.ts` (7) | eng | Completed: **every** route with a numeric param now validates via `withNumericParams` (renders NotFound on an invalid id) and passes an already-parsed numeric prop; the 12 remaining detail pages (tech fire-alarm/checklist/template, admin jobs/sites/quotes/repair-quotes/equipment-knowledge/inspection-templates) no longer call `useParams`/`useRoute` + `parseInt`. `pnpm check` clean |
| PR-03 | Catch-all silently redirected unknown URLs to `/` | P2 | Routing | fixed | `App.tsx` catch-all | `fix: harden routing…` | manual | eng | — |
| PR-04 | Unconditional `[AuthGuard]` console log; duplicated root redirect | P2 | Routing | fixed | `App.tsx` Router effect | `fix: harden routing…` | DEV-gated + loop guard | eng | — |
| PR-05 | `markPaid` could pay against stale stored total; no double-apply guard | P0 | Financial | fixed | `invoiceRouter.markPaid` | `fix: harden invoice…` | `invoiceIntegrity.test.ts` (9) | eng | — |
| PR-06 | Easy to omit company-ownership checks in routers | P1 | Security | fixed | load-by-id + manual compare pattern | `security: add scoped tenant getters…` + 8× `security: adopt scoped tenant getters…` | `authorization.test.ts` (20) | eng | Migrated the exact load-then-throw ownership checks to scoped getters across ~20 routers (job/site/device/customerOrg/invoice/quote/workOrder/partsCatalogItem/serviceAgreement/inventory/importLog); guards in `tenantGuards.ts`, with local helpers (reportQa, inventory, knowledgeSystem) delegating to them. Residual (code-cleanliness, **not** a security gap — these still enforce ownership inline): entities without a shared guard (partsRequest, purchaseOrder, vendor, knowledgeBase page/fact/model, serviceSchedule) and role-branched reads. Cross-tenant IDORs surfaced by this work are tracked in PR-14 |
| PR-07 | No standing cross-tenant authorization test suite | P1 | Security | fixed | only inspection paths covered before | `security: add scoped tenant getters…` | `authorization.test.ts` (20) | eng | Now covers scoped getters, guard + inline cross-tenant reads, the import-center IDORs, admin cross-company (reads + write attribution), and lower-role scoping. Remaining (enhancement): customer-portal (org-scoped) read paths |
| PR-08 | Unsupported trust/compliance claims | P1 | Compliance | fixed | landing copy (removed) + meta tag | `docs: remove unsupported trust claims` | grep clean; `TRUST_CLAIMS.md` | eng | — |
| PR-09 | 5 manual migrations failed every boot (MariaDB syntax) | P0 | Migrations | fixed (prior) | startup logs | `Repair 5 manual migrations…` (main) | applied in prod | eng | — |
| PR-10 | Capability enforcement: sensitive actions open to admin+office by role only | P1 | Security | fixed | `officeProcedure` on payroll approval/export & invoice void/Sage export | `security: gate…admin` → `security: return PR-10 capabilities to office` | `capabilityEnforcement.test.ts` (7) | product+eng | Final matrix (after admin became the cross-company platform operator): payroll approve/reject/bulk/markExported/exportData and invoice void/exportSage/markReady/markExportedToSage are held by **office** (+admin), blocked for technician/customer; payroll self-approval still blocked. Enforced via `officeProcedure`. See `CAPABILITY_MATRIX.md` / `ROLE_TRUST_MODEL.md` |
| PR-11 | Offline/sync duplicate-protection + QA preflight hardening | P1 | Technician | fixed | non-idempotent `deficiency.create`/photo upload; QA submit could omit unsynced items | offline-sync safeguards + QA preflight + attachment idempotency + per-job scoping | `offlineSyncIdempotency.test.ts` (6), `offlineSyncSafeguards.test.ts` (9, CI/MySQL), `qaPreflight.test.ts` (10) | eng | Idempotency covers deficiency + photo (smoke-alarm `recordTest` already idempotent via update-by-device); QA-preflight pending counts scoped per-job **and now include the IndexedDB fire-alarm + smoke-alarm queues** (previously omitted → an unsynced fire-alarm result could be silently left out of a submitted report). New server suite pins finalized-job rejection + company scoping across every offline write path. Runbook: `docs/runbooks/ANDROID_OFFLINE_FIELD_TEST.md`. **Decided + locked (reassignment):** offline writes are company + finalized scoped, **not** assignment-scoped, so a technician reassigned away mid-inspection can still sync work they already captured offline (no field-data loss). Verified end-to-end — reassignment mutations only delete `jobAssignments` rows (never `inspectionResults`/`deficiencies`) and report gathering filters by `jobId` (not the assigned tech), so captured work is never dropped. Guaranteed against regression by `offlineSyncSafeguards.test.ts` (assign → remove → sync device/checklist/deficiency) + intent comments on every offline write procedure warning not to add an `isUserAssignedToJob` gate |
| PR-12 | Customer report privacy not enforced by a central sanitizer/test | P1 | Privacy | fixed | PDF generators use typed projections (no raw rows) | `security: central customer-safe report sanitizer` + `security: route all customer PDFs through sanitizer` | `customerSafeReport.test.ts` (10) | eng | Exclude-by-default allow-list serializers for every customer-facing PDF shape (inspection, compliance, invoice, quote, repair-quote, building-quote), wired at all 7 router call sites + seeded-field regression test covering each shape |
| PR-13 | Root audit docs sprawl; no single active register | P2 | Docs | fixed | many root `*_AUDIT.md` | this pass | this file + `docs/README.md` | eng | Migrate findings here over time |
| PR-14 | Cross-tenant IDORs: records loaded from a client id with no ownership check | P0 | Security | fixed | `importRouter` (read + execute/validate), `gmailRouter.sendReport`, `calendarRouter` create/update/delete, and (earlier) `sync.getJobDataForOffline`, `drive.saveReportToDrive` | `security: close two cross-tenant IDORs…` + `security: close cross-tenant IDORs in import center, gmail & calendar` | `authorization.test.ts` import cases (20) | eng | Found via a systematic read-only sweep of every client-id load site. Import center could read another company's uploaded data and (execute) overwrite/import into a foreign site; gmail could email any company's report PDF to an arbitrary recipient; calendar could act on another company's job. All now scoped/guarded. `attachmentRouters` admin-bypass is intentional per PR-15 |
| PR-15 | Role trust model: admin cross-company scope inconsistent + write attribution | P1 | Security | fixed | `admin` bypassed some checks but not others; create-under-parent flows stamped `ctx.user.companyId` | `security: make admin a consistent cross-company platform operator` + `security: extend admin bypass to bespoke inline checks` + `security: fix cross-company write attribution…` | `authorization.test.ts` (20), `ROLE_TRUST_MODEL.md` | product+eng | Product decision: `admin` = cross-company platform operator; office/technician/customer strictly scoped. Wired consistently via a request-scoped actor context (guards + inline checks), and a write audit fixed create-under-parent flows to attribute to the target company. Residual (functionality gap, not a hole): `input.companyId` validation + `deviceRouters` bulk-reorder still scope admin |
| FAB-01 | `fileTagRouter` cross-tenant (trusts client `companyId`; delete by raw id) | P1 | Security | fixed | `attachmentRouters.ts` `fileTagRouter.list/create/delete` | `docs: add Fable application audit; security: close file-tag & upload-queue IDORs` | `authorization.test.ts` (22) | eng | `list`/`create` reject mismatched `input.companyId` and `create` stamps `ctx.user.companyId`; `delete` loads via new `db.getFileTagById` and checks company. Found in the Fable audit (`FABLE_APPLICATION_AUDIT.md`) |
| FAB-02 | `uploadQueueRouter` id-addressed mutations had no ownership check (IDOR) | P1 | Security | fixed | `attachmentRouters.ts` `updateStatus`/`retry`/`remove` (and `complete`) | `docs: add Fable application audit; security: close file-tag & upload-queue IDORs` | `authorization.test.ts` (22) | eng | Shared `requireOwnedQueueItem(id,userId)` now guards every queue mutation; `updateStatus`/`retry`/`remove` previously let any technician flip another user's item or point it at an arbitrary S3 object |
| FAB-03 | Invoice numbers collision-prone + no uniqueness constraint | P2 | Data integrity | fixed (CI/new DBs); **prod pending** | `invoiceRouter`/`approvedWorkRouter` duplicated 4-char timestamp slice; no unique index | `finance: collision-safe invoice numbers + unique constraint` | `invoiceWorkflow.test.ts`, `invoiceIntegrity.test.ts`; fresh-DB index verified | eng | Shared `invoiceNumber.ts` generator (full base-36 ms + random); `unique(companyId,invoiceNumber)` in `schema.ts` + journal migration `0033`. **Prod ALTER intentionally NOT auto-applied** — startup runner ignores dup-key but not dup-*data*; needs a one-time dedup check before the constraint is added to the live DB |
| FAB-04 | Client payroll CSV export lacked formula-injection guard | P2 | Security | fixed | `PayrollReview.tsx`/`PayrollHours.tsx` `escape()` | `finance: harden client CSV / redirect / invoice numbers` | typecheck + build | eng | Both now use shared `csvCell` in `client/src/lib/utils.ts` (mirrors server `csvCell`, prefixes leading `=+-@`) |
| FAB-05 | `isSafeReturnRoute` allowed `/\`-prefixed protocol-relative open redirect | P2 | Security | fixed | `_core/oauth.ts` | `finance: harden client CSV / redirect / invoice numbers` | `oauthHardening.test.ts` (backslash/CRLF cases) | eng | Now rejects backslashes and control chars anywhere plus a `/`-or-`\` second char |
| FAB-06 | Login shows unimplemented email/password + Forgot-Password → 404 | P3 | UX/Trust | fixed | `Login.tsx` | prior UX pass | manual | eng | `Login.tsx` is now Google-only (79 lines): no password field, no Forgot-Password link, no Apple button. The misleading email/password surface and the 404 link are gone. Confirmed in the 2026-07-16 Fable re-audit |
| FAB-07 | Newest audit findings not in the authoritative register | P2 | Docs | fixed | 82+ root snapshot `*_AUDIT.md` already indexed by `docs/audits/README.md` | this pass | this register | eng | Root files were **deliberately** left in place (see `docs/audits/README.md` — moving them risks breaking references); the real gap was the new Fable findings not being registered. Now recorded here (FAB-01…FAB-06); `FABLE_APPLICATION_AUDIT.md` is the snapshot |
| FAB-09 | `fireAlarmFormRouter` cross-tenant IDOR: 8 technician procedures read/write/delete fire-alarm form data by raw jobId/row id with no company scope, no assignment check, no finalized-job check | P1 | Security | fixed | `server/routers/fireAlarmFormRouter.ts` (all procedures); `fire_alarm_form_header`/`_attendance_log`/`_ancillary_circuits` tables carry only `jobId` | `security: scope fireAlarmFormRouter to job company (FAB-09)` | `authorization.test.ts` (25) | eng | Every procedure now calls `assertJobCompany`; `upsert*` add `assertJobNotFinalized`; id-addressed upserts verify the row belongs to the scoped job; `delete*` resolve the parent job before deleting. Found in the 2026-07-16 Fable re-audit — the lone router that never adopted the `assertJobCompany` convention |
| FAB-10 | `company.update`/`company.list` are cross-company by `adminProcedure` — by design (admin = platform operator), but undocumented and untested | P3 | Permission model | fixed | `entityRouters.ts` company router; `_core/actorContext.ts` (`callerIsPlatformOperator` true for any admin) | `docs+test: pin company-router platform-operator model (FAB-10)` | `authorization.test.ts` (25) | eng | Not an isolation bug: `admin` is the platform-operator role per `ROLE_TRUST_MODEL.md`. Documented "no company-scoped admin exists" at the company router and pinned intent with a `company.update/list` test (admin cross-company allowed; office/tech/customer FORBIDDEN). If a company-scoped admin is ever added, the test flags that these endpoints need an ownership check |
| PR-16 | Customer report photos fetched from the stored, expiring presigned `fileUrl` (7-day) → silently dropped from reports regenerated later | P1 | Reports/Storage | fixed | `reportRouter.ts` deficiency-photo prefetch used `fetchImageBuffer(row.fileUrl)`; the durable `fileKey` was unused | `server: re-sign report photos from fileKey so they survive fileUrl expiry` | `pdfImageResolver.test.ts` (6) | eng | Closes the "presigned-URL expiry on old report photos" runtime risk from the 2026-07-16 Fable audit. New `resolveAttachmentImageForPdf()` re-signs a fresh URL from the durable `fileKey` at generation time (falls back to the stored URL only when no key), keeps SSRF protection, returns a discriminated ok/fail result (a failed image is never treated as embedded), and logs a secret-free warning. October 17 adds durable technician/contact signature keys (journal 0042/manual 0092); operator-supplied logo URLs still depend on the external host |
| PR-17 | No automated guard against a new router forgetting the tenant-scoping convention (recurring FAB-01/02/09 failure mode) | P2 | Security/Process | fixed | ad-hoc convention only | `docs+ci: add static tenant-guard audit` + `04f5257` | `security:tenant-audit:strict`: 60 router files, zero active findings, two reviewed exceptions | eng | CI now requires the strict audit step (no continue-on-error). Keep real authorization tests alongside this lint-grade heuristic; a clean scan is not a security proof. See `docs/security/TENANT_GUARD_AUDIT.md` |
| PR-18 | Tenant-guard audit surfaced id-addressed router procedures with no *visible* company scope | P1 | Security | fixed (merged PR 16) | Four remaining raw-parent-id paths in fireAlarm/job/site routers, after prior jobAssignment fixes | `security: close jobAssignmentRouter cross-tenant gaps` + `04f5257` | `companyAccess.test.ts` (26); focused suite 110 passed; full suite 1,167 passed / 14 skipped; typecheck, build and strict audit passed | eng | The prior jobAssignment write/read/assignee guards remain. All four remaining procedures now authorize the parent before child reads/writes: `fireAlarm.getSystemBySite` and `job.getJobTechnicians` preserve customer own-org reads including `companyId: null`; staff use company helpers with the platform-admin bypass. `fireAlarm.upsertSystem` admits technician/office/admin only, with guarded insert and update paths. `site.getLastInspectionSummary` remains office/admin-only and company-scoped. Regression cases cover same-company allow, cross-company denial, customer org isolation, admin access, missing parents, no-system sites, unchanged data after denied inserts/updates, and technician reassignment without an assignment gate. Merged as 7c4e5df; deployment reported successful. Runtime boundary checks remain unrun |

| PR-19 | Access Control was role-only + read-only; no way to customize permissions per company | P3 | Permission model | fixed | `AccessControl.tsx` (read-only matrix); permissions hardcoded in `shared/permissions.ts` | `feat: company-scoped per-role permission overrides` | `permissions.resolve.test.ts` (5), `accessControl.test.ts` (5, CI/MySQL) | product+eng | Company admins can now allow/deny individual permissions per role (office/technician/customer) for **their own company**, layered on the baseline via `company_role_permissions`. Safety: **`admin` is non-editable** (platform operator keeps all — no self-lockout); backward-compatible (no override → baseline, so behaviour is unchanged until toggled); enforced additively via `requireCompanyPermission`. Enforcement is **phased** — wired first at `reports.approve` (report QA approve) and `ai.knowledgeManage` (KB create/update), both office-baseline-true so defaults don't change; `ENFORCED_PERMISSIONS` + a UI shield badge tell admins which toggles bite today. Finance permissions (payroll/invoices) are editable but intentionally **not yet enforced** (deferred to avoid touching billing paths in the same change) |

| PR-20 | Temporary safety pause for automated email delivery | P1 | Email | fixed (merged PR 17; effective live flag unverified) | Schedule, portal-invite, report-ready and approval paths could send automatically when credentials/preferences were configured | `safety: pause automated email delivery by default` | `emailAutomation.test.ts` (9); full suite 1,176 passed / 14 existing skips; typecheck, build and strict tenant audit passed | eng | `EMAIL_AUTOMATION_ENABLED` defaults off; only exactly `true` opts in at startup. The gate covers all six automated email-service paths, including owner notifications, regardless of existing preferences or `REPORT_NOTIFICATIONS=true`. Suppressed emails are not queued. Explicit Send actions remain available. Merged as 87a23db on 2026-10-02 and Railway deployment reported successful at 05:43:34 UTC. Effective environment value remains unverified; no credentials or production settings were changed. See `docs/runbooks/DEPLOYMENT.md` |

## PR-18 verification (2026-10-01)

Before editing, clean local HEAD and remote `main` were both verified as
`30f7a9d2c059997d9cfc09ebaeae899abdd0480d`. Validation below is for the feature
branch, using Node 24.19.0, pinned pnpm 10.4.1 and disposable MySQL 8.0 databases
initialized **only** with `pnpm exec drizzle-kit migrate` (the CI schema path).
Focused and full suites used separate fresh databases; retained test fixtures
make reusing the same database unreliable. No production database was accessed.

| Check | Verified result |
|-------|-----------------|
| Focused authorization, customer isolation, fire-alarm and offline safeguards (8 files) | **Passed:** 110 tests, zero failed/skipped |
| `pnpm check` | **Passed** |
| `pnpm test --maxWorkers=4 --minWorkers=1` | **Passed:** 105 files / 1,167 tests; **skipped:** 4 files / 14 tests; zero failed |
| `pnpm build` | **Passed:** client/PWA and server bundles; existing browser-data age warnings remain |
| `pnpm security:tenant-audit:strict` | **Passed:** 60 router files, zero active findings, two unchanged reviewed exceptions |
| Hosted CI, Railway/deployed behavior, live integrations and Android hardware | **Unrun:** local validation does not establish these outcomes |

The 14 skips are existing: 11 S3-dependent import cases (credentials absent),
two disabled Phase-2 deprecation cases and one pre-existing auto-mapping case.
That historical run used a journal schema without `users.sessionVersion`; the audit branch adds the column and makes session revocation fail closed. Neither missing optional
credentials nor these existing skips were changed to obtain a passing result.
No merge, deployment, production migrations/backfills or credential changes
were performed. Main's automatic deployment remains independent of CI.

## Open runtime risks (require live verification)
These can't be settled by static analysis or the CI suite — they need a real device, live storage/integrations, or load. Kept visible here so they aren't lost:
- **Real-device offline sync / camera / haptics (Android).** Covered by the manual plan `docs/runbooks/ANDROID_OFFLINE_FIELD_TEST.md`; **not** automated. Run on hardware before a field release.
- **Live email / Google / Sage delivery.** Delivery success and OAuth token refresh are only exercisable against the real integrations.
- **N+1 query counts under load.** Not measured; flag if latency regresses.
- **Presigned-URL expiry on old report photos — CLOSED** by PR-16 (fresh re-sign from `fileKey`). Durable technician/contact signature keys and PDF rereads are implemented in the October 17 continuation below. Historical keyless signatures require their original accessible evidence; company logos remain operator-supplied external URLs whose availability depends on their host.

## How to use this register
- Add a row per finding with evidence (file/line or commit).
- Link the fix commit and the validation (test name or manual step).
- Don't create a new root `*_AUDIT.md` for ongoing work — record it here.
- Root audit files remain for history; see `docs/audits/README.md`.

## Uploaded audit remediation — 2026-10-02 (historical draft status)

Source: owner's `Inspectra_Audit_Report_2026-10-02.docx`, findings F01–F23,
static baseline `7c4e5df`. Before editing, clean main was verified as
`87a23db7e57d1ff86c7a3eb56a52fb6ec3cfa50c` (merged email-pause PR 17).
The following fixes are **branch-only**, not deployed. “Fixed” below describes
the tested code change; production acceptance still requires the release checks.
No production database, migration, backfill, credential or setting was changed.
Email automation retains its default-off gate. Main auto-deploys without waiting
for CI: do not merge this draft until the remaining release checks are resolved.

| Finding | Branch status | Change and evidence | Remaining acceptance work |
|---|---|---|---|
| F01 credential serialization | fixed | Explicit public-user allowlist for auth, dashboard and nested assigned technicians; `auditRemediation.test.ts` | Authorized incident review of previously exposed tokens; no rotation performed |
| F02 OAuth membership | fixed | Existing membership survives duplicate login; unmatched new domains require invitation rather than first-company fallback | Live OAuth/invitation acceptance |
| F03 organization/invoice parent scope | fixed | Company/customer guards and consistent actual ancestor links before reads/writes | Broader live workflow acceptance |
| F04 attachment access | in-progress | Shared canonical parent authorization across attachment, file, media and multipart paths; finalized parent locking; public-only customer projection | Direct multipart HTTP and S3 end-to-end denial tests; review remaining alternate paths |
| F05 customer staff-data access | fixed | Customer-safe job/site/invoice/attachment projections; staff-only offline packets, inspection results and work-site data; null-company own-org reads preserved | Customer portal browser acceptance |
| F06 financial child authorization | in-progress | Invoice child IDs validated against real parent, scoped SQL and invoice transaction locks; October 16 repair quote parent locks, transactional content/totals/sealing, linked-child checks and default-free item patches | Run new repair-quote MySQL concurrency/rollback suite; production acceptance remains open |
| F07 session revocation | fixed | Typed required sessionVersion; atomic deactivation increment; no permissive missing-column fallback | Verify live DDL before release |
| F08 import destinations | in-progress | October 16 shared company/site/customer consistency checks, name-matched site revalidation, stored source/destination agreement, authorization before OAuth/provider work and preserved denial errors | Mocked denial/handoff tests passed; live storage/provider and remaining legacy import acceptance open |
| F09 inspection device parent | fixed | Device company/site must match authorized job; whole batch validation before writes; `auditRemediation.test.ts` | Field workflow acceptance |
| F10 unverified report facts | fixed | Removes sample system/battery facts and legacy letter assumptions; prints canonical snapshot wording and recorded values | Representative generated PDFs reviewed by inspection owner |
| F11 checklist/report divergence | in-progress | Annual capture, QA submission and compliance report read canonical snapshot results; incomplete/legacy captures fail closed | Reviewed legacy conversion and every alternate finalization/report route |
| F12 fire-alarm autosave | in-progress | Per-record durable drafts before debounce; serialized revisions; account/company/job scope; reload/error recovery tests | Browser/Android rapid editing, collapse/reload and quota-error acceptance |
| F13 offline date type | fixed | ISO timestamp validation and Date conversion; malformed batch denied | Android sync acceptance |
| F14 false offline success/replay | in-progress | Failed offline POST rejects; generic replay disabled and preserved; QA blocks legacy queued requests | Typed account-scoped recovery for all legacy/photo queues; field recovery UI |
| F15 partial payments | fixed | Cumulative authoritative cents, durable UUID receipt and invoice row lock; retries/concurrent receipts tested | Batch Sage export concurrency and historical accounting reconciliation |
| F16 workbook identity | in-progress | October 16 canonical Quick Import preview, cross-sheet and saved-identity collision explanations, actual spreadsheet row numbers, separate inserted/updated counts and execution-time revalidation | Mocked canonical pipeline/router tests passed; concurrent import serialization and real DB/browser acceptance remain open |
| F17 transaction/seal integrity | in-progress | AsyncLocalStorage propagation; checklist save/bulk/delete and all sprinkler writes now hold the job lock through one audited transaction; sprinkler DAL joins that connection; offline batch locks precede snapshot reads | Prepared MySQL seal-interleaving/replacement-rollback tests remain unrun; remaining legacy mutation inventory and production acceptance open |
| F18 expired report URLs | fixed | Fresh storage URL from durable key on report reads, Gmail/Drive and file import; no stale fallback on signing error | Disposable S3 suite and live expiry acceptance |
| F19 false/duplicate sends | in-progress | Quote and repair-quote sends now require stable UUIDs, use the durable outbox, validate provider acceptance and preserve later approval states on receipt replay. Owned receipt lookup and durable quote-send UI support recovery without inventing another attempt. | Final browser/native and live-provider acceptance, operator reconciliation of unknown outcomes and remaining explicit-send inventory open |
| F20 QA workflow | fixed | No 50-job discovery cutoff; independent counts; approval capability on both entries; office QA route and corrected notification link | Browser navigation acceptance |
| F21 calendar schedule/owner | fixed | Explicit instants, required real schedule, recorded integration owner/calendar; wrong-owner and DST tests | Live Google Calendar acceptance; legacy owner reconciliation |
| F22 runtime/verification | in-progress | Node 22 CI/dev/runtime source configuration; build and isolated built-server smoke required in CI | Live Railway runtime, S3, Android toolchain and SheetJS upgrade below |
| F23 immutable snapshots/schema | in-progress | Insert captures template/certification; update preserves item snapshot; journal NOT NULL; startup verifies required schema and rejects legacy nulls | Live DDL and reviewed legacy snapshot conversion |

### Verified checks on the draft

Node **22.23.3**, pnpm **10.4.1**, disposable MySQL **8.0**; focused and full runs
used separate fresh journal-migrated databases. Fake mail/Calendar providers
made no real outbound sends. These results supersede intermediate failures.

| Status | Check | Result |
|---|---|---|
| PASSED | Focused authorization, customer isolation, fire-alarm, offline, payments, outbox, QA/calendar and new helper suites | 18 files; **186 tests**, no skips |
| PASSED | Full tests | **114 files / 1,225 tests**; zero failures; **4 files / 14 skipped** |
| PASSED | Typecheck | `pnpm check` |
| PASSED | Production build | `pnpm build`; existing browser-data/chunk-size warnings |
| PASSED | Built-server smoke | Health JSON and UI using isolated minimal environment, no database/migrations |
| PASSED | Strict tenant audit | **60 router files, zero active findings, two reviewed exceptions**; required CI step preserved |
| PASSED | Schema preparation | Journal migration 0036 on fresh databases; manual 0086 on disposable schema with existing prerequisites, then startup schema verification |
| FAILED, RESOLVED | Intermediate verification | Older payment fixture lacked requestId; report fixtures lacked generatedById; mocks lacked new guarded getters/signers. Corrected; final runs above passed |
| UNRUN | Existing skips | 11 S3-dependent import tests, 2 disabled Phase-2 cases, 1 existing auto-mapping case |
| UNRUN | Hosted CI/live/native | Hosted PR checks, production DDL/data, Railway runtime, Google/Resend/Sage live operations, Android SDK/JDK/hardware, browser/offline and PDF acceptance |

Disposable MinIO image pulls from Docker Hub and Quay were rejected by the
network proxy, so the S3 tests remain unrun rather than using production storage.
The fixed SheetJS upstream distribution request was also proxy-denied (403).
`xlsx` **0.18.5 remains an open dependency blocker**; existing worker time limits
do not resolve its known advisories. No unverified substitute dependency added.

Migration 0036 is for the journal/CI schema. Manual migration 0086 is prepared
for the separate production migration history and requires the existing 0014
snapshot and 0044 session-version DDL to be verified. Neither was executed in
production. Never reconstruct historical inspection answers or credentials from
current templates; legacy remediation requires reviewed source evidence.

## PR #18 release-safety follow-up — 2026-10-03

Starting local/remote PR head verified: `cb03dde696002746e865a0daffdcc5b21be7ef73`,
branch `codex/audit-remediation`, draft. Existing hosted CI passed on that exact
head: [run 36978115178](https://github.com/504naldo/Inspectra/actions/runs/36978115178).
The follow-up below is local until branch-publication safety is established.
No real emails, production SQL, credentials or settings were changed.

| Item | Acceptance criteria and reproduction | Implemented evidence | Status / release gap |
|---|---|---|---|
| 1 Payment retries | One received payment changes totals once despite repeated clicks, concurrent requests, lost COMMIT response, refresh/navigation/reopening; a different operation requires reconciliation | Existing same-ID server transaction already passed. Reopening formerly discarded the dialog-only UUID. Persistent account/company/invoice operation now retains exact amount/date/ID even after acknowledgement; Web Locks serialize tabs; explicit receipt-checked “Start another payment” transition; server validates immutable amount/date; lost-response test + 8 simultaneous retries produce one receipt | Code/regressions and real desktop Chromium refresh, termination/reopen and concurrent-tab checks passed; native/Android acceptance unrun; unsupported browsers fail closed |
| 2 Historical reports | Finalized questions, answers, requirement flags and standard versions survive changed/added/removed templates; incomplete historical evidence is flagged | Prior canonical getter joined current required-question IDs. Finalized regeneration now reads captures only; active completeness remains guarded. Capture includes requirements/version/provenance; canonical validation and sealing reject unproven legacy captures. PDF text regression verifies original wording, version, answer notes and exclusion of today's questions | Code/PDF regressions passed; representative historical PDFs and reviewed source-evidence conversion unrun |
| 3 Migration safety | Fresh install and selected historical upgrade preserve counts, paid totals, tenant owners and exact captures; failures stop later migrations; repeated/interrupted runs recover without fabrication | Unsafe 0011 join reproduced in a rolled-back synthetic fixture transaction. Startup is read-only; explicit runner refuses unsafe backfills/constraints and fails fast. Fresh journal 0037 and selected manual 0086/0087 tested; partial DDL recovery and repeated execution preserve invariants | Synthetic fixture verification passed. No authorized sanitized restored database is available: **full historical release validation remains incomplete** |
| 4 Rollback | Older payment writers fail closed; history cannot be altered/deleted; forward recovery preserves totals; rollback boundaries documented | Protocol-v2 triggers require a transactional writer marker and durable matching receipt, protect balance/status/date, reject receipt UPDATE/DELETE; obsolete writer attempts fail. Compatible server retry then next payment preserves ledger/totals. Required startup checks reject absent guards | Guard/forward-recovery tests passed. Synthetic full MySQL backup/restore and repeat forward recovery passed; production backup/PITR and historical recovery rehearsal unrun; old-image rollback is not approved |

Independent review identified six blockers (acknowledgement races, unresolved
account identity/corrupt storage, active completeness, provenance before sealing,
missing startup guards, incomplete database financial-state guards). All were
addressed; final reviewer reported no remaining blocking defect in reviewed code
and independently ran **8/8 payment-operation tests**, including strict durable-journal behavior. Follow-up review found no blocking defect. This is not production-data or release approval.

| Status | Final applicable local check | Evidence |
|---|---|---|
| PASSED | Focused affected suites | Prior focused run: 17 files / **173 tests**, no skips; final full run includes receipt/update rollback and two additional durable-journal tests |
| PASSED | Full tests | 117 files / **1,242 tests**; zero failures |
| SKIPPED | Existing optional/disabled tests | 4 files / **14 tests**: 11 S3, 2 Phase-2, 1 auto-mapping |
| PASSED | Typecheck, production build, built-server smoke | Node 22.23.3 / pnpm 10.4.1; smoke health/UI with no DB or provider credentials |
| PASSED | Strict tenant audit | 60 router files / zero active findings / two reviewed exceptions; CI remains required |
| PASSED | PDF regression | Generated PDF extracted using Poppler; original questions/version/notes retained after template mutation and removal |
| PASSED | Migration checks | Fresh journal install/startup; synthetic historical tenants/payments/null and trusted captures; no auto-backfill; interrupted selected manual DDL and corrected retry |
| PASSED | Real desktop Chromium payment UI | Committed response dropped, refresh, process termination/reopen, explicit second partial payment and simultaneous tabs; real Web Locks/IndexedDB/MySQL; external requests blocked and no emails |
| PASSED | Synthetic full backup/restore | Native mysqldump restores counts, totals, tenant ownership, exact snapshots/history and trigger definitions; stale backup gap detected; repeated forward recovery preserves $75 |
| FAILED, RESOLVED | Browser durability reproduction | localStorage lost operation after process termination. Strict IndexedDB commits now precede dispatch; durable recovery passed. Unconfigured analytics URL still emits browser warnings |
| FAILED, RESOLVED | Intermediate checks | CREATE TRIGGER needed query rather than prepared execute; obsolete direct-payment test updated to require rejection plus real concurrent receipt checks. Final runs passed |
| UNRUN / NOT CONFIGURED | Lint | No lint script or ESLint configuration exists; `git diff --check` passed, but is not a lint substitute |
| UNRUN | Historical release evidence | Sanitized restored DB, production backup/PITR restoration, representative original historical PDFs, Android/native interruptions and live integrations |
| BLOCKED | Publication / exact-final hosted CI | GitHub webhook read denied (403); no Railway read identity. No deployment recorded for branch/starting head and latest production deployment is main `87a23db`, but actual branch/preview trigger settings cannot be established. Await explicit confirmation before pushing; starting-head CI is not follow-up CI |

Migration and rollback procedure: [release-safety runbook](runbooks/PR18_RELEASE_SAFETY.md).
The earlier F01–F23 register still contains other draft release blockers;
this follow-up does not close them or authorize a merge. Automation stays
default-off; effective live EMAIL_AUTOMATION_ENABLED remains unverified.

## Audit continuation — 2026-10-16 (local changes)

Baseline: clean `179e8c8`, merged PR #18. These changes are local and do not
establish deployment, migration or live integration outcomes.

| Finding | Local change | Evidence / remaining verification |
|---|---|---|
| F06 repair quote atomicity | Quote creation/pre-population uses one audited transaction. Content edits and finalization lock the actual quote before reads, child writes and total recalculation. Child update/delete SQL includes the parent ID; deficiency links must match the quote job and parts must match its company, including platform-admin operations. | `repairQuoteIntegrity.ts`, `repairQuoteIntegrity.test.ts`; real MySQL concurrency/rollback tests are added but **unrun** in this session. |
| F06 item patch corruption | Separate default-free update schema preserves omitted quantity, prices, labour, fees and ordering. Zod 4 `.partial()` on the default-bearing create schema previously reset those fields on a metadata-only edit. Explicit zero values remain valid. | Router patch regressions preserve numeric fields and totals; database regressions also prepared. |
| F06 alternate quote workflows | Generic quote edit/send and building quote edit/PDF routes reject repair quotes before changing content, generating wrong-shape PDFs or contacting delivery providers. Repair status, approval and conversion entry points require a finalized repair quote before side effects. | `repairQuoteWorkflowBoundary.test.ts`, `repairQuoteStatusBoundary.test.ts`; includes legitimate finalized delivery transition. Other explicit send routes remain acceptance work under F19. |
| F08 import destination consistency | Shared destination guard rejects mismatched company/site/customer links even for platform admins. Drive authorization precedes OAuth refresh, reused name-matched sites are checked, stored workbook sources must match the destination, and PDF denial errors remain authorization errors. | `importDestinationAuthorization.test.ts`, `pdfImportDestination.test.ts`, `workbookUploadBoundary.test.ts`; providers/storage mocked, no live integration acceptance claimed. |
| F16 workbook preview and counts | Quick Import now previews using the same parser/identity plan as execution; collisions across sheets and multiple saved matches are excluded before writes and explained with sheet/row details. Execution rebuilds the plan; successful inserts and updates are reported separately. | `workbookIdentity.test.ts`, `workbookImportPipeline.test.ts`; includes leading-empty-row offsets, reimport counts, source collisions, saved duplicates and write failures. No database uniqueness/concurrent-import guarantee added. |

Validation uses Node **24.19.0** and pinned pnpm **10.4.1**. Production remains
configured for Node 22; this session does not replace Node 22 CI acceptance.
Typecheck, production build and the strict tenant audit passed. The strict audit
ran with `node --import tsx scripts/auditTenantGuards.ts --strict` because the
`tsx` CLI's IPC socket is denied by this sandbox; it scanned 60 router files with
zero active findings and the same two reviewed exceptions. Build retains existing
analytics-placeholder and browser-data warnings. `git diff --check` passed.

The focused import/workbook suites passed **74 tests across five files**;
repair input, delivery and status regressions passed **29 tests across three
files** (**103 total**, zero failures/skips). MySQL-backed repair
integrity/concurrency tests, full database suite, built-server/browser socket
checks, S3/provider acceptance and Android checks are **unrun**: this sandbox
denies sockets, and Docker/network access requests did not complete. No production
database or service credentials were used to work around the restriction.

The SheetJS `xlsx` 0.18.5 dependency blocker and earlier live-data/release gaps
remain open. No dependency, migration, email automation or release policy was
changed in this continuation.

## Further audit fixes — 2026-10-16 (local follow-up)

Baseline: clean `ff8fc37`. This follow-up addresses additional F17 and F19 code
gaps. No schema migration, production access, real email or deployment is included.

| Finding | Change | Validation / remaining limits |
|---|---|---|
| F17 legacy checklist writes | Save, bulk save and delete hold the job's finalization lock through the audited transaction, including parent checks and all writes. Offline result batches acquire sorted parent locks before any consistent snapshot read. | `inspectionSealBoundary.test.ts`; prepared `inspectionSealIntegrity.test.ts` covers seal-first/write-first ordering and whole-batch rollback on real MySQL, currently unrun. |
| F17 sprinkler transaction escape | Sprinkler data helpers previously used an independent MySQL connection, escaping the caller's transaction. They now use contextual `getDb`; every sprinkler mutation holds the parent job lock and revalidates indirect ancestors after the lock. Replacement delete/insert operations commit or roll back together. | `sprinklerTransactionContext.test.ts`, sprinkler cases in the seal boundary suite; three replacement-rollback cases prepared for real MySQL, unrun. |
| F19 quote false success and retry | Both quote send routes reject missing provider configuration before preparation, reserve durable operation UUIDs before dispatch, send provider idempotency keys, check HTTP outcome and require a nonblank string message ID. Accepted receipt retries skip PDF/provider work; generic quote tokens remain stable and conditional status writes preserve later approval decisions. | `quoteDelivery.test.ts`, `emailOutboxOrchestration.test.ts`; providers and persistence mocked. Preparation failures and uncertain provider outcomes remain blocked for operator reconciliation. |
| F19 recovery receipts | Office senders can look up only their own operations within their company; platform operators can see their own cross-company sends. Responses expose only request ID, status and provider message ID. Malformed historical acceptance receipts are treated as unknown. | `emailDeliveryReceipt.test.ts`; denied roles, sender/tenant SQL scope, missing tracking and response projection covered. No resend or outbox-edit permission is exposed by lookup. |
| F19 durable quote-send intent | Quote-send UI commits the original UUID and exact recipients to strict IndexedDB before dispatch, coordinates tabs with Web Locks, preserves attempts through errors/reopening and requires fresh server acceptance/rejection evidence before an explicit new send. Stale tab retries must match the observed UUID; accepted recovery reuses that UUID to finish quote state without resending. | `deliveryOperation.test.ts` (22); browser/native end-to-end interruption tests remain unrun. Provider acceptance is labeled separately from recipient delivery. |

Node **24.19.0**, pinned pnpm **10.4.1**; Node 22 CI acceptance remains separate.
Combined server verification passed **170 tests across 12 files**, and client
delivery-operation checks passed **22 tests**: **192 total across 13 files**, zero
failures/skips. Typecheck, production build, strict tenant audit (61 router files,
zero active findings, two reviewed exceptions) and `git diff --check` passed.
Existing analytics-placeholder/browser-data build warnings remain. Independent
review found no remaining blockers in the reviewed changes after accepted-state
recovery, stale-tab retry and malformed historical-receipt fixes.
These are focused mocked/pure checks, not a full database
suite. The existing optional/offline database suites cannot initialize without a
disposable `DATABASE_URL`; no production database was substituted. The nine new
MySQL seal/concurrency/rollback cases are prepared but **unrun**. Socket-dependent
built-server/browser checks, S3, real delivery and native-device acceptance remain
unrun under this sandbox's socket restriction.

The full audit remains open, including the SheetJS dependency blocker, remaining
legacy mutation/send inventory, unknown-outcome operator reconciliation and the
historical/live-data release prerequisites. No merge, push or deployment is part
of this follow-up.

The non-repair draft-freezing gap identified in this follow-up is addressed by
the further local fixes below. The original outbox change alone did not freeze
quote content.


## Remaining audit implementation — 2026-10-16–17 (local, not released)

Baseline: `fa5870f`. This pass continues F04/F06/F08/F10–F12/F14–F17/F19/F23
through alternate routes and an independent review. The table records code
changes; database, browser, native and live-service acceptance remain separate.
It does not close the release prerequisites elsewhere in this register.

| Finding | Implemented local behavior | Evidence |
|---|---|---|
| F04 attachment parents and object provenance | Writes resolve the actual canonical ancestor, lock jobs then shared site/customer parents, and recheck links on the transaction. Completion requires a persisted upload by the same uploader for the same entity, using the stored key/URL. Completed idempotent replay remains readable after sealing. Lists filter contradictory legacy aliases against the canonical entity. Multipart denial cleans temporary files. | `attachmentAccess.ts`, `attachmentBoundary.test.ts`, `uploadQueueWorkflow.test.ts`; providers and HTTP request/response objects mocked. |
| F06/F19 quotation integrity | Standard quote content freezes before preparing any outgoing PDF. Accepted or uncertain sends cannot reopen it. Partial edits preserve omitted totals. Customer decisions and required execution/approval artifacts commit together; retries validate existing scope rather than silently skipping missing work. Repair execution uses a separate job and preserves the original inspection evidence. | `standardQuoteIntegrity.test.ts`, `repairQuoteLifecycle.test.ts`, standard lifecycle regressions. |
| F06/F15 invoices and approved work | Invoice content and sorted Sage batches lock before snapshot reads; missing, duplicate, foreign or inconsistent entries reject the whole batch. Exact cents validate lines, tax, paid amount and balance. Export flags/activity commit together. Approved-work invoicing copies only the approved snapshot and creates one linked invoice under parent locks. Payments can continue during delivery without sent-state recovery downgrading a paid/void invoice. | `invoiceAccounting.test.ts`, `invoiceBatchBoundary.test.ts`, `approvedWorkBoundary.test.ts`; `invoiceBatchMysql.test.ts` prepared, unrun. |
| F08/F16 import execution | All three workbook entry paths share site serialization and rebuild identities after the lock. Device writes, site changes and import logs share one transaction. Arbitrary mapping fields cannot overwrite server ownership/identity. Duplicate source aliases and ambiguous stored matches are excluded with row explanations. Unexpected database errors abort the batch. | `importSiteTransaction.test.ts`, `mappedImportExecution.test.ts`, `legacyFileImportExecution.test.ts`, workbook pipeline suites; MySQL interleaving suite prepared, unrun. |
| F10/F11 recorded report facts | Report routes use captured question wording/requirements and captured credentials. Missing panel, monitoring, inspection date, functionality, duration and credentials remain unknown. The PDFs do not invent annual service, certification, whole-system conformance or satisfactory operation from a lack of deficiencies. Rendering and report metadata publication share a job lock; finalized history remains readable. | `recordedReportFacts.test.ts`, `canonicalFireAlarmReport.test.ts`, `reportEvidencePdf.test.ts`, FirePro evidence PDF tests, `reportSnapshotBoundary.test.ts`. PDF text is extracted locally with the existing JavaScript parser. |
| F11/F23 generic template captures | Each new response records its template, section, question, version, requirement and provenance. Updates preserve the original capture; changed definitions require review. Finalized reporting avoids current template joins. Active assigned-template completeness is checked even when no responses exist. Unproven legacy captures are preserved and rejected for reporting/sealing. | `canonicalTemplateReport.test.ts`, `inspectionTemplateCapture.test.ts`; journal 0038/manual 0088 prepared, not applied. |
| F12 durable autosave | Fire-alarm drafts use immutable per-row revisions and acknowledgement tombstones, persist before dispatch, and serialize sends across tabs. Storage/quota/acknowledgement failure retains recovery evidence. Known payloads are strictly decoded; arbitrary stored operations never replay. The alternate fire-alarm page uses the same editor. Draft state resets by account/company/job and cannot override the target job ID. | `pendingSaves.test.ts`, `fireAlarmDrafts.test.ts`; browser/Android interruption and quota acceptance still required. |
| F14 scoped offline recovery | Queued results, smoke tests, deficiencies, photos and cached job packets are account/company scoped. IndexedDB success waits for transaction commit. Old, unowned and malformed records remain quarantined. Normal recovery exports contain the current account’s records; administrator recovery may include records without a verified owner, while known foreign-account records remain excluded. An account change cancels an in-progress export. Revision acknowledgements cannot delete a newer tab's edit; lost photo/deficiency responses preserve stable identities. QA includes job-specific evidence still awaiting sync and blocks unreadable recovery data. | Scoped queue, IndexedDB, packet-cache, upload and QA suites; no destructive Clear All or generic POST replay. |
| F17 remaining seal/transaction paths | Form header/attendance/circuit mutations, job/work-order lifecycle writes, field device edits, smoke tests, QA submission, schedule application and assignment changes hold the real parent lock through the transaction. Related assignment/work-order state changes commit together. Smoke results are recorded per job rather than reading a previous visit's shared device status. | Fire-alarm, job lifecycle, field mutation and smoke history boundary suites. Prepared real-DB seal/concurrency tests remain unrun. |
| F19 manual-send inventory | Invoice and Gmail dialogs persist exact original send payloads/UUIDs before dispatch and expose receipt recovery. Gmail authorizes the actual report parent and declared job before OAuth/storage; accepted replay skips preparation/provider calls and preserves later QA/archive states. Plain text is escaped in HTML and MIME headers are sanitized. | `deliveryOperation.test.ts`, `gmailDeliveryBoundary.test.ts`; live delivery/OAuth and browser interruption unrun. |
| F11/F23 displayed evidence and device captures | New device results and linked deficiencies capture verified device identity, location and equipment details. PDF regeneration uses those captures, never today's equipment master. Every question/device answer carries the revision actually shown when edited; changed first-time offline captures reject rather than relabeling an old answer. Older unversioned queue records remain preserved for review. Sealing rejects missing device proof. | Canonical device, displayed-evidence, fire-question revision and generic-template tests; journal 0040/manual 0090 prepared, unrun. |
| F14 account/session boundary | Cached queries and mutation callbacks are removed before a different account subtree renders; durable offline records remain scoped and preserved. Each account has an immutable tRPC client and separate query cache, bound to its displayed identity and session epoch. Protected HTTP mutations and multipart uploads reject missing/mismatched identities; supplied stale query/logout identities are rejected before effects. Old async continuations cannot acquire another account’s cache or transport. | Account-cache and expected-account transport/server regressions; multi-tab browser acceptance remains unrun. |
| F15 database payment state floor | Additive insert/update guards prevent payment status/date without receipts, paid-state downgrade and voiding received payments. Existing legacy data is not rewritten. Startup requires the additional guards. | Journal 0041/manual 0091 prepared; real MySQL transition tests are added but unrun. |
| F23 versioned seals | New seals use hash version 2, covering generic templates, legacy checklist, fire-alarm form/attendance/circuits, sprinkler evidence, signatures and canonical attachment ownership. Existing version-1 seals retain the historical algorithm and are never relabeled as version 2. Unknown versions fail closed. | `compliance.hashVersion.test.ts`, `complianceHashVerification.test.ts`, `finalizationEvidenceGate.test.ts`; journal 0039/manual 0089 prepared, not applied. |
| F22 parser containment | Workbook input size, concurrent workers, heap, lifetime, sheet count and declared cell ranges are bounded. Worker exit/termination releases the reservation correctly. | `safeXlsxRead.test.ts`, `safeXlsxReadRanges.test.ts`, `p3Security.test.ts`. **This does not fix the vulnerable dependency.** |

### Remaining external acceptance and dependency blocker

`xlsx` **0.18.5 remains an open release blocker**. The verified patched upstream
artifact is unavailable under the current network policy. No mirror, substituted
package, lockfile change or unsupported claim of remediation was introduced.
Parser containment reduces exposure; it does not resolve the known advisories.

Journal migrations **0038–0041** and separate manual migrations **0088–0091**
are prepared. They are additive and preserve missing historical evidence. None has
been applied to a live or disposable database in this session. Release still
requires Node 22 CI, fresh and restored-schema migration checks, real MySQL
concurrency/rollback, original historical evidence review, backup/PITR rehearsal,
S3 expiry/provenance, live OAuth/Calendar/email/Sage, and browser/Android field
acceptance. This sandbox blocks the required socket/network/device operations;
no production credentials or services were used as substitutes.

For an email with `sending`/`unknown` tracking, retain its original UUID and exact
payload. The recovery UI may read the owned receipt and replay an accepted
receipt to finish document metadata; it never dispatches an ambiguous attempt
again. An operator must compare the UUID, sender, recipient, time and provider
logs before an intentional replacement send. A missing message ID is not proof
of rejection. There is no exposed client mutation to mark unknown email as
accepted/rejected or erase its record. Provider-specific unknown-outcome
reconciliation remains an operational acceptance item, not an automated resend.

No push, merge, deployment, live migration, credential change, automation enable
or real outbound message is included in this pass.


### Final local verification for this pass

Node **24.19.0**; package/runtime configuration still supports Node 22 and Node
22 CI remains required. Independent reviewers found no remaining blocking defect
in the bounded changes after the corrected paths were reviewed again.

| Check | Final result |
|---|---|
| Focused affected server/client suites | **73 files / 1,013 tests passed**, zero failures or skips; real database suites excluded explicitly rather than reported as passing. |
| TypeScript | Whole-project `tsc --noEmit` passed. |
| Production build | Vite/PWA client and esbuild server bundles passed. Existing analytics-placeholder, browser-data and chunk-size warnings remain. |
| Strict tenant scan | 61 router files; zero active findings; one reviewed finalization delegation. This heuristic is not an authorization proof. |
| Migration preparation | Journal indices and snapshot chain verified through 0041; journal/manual SQL pair reviewed. No SQL execution claimed. |
| Patch hygiene | `git diff --check` passed. No configured lint step was available. |
| Database/live/native | **Unrun**: full MySQL suite and prepared interleaving/rollback/payment-state cases, fresh/restored schema execution, socket-based built-server/browser tests, S3/providers and Android. |

These results validate local code and focused regressions. The dependency,
historical evidence and external release prerequisites above remain open. No
hosted CI, deployment or live acceptance result is inferred from this checkout.

## Remaining acceptance continuation — 2026-10-17

Baseline: `b54ac4d`. This continuation checks current capabilities and fixes
failures in the remaining acceptance paths. It does not establish a release.

| Item | Current result |
|---|---|
| Manual payment-guard migration | **Fixed:** manual 0091 now preserves complete trigger bodies using the maintenance runner's delimiter support. A pure regression verifies both resulting statements exactly match journal 0041. The previous file would split trigger bodies at internal semicolons. Real MySQL execution remains required. |
| Railway failure | **Diagnosed read-only:** main deployment `5b14e294-35e0-4e84-991f-849a6ee480e2` built successfully on October 4, then repeatedly exited on missing `jobs.googleCalendarOwnerId`. The container never reached its listener. Increasing the healthcheck timeout does not resolve missing schema. [Bounded evidence](audits/RAILWAY_DEPLOYMENT_DIAGNOSIS_2026-10-17.md). |
| Startup diagnostics and release procedure | **Fixed locally:** schema errors name the failed prerequisite and maintenance runbook, preserving only sanitized driver codes. Startup remains read-only and fails closed. Release instructions now cover journal 0041/manual 0091 and six payment guards. |
| Release gating | Railway source is still `504naldo/Inspectra@main` with `checkSuites=false`; no staged changes were present. Main's GitHub branch is unprotected. A separate [audit branch](https://github.com/504naldo/Inspectra/tree/codex/audit-acceptance-20261017) was published for disposable CI acceptance. Main remains `179e8c8`; no merge, production deployment or live setting change was made. |
| Runtime version | Failed deployment build logs installed Node **22.19.0**. No direct `process.version` evidence from the failed runtime was available. Local checks use Node **24.19.0** and do not replace Node 22 CI. |
| Executor capabilities | Current enforced environment policy has no configured credentials, runtime variables or outbound identities. Chromium/Playwright are installed, but Chromium launch fails with socket `EPERM`; built-server listen and Docker socket access also fail `EPERM`. Narrow extra-access probes did not complete and were cancelled. No real browser/DB/storage/native acceptance is inferred. Connected Railway reads are separate from executor access. |
| Disposable storage acceptance | Prepared a separate MinIO/MySQL CI job with a private synthetic bucket. Eleven existing workbook integration cases now require explicit disposable configuration and have current canonical fixtures. Four additional authenticated HTTP cases cover genuine URL expiry/re-signing, persisted uploader/parent provenance, multipart tenant denial and post-seal replay/write denial. Fresh signed downloads support configured private storage endpoints; stored/keyless URLs retain public-host checks and redirects are rejected. Independent SSRF review passed. These 15 integration cases remain unrun locally. |
| Payment recovery/restore acceptance | Updated scripts for migrations 0038–0041 and six guards. Historical balances are seeded before the unpaid-insert guard, then upgraded without inventing captures. Native dump/restore compares legacy/current evidence and all guard definitions; repeated forward recovery preserves receipts and totals. Destructive rehearsals require explicit disposable intent and clean up only databases they successfully created. A separate Node 22/MySQL/Chromium CI job is prepared. Real execution remains unrun locally. |
| Browser component acceptance | Eight scenarios import production components and use real browser DOM/storage/Web Locks with synthetic HTTP/provider responses. Dedicated harness typecheck, Python/Node syntax and browser bundling passed. Local launch fails before scenarios because of socket restrictions. This harness does not establish backend, service-worker, native or live-provider acceptance. |
| Android build acceptance | Prepared Java 21/API 36/Gradle 8.14.3 debug-build CI with Capacitor sync and APK evidence. Local SDK, adb, emulator and KVM are absent; no local Gradle build ran. The CI job only builds because the configured APK API host is production. Device interruptions, camera/haptics and native storage still require separate acceptance. |

Local verification for this continuation: **118 tests across 11 files passed**,
plus the current migration-manifest check (the three MySQL cases were explicitly
filtered out). Whole-project TypeScript, dedicated browser-harness TypeScript,
Vite/PWA and esbuild production builds, strict tenant scan (61 routers, zero
active findings, one reviewed exception), syntax and patch checks passed.
The prior 1,013-test focused run belongs to baseline `b54ac4d` and is not a new
full database run. Five hosted CI jobs are prepared for the separate unmerged
`codex/audit-acceptance-*` branch; results are pending.

### Hosted acceptance evidence

Published GitHub head `087942344d889f79954845cd61355aa274161a95` has tree
`72d3de04ffc1d7d1a6108492fba4dae1e6dc476e`, exactly matching local `d180c53`.
[Run 38987514645](https://github.com/504naldo/Inspectra/actions/runs/38987514645)
uses disposable infrastructure. Node **22.23.3** and MySQL **8.0.46** are confirmed.

The [payment acceptance job](https://github.com/504naldo/Inspectra/actions/runs/38987514645/job/117262311152)
**passed**: a committed $40 payment with its response dropped survives refresh
and browser restart with the same receipt; a separate explicit $60 reaches $100
with two receipts; simultaneous tabs commit one $25 operation. Native MySQL
dump/restore preserves all rows, tenant ownership, legacy/current captures and
six complete guard definitions. It detects the post-backup $25 gap, rejects old
writers/history edits/state downgrades, then restores $75 through repeated
forward recovery exactly once. This closes the synthetic current-schema
browser/backup acceptance gap; production backup/PITR and source accounting
reconciliation remain separate.

The first workflow submission failed validation before any job ran because a
service-container expression was placed at job level; it was moved to the
restore/diagnostic steps. The first executable run exposed two browser-harness
assertion/cleanup failures after six scenarios passed, an obsolete Android SDK
setup default and an unavailable Docker Hub MinIO image. Corrections are being
validated; none of these failed/skipped paths is counted as passing acceptance.

The first full suite ran **2,249 passing tests**, with 17 failures across five
files and one repair-suite setup failure. Two MySQL fixtures omitted required job
numbers; attachment authorization mocks omitted canonical ancestors; one autosave
test assumed a fixed number of microtasks across Node 22/24 lock implementations.
These fixture/synchronization defects were corrected without weakening production
constraints or authorization. The replacement run must execute the previously
unreached assertions before those suites can be accepted.

The hosted payment browser also exposed requests for unresolved optional
analytics placeholders. Vite now injects the original deferred analytics tag only
when both settings are present. A real build with empty configuration emits no
analytics request, and all four absent/partial/configured combinations were
verified without making tracking calls.

Read-only Railway health on October 17 confirmed one running replica from the
successful October 2 deployment `0d71ab5f-a6d8-4925-bcb8-001635f381d0`, with no
pending work. The later October 4 attempt failed on missing schema. The failed
attempt does not mean the earlier serving deployment is offline, and the new
audit branch has not replaced it.

The next verified head, `ab73e75f0371d7061d059fb6935d7d002ae7fc6b`, passed
**2,285 tests across 188 files**, with **18 explicit skips** across the full
193-file suite. Node 22 typecheck, strict tenant scan, fresh schema migration,
production build and isolated built-server smoke passed. All eight Chromium
component scenarios and the payment/browser/restore job passed. The Android
debug APK built using Java 21/Gradle 8.14.3 and was uploaded; it was never launched.
[Browser evidence](https://github.com/504naldo/Inspectra/actions/runs/38995939508/artifacts/12086129861)
and [Android artifact](https://github.com/504naldo/Inspectra/actions/runs/38995939508/artifacts/12086914641)
belong to that head, not to later changes.

The official registry image references both required authentication. CI now builds
the official MinIO source at signed release commit
`0d7408fc9969caf07de6a8c3a84f9fbb10a6739e` using Go 1.24.2. The first source-built
run executed all 15 storage cases: four authenticated expiry/provenance/multipart/
seal cases and ten imports passed. One real Site-preview defect remained:
two-column key/value rows were skipped despite the parser's column-two fallback.
The row guard is corrected and two-/three-column regressions pass locally; real-storage rerun remains pending.

Run `38997667071` subsequently passed **2,312 tests** (19 explicit skips), all
eight browser scenarios, payment/current-signature backup recovery and the
Android build. Real storage passed **15/16**, including all five authenticated
upload/signature cases. The corrected Site fields passed, exposing a second
preview defect: an ordinary `Location`/`Tag`/`Type` extinguisher sheet accepted by
execution was omitted from preview counts. Preview detection now accepts a
recognized device-sheet name plus an actual header signal, retaining pricing and
summary exclusions. The original integration fixture is unchanged; focused
regressions cover its 12 extinguisher/8 light counts and unrelated-sheet denial.
Final hosted verification follows below.

### Remaining signature durability implementation

The smaller F18 follow-up is now implemented locally. Newly captured technician
and contact signatures store actual object keys under the job lock, using additive
journal **0042** / manual **0092** nullable columns. Both PDF pipelines refresh
the technician signature URL from its key. Retrieval/render failures stop report
generation instead of silently substituting a company name. Captured rows and
URLs are not changed by reads. Legacy keyless records stay keyless; no expired URL
is turned into invented provenance. Version-1 seals are unchanged; the still
unreleased version 2 includes both keys. Fresh signature captures, real PNG PDF
embedding, failed retrieval/rendering, locking and hash tamper cases passed
focused checks and independent review. Run `38997667071` then passed the updated
MySQL migration/restore checks and all five authenticated storage cases, including
real capture of both signature keys, expired URL rejection and fresh byte retrieval.
Company logos are external URLs; no unsupported managed-logo upload workflow was added.

### SheetJS dependency remains blocked

The [official Node installation instructions](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
specify **0.20.3** from
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; npm remains at 0.18.5.
The official GitHub source is older than both fixed versions and has no patched
release artifact. The installed/cache/lockfile version is still **0.18.5**.
The current enforced host policy excludes `cdn.sheetjs.com` and `git.sheetjs.com`,
and executor network access has not been established. No package or lockfile
change was made. The [prototype-pollution advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
requires at least 0.19.3; the [ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
requires at least 0.20.2. Containment regressions pass but do not fix either issue.

Completion requires executor access to the official tarball, or an authenticated
upstream artifact and independently verified digest supplied locally. Then pin
the official artifact, verify its content/version and lockfile integrity, and run
the worker, workbook/import and advisory regressions plus frozen installation,
typecheck and build. An unverified mirror or version-only lockfile edit is not a fix.

### Final hosted acceptance — 2026-10-17

The verified code run before the private-endpoint follow-up below is
[38998121971](https://github.com/504naldo/Inspectra/actions/runs/38998121971),
GitHub head `416c617c7d6ae96b772680ddcc1ac5c30671afc1`. Its tree
`430deddacb6cfd78e496df80bac9f2a193f9efbf` exactly matches local code commit
`6f9f7ef59774123d5eaa4f58d333fb179b87a793`. This head includes both preview
corrections and the durable-signature implementation. **All five jobs passed.**
The documentation-only evidence update immediately after that run retained its
tested application tree. The later private-endpoint follow-up below has separate
validation and changes the image-fetch implementation.

| Check | Final verified result |
|---|---|
| Node 22 / MySQL full suite | **2,314 passed**, zero failures, **18 explicit skips**; 192 passing files and five storage-gated files across 197 total. Node **22.23.3**, MySQL **8.0.46**, pinned pnpm **10.4.1**. |
| Required build/start checks | Frozen dependency installation, whole-project TypeScript, strict tenant scan (61 routers, zero active findings, one reviewed exception), fresh journal migration through **0042**, production client/server build and isolated built-server health/UI smoke all passed. |
| Real MySQL integrity and migrations | Manual **0086–0092** selected-history acceptance, interrupted-trigger DDL/retry, legacy NULL captures/signatures and v1 seals passed. Repair-quote concurrency/rollback (15), inspection sealing/rollback (9), import serialization/rollback (3) and invoice batch concurrency/rollback (3) all executed and passed. These are disposable histories, not the production history. |
| Real storage and authenticated HTTP | **16/16 cases across five files passed**, with a private synthetic MinIO bucket and MySQL. All 11 workbook cases and five authenticated expiry/provenance/multipart/seal/signature cases ran. Original Site workbook preview/import/reimport assertions passed unchanged. Actual technician/contact captures persisted separate real keys; expired URLs returned 403 and fresh signatures returned identical bytes. |
| Browser component acceptance | **8/8 scenarios passed** using production React components and real Chromium DOM/storage/Web Locks with synthetic HTTP/provider responses. Covers interruptions, late cross-account queries, quota failure, durable-send loss/reload and cross-tab recovery, recipient/entity resets, smoke focus/revisions and the individual-device all-pass barrier. Backend/provider/service-worker/native acceptance is separate. |
| Payment browser and backup recovery | Real Chromium/MySQL response-loss, refresh/restart, cumulative payments and two-tab deduplication passed. Native dump/restore preserved current/legacy signature keys and URLs, all evidence, owners, totals and six guards; stale-backup detection, rejected historical writers and repeated exact-once forward recovery passed through schema 0042. |
| Android build | Debug APK built with Java **21.0.12**, Gradle **8.14.3**, 308 tasks executed; nonempty APK verified and uploaded. The APK was never launched. |
| Independent/local review | No additional implementation blocker found in the reviewed scope. Final preview/mapping/canonical-import checks passed **49 tests** locally; final hosted results above include these changes. |

The full-suite skips are **16 storage cases**, all executed successfully in the
separate storage job, plus **two historical Phase-2 source-comment checks** that
remain skipped. A formerly skipped client Fire-Pro mapping case now runs with
the established safe contract: ambiguous `Unit #` is not guessed to be a barcode;
an explicit `Barcode` column takes precedence. No production mapper behavior was
changed to force the obsolete expectation to pass.

Evidence artifacts for this exact run:

| Artifact | Download | ZIP SHA-256 |
|---|---|---|
| Browser traces/results | [12087624289](https://github.com/504naldo/Inspectra/actions/runs/38998121971/artifacts/12087624289) | `800fc1632f4011ce6495f038eba30d49ffcba046938a181aa8973c36dee08b99` |
| Storage runtime log | [12088336363](https://github.com/504naldo/Inspectra/actions/runs/38998121971/artifacts/12088336363) | `efa3e0d883092eacd0b04e03c5e4055adbe4728ad7b6b1c2ee149ae75b2700f9` |
| Unlaunched Android debug APK | [12088076481](https://github.com/504naldo/Inspectra/actions/runs/38998121971/artifacts/12088076481) | `89bfbec166e8d593efdb01dba4a79a5181deff06ed7f23a8814ea418e4847651` |

Storage assertions and the 16-case result are in the
[storage job log](https://github.com/504naldo/Inspectra/actions/runs/38998121971/job/117295075821),
not in the small runtime-log artifact. Downloaded browser/storage artifacts had
their ZIP digests verified; the storage log confirms loopback binding and graceful
shutdown. Android's digest is the uploaded artifact metadata, not hardware acceptance.

Read-only production verification at **03:18 UTC on October 17** still showed the
successful October 2 deployment, one running replica, zero crashed replicas and
no pending work. Main remained `179e8c8` and unprotected. No production deployment
or schema change is inferred from this green audit-branch run.

### Further audit closure — 2026-10-16 (America/Vancouver)

The F18 private-endpoint follow-up now uses the same validated storage-image
fetch for signatures and report photos. It authorizes the canonical parent
before resolving a stored key, then permits a private endpoint only for an
internally generated SDK URL matching the configured origin, bucket and exact
object key. Keyless records retain public-host checks; redirects are rejected.
Known-key signing, validation or fetch failure never retries the stored URL.
Unavailable signatures block generation; unavailable photos return a structured
failure and retain the existing secret-free warning behavior. No schema,
captured row or seal algorithm changes are part of this follow-up.

Local checks passed **98 tests across 11 files**, whole-project TypeScript and
patch checks. Independent review found no blocker. The real-storage acceptance
case now exercises actual private MinIO signature retrieval/PDF embedding and
photo recovery after URL expiry. Hosted
[run 38999316236](https://github.com/504naldo/Inspectra/actions/runs/38999316236)
passed **all five jobs** at GitHub head
`2e919f9e303c42125a306cfc5f1e2fdb104ba4d3`. Its tree
`fc08bd606b5e4ee05f5446c1a8333fdad0072b6a` exactly matches local implementation
commit `6ef005786edff85e73f010a85d7da142f466c8dd`. The subsequent update records
results/runbook guidance only; the tested application, schema, scripts, tests and
CI workflow are unchanged.

| Current acceptance | Verified result |
|---|---|
| Full Node 22 / MySQL suite | **2,345 passed**, zero failures; 194 passing files across 199 total. The same **18 explicit skips** remain: 16 storage cases passed separately, plus two historical Phase-2 source-comment checks. |
| Required gates | Frozen install, TypeScript, strict tenant scan, journal migration through 0042, production build and isolated built-server health/UI smoke passed on Node 22.23.3/MySQL 8.0.46. |
| Real storage and private PDF images | **16/16 passed**. Actual captured signature keys were freshly signed from private MinIO, returned original PNG bytes and embedded into a real generated PDF after the original URL returned 403. Actual uploaded photo recovery passed. Keyless private URLs remained blocked, foreign/sealed mutations were denied, and captured job rows stayed unchanged. |
| Browser components | **8/8 passed**, with synthetic HTTP/provider responses; no native or live-provider result inferred. |
| Payment and recovery | Real browser interruption/deduplication and current-schema full dump/restore, signature/evidence preservation, all six guards, stale-backup detection and repeated exact-once synthetic forward recovery passed. |
| Android | Debug build passed, 308 tasks executed; nonempty APK uploaded. No APK launch or hardware acceptance. |

Current artifacts:

| Artifact | Download | ZIP SHA-256 |
|---|---|---|
| Browser traces/results | [12088561678](https://github.com/504naldo/Inspectra/actions/runs/38999316236/artifacts/12088561678) | `7a7a9df4ad21026f3a7dc4dc3cbda2bc1dce3ab6bc9edcdb2ed0378f74eb8f31` |
| Storage runtime log | [12087574494](https://github.com/504naldo/Inspectra/actions/runs/38999316236/artifacts/12087574494) | `c4816854ceeff9104ba2ef65315c19213d03971da31582dccfe5f067d288d1c5` |
| Unlaunched Android APK | [12088910662](https://github.com/504naldo/Inspectra/actions/runs/38999316236/artifacts/12088910662) | `afe0d824fc89864f2c2be4133afb7c701b796dd28710038f1c32d42b5431a7fc` |

Browser/storage ZIP digests were independently verified after download. The
[storage job log](https://github.com/504naldo/Inspectra/actions/runs/38999316236/job/117298669443)
contains the expanded private-image assertions and 16-case result; its small
runtime-log artifact records graceful MinIO cleanup. The APK digest is uploaded
metadata, not device evidence.

The [Android field runbook](runbooks/ANDROID_OFFLINE_FIELD_TEST.md#22-audit-acceptance-addendum-device-storage-sessions-and-operation-recovery)
now specifies quota failures, late account responses, service-worker/in-place APK
updates, haptics and native payment/manual-send operation recovery, with isolated
test prerequisites. It distinguishes non-overridable legacy/evidence QA blockers.
These are prepared procedures, not hardware results. The
[deployment runbook](runbooks/DEPLOYMENT.md#enable-ci-gates-before-release)
now identifies the exact Railway target, Wait for CI setting and five required
GitHub checks; Railway's workflow-conclusion gate does not replace branch protection.

Current cloud configuration revision **27** is enforced and current, with the
package-manager host preset, no bound credentials/identities and no private TCP
destinations. Official SheetJS hosts remain excluded. A fresh read-only scan of
local caches and official GitHub releases/tags/source found no authenticated
patched artifact. SheetJS 0.18.5 remains installed. Current connected tools cannot
set Railway `source.checkSuites` or GitHub branch protection; source reconnection
would start a build and is not a substitute. No production setting was changed.
Railway inventory still contains only the production environment; read-only
status showed the same October 2 deployment online, one running replica and no
pending rollout. No approved staging target, database/provider test identity or
attached Android device was available for the remaining external checks.

### Remaining release work after automated acceptance

The following work stays open. Passing disposable tests does not supply the
missing production evidence or authorize a release.

| Item | Concrete prerequisite |
|---|---|
| SheetJS advisories (F22) | Obtain and authenticate the official patched artifact, pin it with lockfile integrity, then repeat the import/security and installation checks described above. Installed 0.18.5 is still vulnerable. |
| Live schema and financial recovery (F07/F15/F23) | Verify a restorable production backup/PITR and source accounting reconciliation; inspect the actual migration history, invoice-number duplicates and all six payment guards; rehearse the reviewed schema path on a sanitized restore before a maintenance window. Startup performs no migration or backfill. |
| Historical inspection/report evidence (F10/F11/F23) | An inspection owner must review representative original reports, credentials, template/device captures and legacy seals. Preserve unproven records and recover original evidence; today's master data cannot establish what was inspected. |
| Credential exposure and live integrations (F01/F02/F19/F21) | Complete the authorized incident/token review, OAuth/invitation, Google Calendar ownership, email and Sage acceptance using the intended accounts. For uncertain sends, reconcile the original UUID/payload against provider records before any intentional replacement. Synthetic providers establish no live delivery result. |
| Android and offline field acceptance (F12/F13/F14/F19) | Run the field runbook on actual hardware, including camera/haptics, process interruptions, storage/quota, account changes, service-worker updates and native send recovery. A desktop browser harness and an unlaunched debug APK do not establish these results. |
| Legacy signatures and external images (F18) | Recover original evidence when an expired historical signature has no durable key. Operator-supplied logos still require a stable external host. Keyless private URLs remain blocked. Fresh key-based private signature/photo recovery and PDF embedding passed real MinIO acceptance in the follow-up above. |
| Release gating | Main is unprotected and Railway follows main with `checkSuites=false`. Establish the intended protection/check policy and complete the maintenance runbook before merging. No protection, deployment or production-setting change was made here. |

No production SQL, historical conversion, provider mutation, token rotation, real
outbound message, APK launch, main merge or deployment was performed in this
continuation. These are explicit remaining prerequisites, not completed fixes.
