# Tenant-guard audit (`security:tenant-audit`)

A lightweight **static heuristic** that flags tRPC procedures which accept a
record identifier (`jobId`, `siteId`, `reportId`, `attachmentId`, …) but show no
sign of scoping that record to the caller's tenant. It exists to catch the
recurring failure mode where a new router forgets the house tenant-scoping
convention (the exact class of bug behind FAB-01, FAB-02, and FAB-09).

- **Script:** `scripts/auditTenantGuards.ts`
- **Run:** `pnpm security:tenant-audit` (advisory) · `pnpm security:tenant-audit:strict` (exit 1 on findings) · add `--json` for machine output
- **CI:** runs `security:tenant-audit:strict` as a required step in `.github/workflows/ci.yml` (no continue-on-error)

## What it is — and is NOT

It reads router source with regexes. It **cannot** follow control flow, resolve
a helper defined in another file, or understand a bespoke inline check it hasn't
been taught.

- A **flag** means "a human should look at this procedure," not "this is a bug."
- A **clean run** means "nothing obvious," **not** "proven safe."

This is lint-grade, not a security proof. The authoritative record of reviewed
decisions is the script's `ALLOWLIST` (with reasons) plus
[`docs/PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md).

## How a procedure gets flagged

All three must hold:

1. It is a `technicianProcedure`, `officeProcedure`, `protectedProcedure`,
   `customerProcedure`, or `adminOrOfficeProcedure`. (`adminProcedure` is
   **excluded** — `admin` is the cross-company platform operator per
   [`ROLE_TRUST_MODEL.md`](../ROLE_TRUST_MODEL.md), so cross-company access
   there is intended.)
2. Its block references a record identifier (see `ID_TOKENS` in the script).
3. Its block shows **no** approved scoping signal (see `SCOPING_SIGNALS`) and it
   is not in the reviewed `ALLOWLIST`.

**Approved scoping signals** (any one clears the flag): a `assert*Company` /
`assert*Access` guard, a `get*ForCompany` getter, `requireOwned*`,
`callerIsPlatformOperator`, or an inline `ctx.user.companyId` /
`ctx.user.customerOrgId` comparison. The signal set is intentionally broad
(false-negative-leaning) to keep the check low-noise. Strict mode changes the
exit status on findings; it does not make the heuristic a security proof.

## The allowlist

`ALLOWLIST` in the script maps `"<relFile>::<procedureName>"` → a **reason**.
An entry means a human confirmed the scoping is handled in a way the regex can't
see, or that cross-tenant access is intended. Keep the reason specific — it is
the audit trail. **Prefer fixing the code over adding an entry.**

## Triaging a flag

For each flagged procedure, confirm by reading the code whether the record is
scoped to the caller's tenant:

- **It is scoped** (via a helper/inline check the regex missed) → add an
  `ALLOWLIST` entry with a precise reason.
- **It is genuinely unscoped** → treat it as a finding: fix it (route through the
  appropriate `assert*Company` / `*ForCompany` guard) and/or record it in
  `docs/PRODUCTION_READINESS.md`. Do **not** silence a real gap with an
  allowlist entry.

## Current status (strict CI)

PR-18's four remaining procedures were fixed in `04f5257`, after the earlier
jobAssignmentRouter fixes. The verified strict run scanned **60 router files**
with **zero active findings** and **two unchanged reviewed exceptions**
(`jobAssignmentRouter.listMyJobs`, `complianceRouter.finalizeJob`). No new
allowlist entries or weaker audit signals were added. CI now runs strict mode
so a newly flagged procedure fails the job. This is a feature-branch change;
hosted CI and deployed behavior have not yet been verified.

The four fixes authorize parent records before touching children:

- `fireAlarm.getSystemBySite`: staff use `assertSiteCompany`; customers must
  match the site's `customerOrgId` even when their `companyId` is null.
- `fireAlarm.upsertSystem`: technician/office/admin only, with
  `assertSiteCompany` before both insert and update paths.
- `job.getJobTechnicians`: staff use `getJobForCompany`; customers must match
  the job's `customerOrgId` without requiring a company binding.
- `site.getLastInspectionSummary`: retains `officeProcedure` and adds
  `assertSiteCompany` before querying the last inspection.

The shared helpers preserve the platform-admin bypass. No assignment gates
were added: reassigned technicians can still sync captured offline work.
Missing parent records produce `NOT_FOUND`; an authorized existing site
without a fire-alarm system returns `null`.

`companyAccess.test.ts` adds **26 real-MySQL regressions**, including denied
writes leaving data unchanged on insert/update, same-company technician
access, customer organization isolation with/without a company binding,
platform-admin access and missing parents. Existing fire-alarm setup/autosave
mocks now provide realistic parent sites and exercise the real site guard.
Focused validation passed **110 tests**; the full suite passed **1,167** with
**14 existing skips**. Typecheck and build also passed. See the
[readiness register](../PRODUCTION_READINESS.md) for the validation limits and
remaining live checks.

## Extending it

- New identifier conventions → add to `ID_TOKENS`.
- New approved guard/getter names → add to `SCOPING_SIGNALS`.
- Reviewed exceptions → add to `ALLOWLIST` with a reason.

## Uploaded audit verification — 2026-10-02

On `codex/audit-remediation`, strict mode again passed: **60 router files,
zero active findings, two reviewed exceptions**. The finalization exception now
explicitly records its documented platform-admin bypass. The shared
`assertAttachmentDestination` signal was added after reviewing its canonical
parent/company/customer and finalized-write checks; no new allowlist entry was
added. CI strict mode remains required.

PR-18 is already merged via PR 16 (`7c4e5df`), rather than awaiting its original
feature-branch review. Current remediation base is `87a23db`. Final focused tests
passed **186**, and the full suite passed **1,225** with **14 existing skips**
on Node 22.23.3 and disposable MySQL. Tests include null-company customers,
actual child/ancestor consistency, admin bypass, missing parents, unchanged
denied writes, and reassigned technician offline sync. The clean heuristic does
not establish that all import, multipart, concurrency or external-provider paths
are verified; outstanding acceptance work is recorded in the
[readiness register](../PRODUCTION_READINESS.md#uploaded-audit-remediation--2026-10-02-draft-branch).
