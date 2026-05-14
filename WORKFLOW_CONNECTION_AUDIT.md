# Inspectra — Workflow Connection Audit
**Date:** 2026-05-14  
**Scope:** Repair Quote → Approved Work → Work Order → Invoice → Sage export

---

## 1. What Already Worked (Before This Session)

| Handoff | Status | Notes |
|---------|--------|-------|
| Repair Quote draft → accepted | ✅ | `updateStatus(accepted)` transitions status |
| Quote accepted → Approved Work auto-created | ✅ | `_createApprovedWorkFromQuote()` called on accept |
| Quote accepted → Work Order auto-created | ✅ | `_createWorkOrderFromQuote()` called on accept |
| Customer token accept → Approved Work | ✅ | `quoteRouter.accept` creates AW (added prior session) |
| Approved Work → Create Work Order | ✅ | `approvedWork.createWorkOrder` mutation + UI |
| Approved Work → Link Work Order | ✅ | `approvedWork.linkWorkOrder` mutation + UI |
| Approved Work → Mark Invoiced (manual) | ✅ | `approvedWork.markInvoiced` records invoice # manually |
| Invoice list page | ✅ | `Invoices.tsx` page existed with full CRUD |
| Invoice create (blank) | ✅ | `invoice.create` mutation, dialog in Invoices.tsx |
| Invoice status transitions | ✅ | `invoice.updateStatus`, `markPaid`, `void` |
| Sage export CSV | ✅ | `invoice.exportSage` returns CSV string |

---

## 2. What Was Missing (Before This Session)

| Gap | Impact |
|-----|--------|
| No `/admin/invoices` route in App.tsx | Invoice list page unreachable |
| No `/admin/invoices/:id` route | Invoice detail page didn't exist |
| "Invoices" not in AdminLayout nav | No navigation entry point |
| No `approvedWork.createInvoice` mutation | Completing AW never created a real Invoice record |
| No duplicate invoice prevention from same AW | Could create multiple invoices for same work |
| No `getInvoiceByApprovedWork` db query | No way to check existing invoice for an AW |
| No Invoice detail page | Couldn't view/manage line items, status, or Sage export per invoice |

---

## 3. Handoffs Implemented This Session

### 3.1 Approved Work → Invoice (auto-create)
**Mutation:** `approvedWork.createInvoice`  
**Location:** `server/routers/approvedWorkRouter.ts`

- Validates company ownership and AW is not cancelled
- **Dedup**: calls `getInvoiceByApprovedWork(aw.id)` — throws CONFLICT if invoice already exists
- Populates bill-to from `customerOrg` (name, email, address)
- Links invoice to AW, WO, quote, job, site, customer (all available FK fields)
- Snapshots line items in priority order:
  1. Repair quote items (preferred — full part/labour detail)
  2. Work order line items (if no quote)
  3. Single summary line from `approvedScope` + `approvedAmount` (fallback)
- Sets invoice status = `draft` (office must review before sending)
- Updates AW: `invoiceNumber`, `invoicedAt`, `invoiceStatus = "draft"`, `status = "invoiced"`

### 3.2 Invoice routes added
**File:** `client/src/App.tsx`
- `/admin/invoices` → `AdminInvoices` (existing list page, now routed)
- `/admin/invoices/:id` → `InvoiceDetail` (new detail page)

### 3.3 Invoices navigation item
**File:** `client/src/components/AdminLayout.tsx`
- Added "Invoices" to secondary nav (under "More" dropdown + mobile drawer)
- Uses `FileText` icon, accessible to all office/admin roles

### 3.4 Invoice detail page
**File:** `client/src/pages/admin/InvoiceDetail.tsx` (new)
- Shows invoice header, status badge, bill-to info, dates, Sage fields
- Line items table with inline edit, add, remove
- Running totals (subtotal, tax, total, paid, balance)
- Status actions: Mark Sent, Mark Approved, Record Payment, Void
- **Sage export**: "Export Sage CSV" button triggers `invoice.exportSage` → browser download
- Linked records panel: AW, Job, Quote, WO with navigation links

### 3.5 "Create Invoice" button in ApprovedWorkDetail
**File:** `client/src/pages/admin/ApprovedWorkDetail.tsx`
- Added `createInvoiceMut` calling `approvedWork.createInvoice`
- "Create Invoice" button visible when: not closed/cancelled, no invoice yet
- On success: navigates directly to the new invoice detail page
- "Mark as Invoiced (manual)" button preserved below for backwards compatibility
- "View Invoice" link shown once AW has an invoice number

---

## 4. Duplicate Prevention Rules

| Entity | Prevention |
|--------|-----------|
| Approved Work from same quote item | `getApprovedWorkByQuoteItem(quoteItemId)` check in `createFromQuoteItem` |
| Approved Work from same quote (auto) | `getApprovedWorkByQuote(quoteId)` check in `_createApprovedWorkFromQuote` |
| Work Order from same Approved Work | `record.workOrderId` null check in `createWorkOrder` |
| Work Order link (existing) | `record.workOrderId` null check in `linkWorkOrder` |
| Invoice from same Approved Work | `getInvoiceByApprovedWork(aw.id)` check in `createInvoice` — throws CONFLICT |

---

## 5. Invoice Sage Export Approach

The `invoice.exportSage` mutation (already existed) generates a CSV file with:
```
Invoice Number, Customer Code, Invoice Date, Due Date, Total, Tax, GL Code, Department, Bill To Name, Site, Status
```

On export:
- Sets `sageExportStatus = "exported"` and `sageExportedAt = now()` on each invoice
- Returns `{ csv: string, count: number }`

In `InvoiceDetail.tsx`, clicking "Export Sage CSV" triggers the mutation and downloads the CSV via a Blob URL. The "Sage Exported" badge appears on the invoice once exported.

No live Sage API integration — CSV is the handoff point.

---

## 6. Complete Workflow Chain (Post-Implementation)

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
Invoice created (status: draft, line items snapshotted from quote)
    ↓ [office reviews → "Mark Sent"]
Invoice sent to customer
    ↓ [payment received → "Record Payment"]
Invoice marked paid
    ↓ [accounting → "Export Sage CSV"]
CSV downloaded for Sage import → sageExportedAt set
```

Every step above is now reachable from the UI without manual data entry across modules.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `server/db.ts` | Added `getInvoiceByApprovedWork(approvedWorkId)` |
| `server/routers/approvedWorkRouter.ts` | Added `createInvoice` mutation |
| `client/src/pages/admin/InvoiceDetail.tsx` | New file — invoice detail page |
| `client/src/App.tsx` | Added `/admin/invoices` and `/admin/invoices/:id` routes + imports |
| `client/src/components/AdminLayout.tsx` | Added "Invoices" to secondary nav |
| `client/src/pages/admin/ApprovedWorkDetail.tsx` | Added Create Invoice button + mutation |
