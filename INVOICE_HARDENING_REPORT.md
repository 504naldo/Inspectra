# Invoice + Sage Export Hardening Report

**Date:** 2026-05-16  
**Branch:** claude/continue-work-vt04A

---

## Summary

Surgical hardening pass across the invoice workflow. No new dependencies, no schema changes, no unrelated refactors. Six targeted fixes applied across four files.

---

## What Was Checked

| Area | File(s) | Result |
|---|---|---|
| Radix Select `value=""` crash | `Schedule.tsx`, `Invoices.tsx`, `InvoiceDetail.tsx` | Fixed in Schedule.tsx; others OK |
| Invoice list filter consistency | `Invoices.tsx` | OK — sentinel `"all"` already used |
| Sage status naming | `Invoices.tsx` | Fixed — labels updated |
| Frontend locking (paid/void/sage-exported) | `InvoiceDetail.tsx` | Already comprehensive — verified OK |
| Payment validation ($0, negative) | `InvoiceDetail.tsx`, `invoiceRouter.ts` | Fixed (frontend + backend) |
| Sage CSV export UX | `InvoiceDetail.tsx`, `invoiceRouter.ts` | Error message fix applied; backend already marks exported only on success |
| Dashboard invoice/Sage links | `Dashboard.tsx` | Verified correct — no stale links |
| Approved Work → invoice navigation | `ApprovedWorkDetail.tsx` | Duplicate-create guard tightened |
| Type safety (`as any`) | invoice-related files | No easy removals without larger refactors |
| `pnpm check` | whole project | Pre-existing errors only (node/vite types); no new errors |

---

## Bugs Found & Fixes Applied

### 1. Radix Select empty-string crash — `Schedule.tsx:508`
**Problem:** `<SelectItem value="">Unassigned</SelectItem>` — Radix UI throws on empty-string values at runtime.  
**Fix:** Changed to sentinel `"__unassigned__"` with bidirectional conversion in `onValueChange`. Submit handler already mapped falsy `leadTechId` to `undefined` — still correct.

### 2. Sage filter/badge naming — `Invoices.tsx`
**Problem:** Dropdown labels were inconsistent (`"Pending export"`, `"Exported"`), and list badges used abbreviated or incorrect text (`"Sage ✓"`, missing pending badge, `"Sage Error"`).  
**Fix:**
- Dropdown: `"Ready for export"`, `"Exported to Sage"`, `"Export error"`
- Badges: `"Sage Exported"` (emerald), `"Ready for Export"` (amber), `"Export Error"` (red)

### 3. Sage export error message swallowed — `InvoiceDetail.tsx`
**Problem:** `onError: () => toast.error("Export failed")` discarded the backend's descriptive error message.  
**Fix:** `onError: (e) => toast.error(e.message || "Sage export failed")`

### 4. $0 payment allowed — `InvoiceDetail.tsx` + `invoiceRouter.ts`
**Problem:** Frontend only blocked empty string (`!amount`); backend used `z.number().min(0)` allowing $0.  
**Fix:**
- Frontend: `disabled={markPaid.isPending || !amount || parseFloat(amount) <= 0}`
- Backend: `amountPaid: z.number().positive()` (requires > 0)

### 5. Duplicate invoice creation — `ApprovedWorkDetail.tsx:600`
**Problem:** "Create Invoice" button only checked `!record.invoiceNumber`. An invoice could exist with its ID stored on the record but `invoiceNumber` not yet populated, allowing a second invoice to be created.  
**Fix:** `{!isClosed && !record.invoiceNumber && !record.invoiceId && (`

### 6. Duplicate declarations in `invoiceRouter.ts` (previous session)
**Problem:** `isInvoiceLocked`, `lockMessage`, `ALLOWED_TRANSITIONS`, `csvCell` each declared twice — esbuild rejected the file as invalid ES module, causing two consecutive Railway deployment failures.  
**Fix:** Removed duplicate declarations (commit `ee25ede`).

---

## Already Correct — No Action Needed

- **Invoice locking:** `isLocked = isVoid || isPaid || isSageExported` — all edit/delete/void/payment controls gated on it.
- **Sage export backend:** Blocks void invoices, empty invoices, marks `exported` only after CSV is successfully built.
- **Dashboard links:** All invoice/Sage widgets link to `/admin/invoices`.
- **Approved Work navigation:** `createInvoiceMut.onSuccess` navigates to new invoice detail; "View Invoice" button uses existing `invoiceId`.
- **Filter sentinel:** `sageFilter` starts `"all"`, maps to `undefined` in query. `TABS` uses `<button>`, not `SelectItem` — safe.

---

## Remaining Risks

| Risk | Severity | Notes |
|---|---|---|
| Sage export is append-only — re-exporting re-marks as `exported` | Low | No live Sage integration yet; UI blocks re-export when already `exported` |
| `as any` casts in Drizzle numeric columns (`amountPaid`, `balanceDue`, etc.) | Low | Safe — values are string-typed in DB, cast for Drizzle compat. Larger refactor needed to fix properly |
| `pnpm check` pre-existing TS errors (`node`, `vite/client` types) | Low | Pre-existing; unrelated to invoice work |

---

## Manual Test Checklist

- [ ] Create a new invoice from `/admin/invoices` — verify navigation to detail
- [ ] Create invoice from Approved Work — verify navigation to `/admin/invoices/{id}`
- [ ] Try creating invoice again from same Approved Work — button should be hidden
- [ ] Add line items; verify totals update
- [ ] Attempt to record $0 payment — button should be disabled
- [ ] Attempt to record negative payment — button should be disabled
- [ ] Record a partial payment — status becomes `partial`, balance updates
- [ ] Record full payment — status becomes `paid`, all edit controls lock
- [ ] Void an invoice — all edit controls lock, payment blocked
- [ ] Export to Sage — badge updates to "Sage Exported", all edits blocked
- [ ] Verify Sage filter dropdown shows "Ready for export" / "Exported to Sage" / "Export error"
- [ ] Verify list badges: amber "Ready for Export", emerald "Sage Exported", red "Export Error"
- [ ] Schedule page — Unassigned tech select works without crash
