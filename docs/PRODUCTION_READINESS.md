# Inspectra — Production Readiness Register

**This is the single active register of production-readiness findings.** Historical
audit Markdown files in the repo root are point-in-time snapshots; this file is the
live status. Update it (don't fork it) when findings change.

Severity: P0 = blocks release / data-integrity / security · P1 = important · P2 = minor.
Status: open · in-progress · fixed · accepted-risk · wont-do.

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
| PR-16 | Customer report photos fetched from the stored, expiring presigned `fileUrl` (7-day) → silently dropped from reports regenerated later | P1 | Reports/Storage | fixed | `reportRouter.ts` deficiency-photo prefetch used `fetchImageBuffer(row.fileUrl)`; the durable `fileKey` was unused | `server: re-sign report photos from fileKey so they survive fileUrl expiry` | `pdfImageResolver.test.ts` (6) | eng | Closes the "presigned-URL expiry on old report photos" runtime risk from the 2026-07-16 Fable audit. New `resolveAttachmentImageForPdf()` re-signs a fresh URL from the durable `fileKey` at generation time (falls back to the stored URL only when no key), keeps SSRF protection, returns a discriminated ok/fail result (a failed image is never treated as embedded), and logs a secret-free warning. Logo/tech-signature still use stored URLs with **no key column** — separate, smaller exposure noted for a future schema follow-up |
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
- **Presigned-URL expiry on old report photos — CLOSED** by PR-16 (fresh re-sign from `fileKey`). Logo/tech-signature durability is a smaller open follow-up (no key column).

## How to use this register
- Add a row per finding with evidence (file/line or commit).
- Link the fix commit and the validation (test name or manual step).
- Don't create a new root `*_AUDIT.md` for ongoing work — record it here.
- Root audit files remain for history; see `docs/audits/README.md`.

## Uploaded audit remediation — 2026-10-02 (draft branch)

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
| F06 financial child authorization | in-progress | Invoice child IDs validated against real parent, scoped SQL and invoice transaction locks; repair item actual parent checked | Repair-quote finalization/delete concurrency coverage |
| F07 session revocation | fixed | Typed required sessionVersion; atomic deactivation increment; no permissive missing-column fallback | Verify live DDL before release |
| F08 import destinations | in-progress | Drive/PDF/file destination guards before provider/download/import, deriving organization from authorized site | All import branches and source/destination site consistency acceptance |
| F09 inspection device parent | fixed | Device company/site must match authorized job; whole batch validation before writes; `auditRemediation.test.ts` | Field workflow acceptance |
| F10 unverified report facts | fixed | Removes sample system/battery facts and legacy letter assumptions; prints canonical snapshot wording and recorded values | Representative generated PDFs reviewed by inspection owner |
| F11 checklist/report divergence | in-progress | Annual capture, QA submission and compliance report read canonical snapshot results; incomplete/legacy captures fail closed | Reviewed legacy conversion and every alternate finalization/report route |
| F12 fire-alarm autosave | in-progress | Per-record durable drafts before debounce; serialized revisions; account/company/job scope; reload/error recovery tests | Browser/Android rapid editing, collapse/reload and quota-error acceptance |
| F13 offline date type | fixed | ISO timestamp validation and Date conversion; malformed batch denied | Android sync acceptance |
| F14 false offline success/replay | in-progress | Failed offline POST rejects; generic replay disabled and preserved; QA blocks legacy queued requests | Typed account-scoped recovery for all legacy/photo queues; field recovery UI |
| F15 partial payments | fixed | Cumulative authoritative cents, durable UUID receipt and invoice row lock; retries/concurrent receipts tested | Batch Sage export concurrency and historical accounting reconciliation |
| F16 workbook identity | in-progress | Floor included in fallback identity; serial/barcode stable; ambiguous identities excluded before writes | Preview collision explanations and distinct inserted/updated counts |
| F17 transaction/seal integrity | in-progress | AsyncLocalStorage transaction propagation; audited inspection/fire-alarm/attachment/media writes share finalization job lock; rollback/audit-variable tests | Concurrent finalization interleaving tests and remaining legacy mutation inventory |
| F18 expired report URLs | fixed | Fresh storage URL from durable key on report reads, Gmail/Drive and file import; no stale fallback on signing error | Disposable S3 suite and live expiry acceptance |
| F19 false/duplicate sends | in-progress | Durable outbox reservation before Gmail/Resend; accepted receipt reuse; ambiguous outcomes block retries; fake-provider/SQL-failure tests | Reconciliation UI/runbook acceptance; live provider semantics; other explicit send routes |
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


## Sprinkler Desk integration — 2026-10-10

First workflow only; default-off and not approved for production activation.
Architecture/ownership/security and staged migration/rollback procedure:
[integration boundary](integrations/EWF_SPRINKLER_DESK.md). EWF remains the
authoritative SQLite service. No production database/volume/settings changed.

| Finding | Status | Evidence / release gate |
|---|---|---|
| EWF identity/tenant routing | Implemented, staging-only | Guarded Inspectra parent context; server-only signed requests; reviewed active account maps; exact fitter assignment; no delegated sessions/roles |
| Historical estimating context | Implemented | Immutable source/property mappings; row revisions; submitted EWF triggers; changed context fails closed |
| MFA delegation | Blocked for enrolled/required accounts | Adapter cannot attest MFA; deny delegation rather than bypass protection. Separate verified design and approval required |
| EWF schema18 activation | Unapproved | Fictional schema17 bundle/restore, transactional interruption and repeat rehearsal; production backup and staging rehearsal remain release gates |
| Whole-suite consolidation | In progress | First quote/fitter workflow only. Approval/WO/scheduling/visits/billing/stock/equipment/report adapters remain future phases |
| Production recovery | Open | Inspectra PR18 deployment failed; this integration does not repair or verify live schema. No integration activation until independently recovered and approved |

Validation: 1,248 Inspectra tests passed /14 skipped; EWF185 tests passed on
Node22.23.3/24.19.0; all ten EWF browser/PWA checks and real cross-app mobile
workflow passed. Inspectra typecheck/build/isolated smoke and strict tenant audit
(61 routers,0 active findings,2 reviewed exceptions) passed. EWF dependency audit
passed; Inspectra dependency audit **failed** with75 existing vulnerabilities
(11 low,41 moderate,20 high,3 critical), unchanged dependencies/lockfile. Lint
is unconfigured; Android/live HTTPS/MFA/production restored-data validation unrun.
First release restricts each EWF instance to one configured Inspectra company:
native EWF office access is organizational, so adding more clients would bypass
tenancy. Multiple-client adapter configuration fails closed.
