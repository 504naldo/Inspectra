# Capability Matrix — sensitive actions (PR-10)

**Date:** 2026-07-03 · **Status:** active — enforced server-side + covered by tests

Inspectra's roles are `admin`, `office`, `technician`, `customer`. `admin` is the
cross-company **platform operator** (see `docs/ROLE_TRUST_MODEL.md`); `office` is the
senior **per-company** role.

The most sensitive money- and payroll-movement actions are held by **office** (and
`admin`, which is a superset of office access), and are NOT available to technicians
or customers. Payroll approval additionally can't be applied to the approver's own
entry (segregation of duties).

> **History:** PR-10 briefly made these **admin-only**, to add an office-vs-senior
> separation. But once `admin` became the cross-company platform operator, admin-only
> routed *every* company's payroll approvals and invoice voids to the central
> operator — not a per-company workflow. They were therefore returned to `office`.
> If a per-company "senior/manager" tier is wanted later, add a `manager` role and
> gate these to `manager`+`admin` (a schema/enum + UI change).

## Decision

| Action | Procedure | Holder | Rationale |
|--------|-----------|--------|-----------|
| Payroll: approve / reject | `payrollHours.approve`, `.reject` | office (+admin) | Per-company coordination; approver can't approve their own entry. |
| Payroll: bulk approve / reject | `payrollHours.bulkApprove`, `.bulkReject` | office (+admin) | Same, at scale. |
| Payroll: mark exported / export data | `payrollHours.markExported`, `.exportData` | office (+admin) | The payroll run is a per-company office function. |
| Payroll: view / summaries / admin notes | `payrollHours.listCompany`, `.getSummary`, `.getReviewSummary`, `.getMissingHoursSummary`, `.setAdminNotes` | office (+admin) | Coordination + annotation. |
| Payroll: submit own hours | `payrollHours.create/update/submit` | technician+ | Employees log their own time. |
| Invoice: void | `invoice.void` | office (+admin) | Destructive, but a normal AR correction office owns. |
| Invoice: Sage export | `invoice.exportSage`, `.markReadyForSageExport`, `.markExportedToSage` | office (+admin) | Accounting export is an office bookkeeping function. |
| Invoice: create / edit / mark paid / send | `invoice.create`, `.update`, `.markPaid`, `.send` | office (+admin) | Normal AR workflow. |
| Company settings update | `companySettings.update` | admin | Company-level config. |
| User role management | `dashboard.updateRole`, `accessControl.getUsers` | admin | Identity/role administration. |

## Enforcement (server-side — the boundary)

- `server/routers/payrollHoursRouter.ts` — approve / reject / bulkApprove /
  bulkReject / markExported / exportData use `officeProcedure`; `approve`/`bulkApprove`
  additionally reject self-approval.
- `server/routers/invoiceRouter.ts` — `void`, `exportSage`, `markReadyForSageExport`,
  `markExportedToSage` use `officeProcedure`. `updateStatus` transitions (incl. to
  `"void"`) are `officeProcedure` too.

Technicians/customers are blocked because `officeProcedure` admits only `office` and
`admin`.

## Tests

`server/capabilityEnforcement.test.ts` (7) asserts office can void / Sage-export /
approve payroll / bulk / export, that a **technician** cannot, and that the payroll
**self-approval** block still holds.
