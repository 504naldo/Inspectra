# Role Trust Model

**Date:** 2026-07-03 · **Status:** active — admin cross-company bypass wired into the tenant guards

Inspectra roles are `admin`, `office`, `technician`, `customer` (per-user, in `users.role`).
Every user is bound to one `companyId` at login (`server/_core/oauth.ts`); customers
are additionally bound to a `customerOrgId`. There is **no** company switcher,
impersonation, or separate superadmin account.

## Intended model

| Role | Scope | Meaning |
|------|-------|---------|
| **admin** | **cross-company (platform operator)** | May view/manage data across all companies. Intended as the Inspectra operator/superadmin. |
| **office** | own company | Full day-to-day operations within its own company only. |
| **technician** | own company | Field work within its own company; some actions further limited to assigned jobs. |
| **customer** | own `customerOrgId` | Portal reads/approvals for their own organization only. |

**Security invariant (enforced + tested):** office / technician / customer must
**never** reach another company's (or org's) data. This is the load-bearing rule;
`server/authorization.test.ts` asserts it at representative and historically-weak
sites (jobs, sites, invoices, deficiencies, quotes, import center, offline job
packet, attachments, company records).

## How the admin cross-company bypass works

The caller's role + companyId are bound to an **async-local actor context**
(`server/_core/actorContext.ts`) by the `actorScope` tRPC middleware, which wraps
every authenticated procedure (`server/_core/trpc.ts`). The tenant guards read it
via `callerIsPlatformOperator()` and **skip the company-ownership check when the
caller is `admin`** — without every one of the ~140 guard call sites having to pass
the role. It fails **closed**: with no bound actor (e.g. a background job), the
bypass is off.

**Covered (admin crosses companies):**
- Every procedure that goes through `server/tenantGuards.ts` and
  `db.assertJobCompany` — jobs, invoices, quotes, sites, devices, customer orgs,
  work orders, parts-catalog items, service agreements, inventory items, import
  logs, attachments (`assertAttachmentCompany`), and the polymorphic
  `assertEntityCompany`.
- The pre-existing `role !== 'admin'` bypasses in `attachmentRouters` (attachment
  reads) and `entityRouters` (`company.get` / `company.list`).

**Also covered — bespoke inline record-ownership checks** that don't call a guard
now consult `callerIsPlatformOperator()` too: `aiAssistantRouter` context helpers
(fall through to real data instead of returning `"(access denied)"`),
`dashboardRouter` (offline job packet + user get/updateRole), `approvedWorkRouter`,
`inspectionTemplateRouter` (template/section/item owners + job checks),
`complianceRouter`, `filesRouter`, `deficiencyRouter`, `documentCenterRouter`,
`entityRouters` customer-org branch.

**Remaining residual (still scopes admin):**
- `deviceRouters` bulk-reorder — a set-membership check
  (`ownedDevices.some(d => d.companyId !== ctx.user.companyId)`); left as-is, low
  value and not a clean one-liner.
- `input.companyId !== ctx.user.companyId` **input-validation** checks (e.g.
  `jobRouter`/`dashboardRouter`/`approvedWorkRouter` `list`/`create`) are
  intentionally NOT bypassed — they validate a client-supplied companyId equals the
  caller's. Cross-company admin *writes* that pass a foreign `companyId` are the
  write-attribution concern below and need a deliberate per-write pass, not a blanket
  bypass. These are a **functionality gap, not a security hole** (stricter, never looser).

### Write attribution (audited + fixed)

The bypass lets an admin *reach* another company's records, so a create-under-parent
flow that stamped the child with `ctx.user.companyId` would have attached it to the
admin's OWN company. A write audit found and fixed every such site — each now derives
the child's companyId from the **authorized parent** the guard returns, not the actor
(a no-op for same-company callers):

- `importRouter.execute` — imported devices + the import log use the target
  **site**'s company.
- `filesRouter` (Drive device import) — devices use the target **site**'s company.
- `inspectionTemplateRouter.addSection` / `addItem` / `assignTemplate` — children use
  the **template**'s company; `saveResponse` uses the **job**'s company.
- `jobRouter.create` — re-asserts the site + customer org belong to the job's company
  (a job can't link a foreign-company site/org even though the guards bypass for admin).

Verified safe without change: `quoteRouter.create` (already used `job.companyId`);
payroll / time / availability / top-level catalog creates (self-scoped, no foreign
parent); `repairQuoteRouter.createRepairQuote` + `jobRouter` service-call create
(inline checks not bypassed → admin blocked). Regression: `authorization.test.ts`
asserts an admin adding a section to another company's template attributes it to the
**target** company, not the operator.

Updates/deletes on an already-loaded record remain safe (they don't re-stamp
companyId).

## Interaction with the capability matrix (PR-10) — resolved

PR-10 briefly made payroll approval/export and invoice void/Sage-export
**admin-only**. Under the platform-operator model that routed every company's
payroll/void to the central operator, so those actions were returned to **office**
(the senior per-company role) — see `docs/CAPABILITY_MATRIX.md`. A per-company
"manager" tier between office and admin remains a future option if finer
segregation is wanted.

## Reverting the model

To make admin **per-company** again: remove the `callerIsPlatformOperator()` clause
from `db.assertJobCompany` and the `server/tenantGuards.ts` checks, drop the
`role !== 'admin'` bypasses in `attachmentRouters` / `entityRouters`, and scope
`company.list` to the caller's company. The `actorScope` middleware + `actorContext`
module can stay (harmless when nothing reads the actor).

## Tests

`server/authorization.test.ts` locks in both directions: office/technician get
`FORBIDDEN` cross-company (incl. at guard-protected `invoice.get` and the
`attachment`/`company` bypass sites), while `admin` is allowed through the same
paths — proving the async-local bypass reaches the guards via `createCaller`.
