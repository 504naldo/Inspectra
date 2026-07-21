# Tenant-guard audit (`security:tenant-audit`)

A lightweight **static heuristic** that flags tRPC procedures which accept a
record identifier (`jobId`, `siteId`, `reportId`, `attachmentId`, …) but show no
sign of scoping that record to the caller's tenant. It exists to catch the
recurring failure mode where a new router forgets the house tenant-scoping
convention (the exact class of bug behind FAB-01, FAB-02, and FAB-09).

- **Script:** `scripts/auditTenantGuards.ts`
- **Run:** `pnpm security:tenant-audit` (advisory) · `pnpm security:tenant-audit:strict` (exit 1 on findings) · add `--json` for machine output
- **CI:** runs advisory (non-blocking) in `.github/workflows/ci.yml`

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
(false-negative-leaning) to keep the check low-noise and advisory.

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

## Current status (advisory)

At introduction the check flags **8** procedures for triage and allowlists **4**
reviewed exceptions. Because genuine candidates are still open (tracked as
**PR-18** in the register), CI runs the audit **advisory (non-blocking)**. Once
PR-18 is resolved — each candidate either fixed or explicitly allowlisted with a
reason — flip the CI step to `security:tenant-audit:strict` so regressions fail
the build.

## Extending it

- New identifier conventions → add to `ID_TOKENS`.
- New approved guard/getter names → add to `SCOPING_SIGNALS`.
- Reviewed exceptions → add to `ALLOWLIST` with a reason.
