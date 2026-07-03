# Role Trust Model

**Date:** 2026-07-03 · **Status:** active — describes intended behavior + the current (partial) implementation

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

## Current implementation — important caveat

The cross-company **admin** capability is **only partially wired**, and that is the
main thing to know when reasoning about this model:

- **Where admin crosses companies today** (intentional `role !== 'admin'` bypass):
  - `attachmentRouters` — `listByJob`, `listByDevice`, `get` (attachment reads).
  - `entityRouters` — `company.get` (read any company) and `company.list`
    (`adminProcedure` → `getAllCompanies()`).
- **Where admin does NOT cross companies** (the majority): every procedure that
  goes through `server/tenantGuards.ts` (`getJobForCompany`, `getInvoiceForCompany`,
  `getQuoteForCompany`, `assertSite/Device/CustomerOrg/WorkOrder/PartsCatalogItem/
  ServiceAgreement/InventoryItem/ImportLogCompany`, …). These take a `companyId`
  and throw `FORBIDDEN` on mismatch **regardless of role** — so an admin gets
  `FORBIDDEN` for another company's job/invoice/quote/etc.

So today an admin is effectively a per-company user for most data, plus cross-company
read access to attachments and company records. If the product wants admin to be a
**full** platform operator, the guards would need a role-aware bypass — a deliberate,
security-sensitive expansion that is **not** done here.

## Interaction with the capability matrix (PR-10)

`docs/CAPABILITY_MATRIX.md` makes payroll approval/export and invoice void/Sage
export **admin-only**. That was designed treating admin as the company's senior
role. Under a strict "admin = platform operator" reading, those per-company
operations would route only to the platform operator, which is likely **not**
intended. If admin is truly platform-only, revisit whether those actions should
instead belong to office (or a new per-company manager role). Flagged, not changed.

## If the model changes

- To make admin a **consistent** cross-company operator: add a role-aware bypass to
  the `tenantGuards` (e.g. skip the `companyId` check when `role === 'admin'`), and
  re-confirm every lower-role authorization test still fails closed.
- To make admin **per-company** (the alternative the code's dominant pattern already
  follows): remove the `role !== 'admin'` bypasses in `attachmentRouters` /
  `entityRouters`, and scope `company.list` to the caller's company.
