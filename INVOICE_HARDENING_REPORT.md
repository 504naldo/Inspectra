# Invoice Module — Hardening Report
**Date:** 2026-05-15  
**Scope:** Edit-lock rules, status transitions, Sage export integrity, UI locking

---

## 1. Edit-Lock Rules

An invoice is **locked** (immutable) when any of the following is true:

| Condition | Reason |
|-----------|--------|
| `status === "paid"` | Payment is final; changing amounts would break reconciliation |
| `status === "void"` | Voided invoices are accounting records; they cannot be changed |
| `sageExportStatus === "exported"` | Invoice has been sent to Sage; edits would desync the books |

### Helper: `isInvoiceLocked(inv)`
Defined in `server/routers/invoiceRouter.ts`. Returns `true` if any of the above conditions hold.

### `lockMessage(inv)`
Returns a human-readable reason used in both API error messages and the UI banner.

### Blocked actions for locked invoices (backend + frontend)
- Edit invoice header (bill-to, dates, Sage codes)
- Add line item
- Edit line item
- Remove line item
- Record payment (blocks on void, paid, or Sage-exported)
- Void invoice (blocks on paid or Sage-exported)
- Status transitions out of paid/void

### Allowed actions for locked invoices
- View invoice and all details
- Download / re-export Sage CSV (export always allowed except on voided)
- Mark Exported to Sage (useful for invoices exported outside the app)

---

## 2. Status Transition Rules

Implemented as a server-side transition table in `invoiceRouter.updateStatus`:

```
draft    → sent, void
sent     → viewed, approved, void, overdue
viewed   → approved, void, overdue
approved → paid, partial, void
partial  → paid, void
overdue  → paid, partial, void
paid     → (terminal — no transitions allowed)
void     → (terminal — no transitions allowed)
```

Any transition not in this table returns `BAD_REQUEST: "Cannot transition invoice from X to Y"`.

---

## 3. Sage Export Validation

Enforced in `invoiceRouter.exportSage` before writing any CSV rows:

| Check | Action on failure |
|-------|-------------------|
| Invoice belongs to current company | Silently skip (cross-company guard) |
| Invoice is not void | `BAD_REQUEST` — stops entire export |
| Invoice has ≥1 line item OR non-zero total | `BAD_REQUEST` — stops entire export |
| Invoice number exists | Always true by construction |

### CSV Integrity
- Added `csvCell()` helper that wraps any field containing commas, double-quotes, or newlines in double-quotes, doubling internal quotes per RFC 4180.
- **Previously:** only `billToName` was quoted.
- **Now:** all string fields are escaped: `invoiceNumber`, `sageCustomerCode`, `sageGlCode`, `sageDepartment`, `billToName`, `billToEmail`, `billToAddress`, `status`.
- Added `billToEmail` and `billToAddress` to the export columns.

### Export Atomicity
- **Previously:** each invoice was marked `sageExportStatus = "exported"` inside the loop, so a failure mid-export could leave some invoices marked and others not.
- **Now:** all invoices are validated and rows are built first; `sageExportStatus` updates happen only after all rows are successfully generated.

---

## 4. Additional Mutation Guards

| Mutation | Guards added |
|----------|-------------|
| `update` | Locked invoices (paid / void / Sage-exported) |
| `addLineItem` | Locked invoices |
| `updateLineItem` | Locked invoices |
| `removeLineItem` | Locked invoices |
| `updateStatus` | Full transition table validation |
| `markPaid` | void, already-paid, Sage-exported |
| `void` | already-void, paid, Sage-exported |
| `markReadyForSageExport` | void |
| `markExportedToSage` | void |

---

## 5. UI Locking Behavior

In `InvoiceDetail.tsx`:

- **Lock banner** appears at the top when `isLocked` is true, showing the specific reason (voided / paid / Sage-exported). Color: amber.
- **Edit Header button** hidden when `isLocked`.
- **Add Item button** hidden when `isLocked`.
- **Line item edit/delete controls** hidden when `isLocked`.
- **Record Payment button** hidden when void, paid, or Sage-exported.
- **Void button** hidden when void, paid, or Sage-exported (previously only blocked on void/paid).
- **Mark Exported button** hidden when already `sageExportStatus === "exported"` or void.
- **Export Sage CSV** always visible unless voided (unchanged).

### Sage filter fix in `Invoices.tsx`
- Changed `sageFilter` initial state from `""` to `"all"` — an empty string value is not supported by radix-ui Select and caused the "All" option to be unselectable after choosing a filter.
- `SelectItem value=""` changed to `value="all"`.

---

## 6. Files Changed

| File | Changes |
|------|---------|
| `server/routers/invoiceRouter.ts` | `isInvoiceLocked`, `lockMessage`, `ALLOWED_TRANSITIONS`, `csvCell` helpers; lock guards on all edit mutations; transition validation on `updateStatus`; atomic export with pre-validation |
| `client/src/pages/admin/InvoiceDetail.tsx` | `isLocked`/`lockedReason` computed state; lock banner; `isLocked` gating on Edit/Add/line-item/Pay/Void; Void also blocked on Sage-exported |
| `client/src/pages/admin/Invoices.tsx` | Sage filter sentinel fix (`""` → `"all"`) |

---

## 7. TypeScript Check

`pnpm check` reports only the three pre-existing environment errors (`@types/node`, `vite/client`, deprecated `baseUrl`). No new application-level type errors.

---

## 8. Remaining Accounting Risks / Future Work

| Risk | Notes |
|------|-------|
| Reversing a paid invoice | No credit note or payment reversal workflow exists. Currently blocked at the UI and API. A future "Reverse Payment" workflow should create a negative adjustment invoice rather than mutating the original. |
| Reversing a Sage export | `markReadyForSageExport` can reset the status to `pending`, allowing re-export, but there is no audit log of who reset it or why. Future: add an `auditLog` table entry on reset. |
| Partial payment editing | A `partial` invoice can have additional payments recorded, which overwrites `amountPaid` without accumulating history. Future: add a `payments` table. |
| `companyId` guard on `workOrderRouter.listByCompany` | Pre-existing: caller-supplied `companyId` is not validated against `ctx.user.companyId`. Out of scope for this pass. |
