# Capability Matrix — sensitive actions (PR-10)

**Date:** 2026-07-02 · **Status:** active — enforced server-side + covered by tests

Inspectra's roles are `admin`, `office`, `technician`, `customer`. Historically
`officeProcedure` and `adminOrOfficeProcedure` were identical (admin **or** office),
so every "office" action was equally available to admins and to all office users,
with no separation for the most sensitive money- and payroll-movement actions.

This matrix records which of those actions are now **admin-only**, why, and where
each is enforced. Enforcement is server-side (the security boundary); client controls
are additionally hidden from office users so they don't see buttons that would 403.

## Decision

| Action | Procedure | Before | After | Rationale |
|--------|-----------|--------|-------|-----------|
| Payroll: approve / reject | `payrollHours.approve`, `.reject` | office+admin | **admin** | Approving pay is a management/segregation-of-duties action. (Self-approval was already blocked.) |
| Payroll: bulk approve / reject | `payrollHours.bulkApprove`, `.bulkReject` | office+admin | **admin** | Same as above, at scale. |
| Payroll: mark exported / export data | `payrollHours.markExported`, `.exportData` | office+admin | **admin** | The payroll run (money leaving to payroll) is admin-controlled. |
| Payroll: view / summaries | `payrollHours.listCompany`, `.getSummary`, `.getReviewSummary`, `.getMissingHoursSummary` | office+admin | office+admin (unchanged) | Office needs visibility to coordinate. |
| Payroll: set admin notes | `payrollHours.setAdminNotes` | office+admin | office+admin (unchanged) | Non-financial annotation. |
| Payroll: submit own hours | `payrollHours.create/update/submit` | technician+ | technician+ (unchanged) | Employees log their own time. |
| Invoice: void | `invoice.void` | office+admin | **admin** | Voiding is destructive and accounting-final. |
| Invoice: Sage export | `invoice.exportSage`, `.markReadyForSageExport`, `.markExportedToSage` | office+admin | **admin** | Accounting-system sync must not desync from uncontrolled edits. |
| Invoice: create / edit / mark paid / send | `invoice.create`, `.update`, `.markPaid`, `.send` | office+admin | office+admin (unchanged) | Normal AR workflow office owns. |
| Company settings update | `companySettings.update` | admin | admin (unchanged) | Already admin-only. |
| User role management | `dashboard.updateRole`, `accessControl.getUsers` | admin | admin (unchanged) | Already admin-only. |

## Enforcement points (server-side)

- `server/routers/payrollHoursRouter.ts` — the six payroll actions above use
  `adminProcedure`.
- `server/routers/invoiceRouter.ts` — `void`, `exportSage`, `markReadyForSageExport`,
  `markExportedToSage` use `adminProcedure`.
- `server/routers/invoiceRouter.ts` `updateStatus` — additionally rejects a transition
  to `"void"` for non-admins, closing the bypass where office could void an invoice
  through the generic status-transition path instead of the dedicated `void` action.

## Client (defense-in-depth, not the boundary)

Office users are on the same admin pages, so the now-admin-only controls are hidden
for them (`user?.role === "admin"` gate):
- `InvoiceDetail.tsx` — Void, Export Sage CSV, Mark Exported buttons.
- `PayrollReview.tsx` / `PayrollHours.tsx` — per-row Approve/Reject, bulk approve/reject,
  Mark Exported, and CSV/export controls; the `exportData` query is also skipped for
  non-admins. Office retains view, summaries, and the admin-notes control.

## Tests

`server/capabilityEnforcement.test.ts` (7) asserts office callers get `FORBIDDEN` on
every gated action (including the `updateStatus`→void bypass) and that admin callers
pass the role gate, while office keeps its allowed actions (invoice create/markPaid,
payroll view).
