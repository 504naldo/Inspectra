# Inspectra — Workflow QA & Hardening Report
**Date:** 2026-05-14  
**Scope:** End-to-end QA pass on Repair Quote → Approved Work → Work Order → Invoice → Sage export

---

## Bugs Found and Fixed

### Bug 1 (HIGH) — Dashboard "Invoices for Export" card navigated to wrong page
**File:** `client/src/pages/admin/Dashboard.tsx` line 242  
**Problem:** `SnapshotCard` for "Invoices for Export" had `href="/admin/work-orders"`. Clicking it opened the Work Orders list, not Invoices.  
**Fix:** Changed to `href="/admin/invoices"`.

---

### Bug 2 (HIGH) — Dashboard "Invoices / Sage Prep" panel "View all" link was wrong
**File:** `client/src/pages/admin/Dashboard.tsx` line 393  
**Problem:** The "View all" button inside the Invoices / Sage Prep card pointed to `/admin/work-orders`.  
**Fix:** Changed to `href="/admin/invoices"`.

---

### Bug 3 (MEDIUM) — "View Invoice" button in ApprovedWorkDetail navigated to list, not specific invoice
**Files:**
- `server/routers/approvedWorkRouter.ts` — `get` procedure
- `client/src/pages/admin/ApprovedWorkDetail.tsx`

**Problem:** The "View Invoice" button called `navigate('/admin/invoices')` (the list), not the detail page for the specific invoice. The `approvedWork.get` response did not include an `invoiceId` field, so there was no way to navigate directly to the invoice.

**Fix — Server:** Added `db.getInvoiceByApprovedWork(record.id)` to the parallel fetch in `approvedWorkRouter.get` and added `invoiceId: linkedInvoice?.id ?? null` to the returned object.

**Fix — Client:** Updated the "View Invoice" `onClick` to:
```tsx
navigate(record.invoiceId ? `/admin/invoices/${record.invoiceId}` : `/admin/invoices`)
```
Falls back to list if no invoice record exists (manual `markInvoiced` path).

---

### Bug 4 (MEDIUM) — createInvoice could succeed if AW was manually marked invoiced first
**File:** `server/routers/approvedWorkRouter.ts` — `createInvoice` mutation

**Problem:** The `markInvoiced` mutation sets `record.invoiceNumber` on an Approved Work record without creating an invoice row. If an office user then clicked "Create Invoice", the existing `getInvoiceByApprovedWork` dedup check passed (no invoice row), so a new invoice would be created — even though the AW already had an invoice number from manual entry.

**Fix:** Added an early guard before the DB dedup check:
```typescript
if (record.invoiceNumber) {
  throw new TRPCError({
    code: "CONFLICT",
    message: "This Approved Work record already has an invoice number recorded. Use the existing invoice or void it before creating a new one.",
  });
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/pages/admin/Dashboard.tsx` | Fixed 2 wrong hrefs (work-orders → invoices) |
| `server/routers/approvedWorkRouter.ts` | Added `invoiceId` to `get` response; added `invoiceNumber` guard in `createInvoice` |
| `client/src/pages/admin/ApprovedWorkDetail.tsx` | "View Invoice" navigates to specific invoice detail page |

---

## Pre-existing Issues (Out of Scope, Not Fixed)

| Issue | Location | Notes |
|-------|----------|-------|
| `companyId` not validated against `ctx.user.companyId` in `workOrderRouter.listByCompany` | `server/routers/workOrderRouter.ts` | Caller-supplied companyId could be any company. Pre-existing; out of scope for this pass. |

---

## TypeScript Check

`pnpm check` reports only pre-existing environment errors (`@types/node` and `vite/client` type definitions not installed in the dev container; deprecated `baseUrl` in tsconfig). No new type errors were introduced by these fixes.

---

## Workflow Chain Status (Post-QA)

```
Deficiency found on inspection
    ↓
Repair Quote created (from job, pre-populated from deficiencies)
    ↓ [office sends]
Quote accepted (customer token or office)
    ↓ [auto]
Approved Work created (status: approved)
    ↓ [office schedules]
Work Order created or linked (from ApprovedWork detail page)
    ↓ [technician completes work]
Approved Work marked completed
    ↓ [office clicks "Create Invoice"]
Invoice created (status: draft, line items snapshotted from quote)    ← dedup: invoiceNumber guard + DB check
    ↓ [office reviews → "Mark Sent"]
Invoice sent to customer
    ↓ [payment received → "Record Payment"]
Invoice marked paid
    ↓ [accounting → "Export Sage CSV"]
CSV downloaded for Sage import → sageExportedAt set
```

Every step is reachable from the UI with correct navigation throughout.
