# Business Rules Audit
**Date:** 2026-05-15  
**Scope:** Hardcoded business rules across the codebase that should be configurable per company

---

## 1. Findings — Hardcoded Values

| Location | Symbol | Hardcoded Value | Category |
|----------|--------|-----------------|----------|
| `server/routers/repairQuoteRouter.ts:33` | `GST_RATE` | `0.05` (5%) | Tax |
| `server/routers/repairQuoteRouter.ts:34` | `PST_RATE` | `0.07` (7%) | Tax |
| `server/routers/repairQuoteRouter.ts:173` | `techLabourRate` default | `75` | Labour |
| `server/routers/repairQuoteRouter.ts:174` | `fitterLabourRate` default | `65` | Labour |
| `server/routers/repairQuoteRouter.ts:177` | `validDays` default | `30` | Quotes |
| `server/routers/repairQuoteRouter.ts:188` | quote number format | `RQ-YYYY-NNN` | Numbering |
| `server/routers/invoiceRouter.ts:7–11` | `generateInvoiceNumber` | `INV-YYYY-XXXX` prefix | Numbering |
| `client/src/pages/admin/NewRepairQuote.tsx:24` | `techLabourRate` state | `"75"` | Labour (UI) |
| `client/src/pages/admin/NewRepairQuote.tsx:25` | `fitterLabourRate` state | `"65"` | Labour (UI) |
| `client/src/pages/admin/NewRepairQuote.tsx:26` | `validDays` state | `"30"` | Quotes (UI) |

---

## 2. What Was Centralized

A new `company_settings` table (migration `0045_company_settings.sql`) stores per-company overrides for all the values above, plus Sage export defaults and report footer text.

**Table fields:**
| Field | Default | Purpose |
|-------|---------|---------|
| `gstRate` | `0.0500` | GST rate stored for reference; not yet wired to `calcItemTotals` (see §4) |
| `pstRate` | `0.0700` | PST rate stored for reference; not yet wired to `calcItemTotals` (see §4) |
| `technicianLabourRate` | `75.00` | Pre-populates the New Repair Quote form |
| `fitterLabourRate` | `65.00` | Pre-populates the New Repair Quote form |
| `quoteValidityDays` | `30` | Pre-populates the New Repair Quote form |
| `defaultQuoteTerms` | `null` | Available for future quote PDF footer |
| `invoiceDueDays` | `30` | Available for future due-date auto-calculation |
| `defaultInvoiceTerms` | `null` | Available for future invoice PDF footer |
| `invoiceNumberPrefix` | `"INV"` | Used in `generateInvoiceNumber()` on invoice create |
| `repairQuoteNumberPrefix` | `"RQ"` | Used in `createRepairQuote` quote number generation |
| `sageDefaultGlCode` | `null` | Available for future invoice create default |
| `sageDefaultDepartment` | `null` | Available for future invoice create default |
| `reportFooterText` | `null` | Available for future PDF generator |

---

## 3. Live Connections

| Connection | File | Notes |
|------------|------|-------|
| Invoice number prefix | `server/routers/invoiceRouter.ts` | `generateInvoiceNumber(prefix)` — loads settings on `invoice.create` |
| Repair quote number prefix | `server/routers/repairQuoteRouter.ts` | `createRepairQuote` loads settings, uses `repairQuoteNumberPrefix` |
| Repair quote validity days | `server/routers/repairQuoteRouter.ts` | `effectiveValidDays` falls back to settings when not overridden |
| New Repair Quote form defaults | `client/src/pages/admin/NewRepairQuote.tsx` | `useEffect` seeds form from `trpc.companySettings.get` |

---

## 4. Deferred Connections

| Item | Reason deferred |
|------|----------------|
| **GST/PST rates in `calcItemTotals`** | `calcItemTotals` is a synchronous helper called from multiple paths. Wiring live DB rates would require making it async, touching all callers, and adding snapshots to existing line items. Existing quotes already store their computed GST/PST amounts as snapshots. Future work: pass rates through from settings at quote creation time and snapshot them into the quote header. |
| **`invoiceDueDays` auto-populate** | Invoice create form currently has a free-form due date picker. Auto-populating from settings requires a client-side date calculation. Low risk, deferred. |
| **Sage GL/department defaults on invoice create** | Invoice create form already allows manual entry. Auto-populating from settings is low-risk but deferred. |
| **`reportFooterText` in PDF generator** | PDF generator (`server/quotePdfGenerator.ts`) is a large synchronous function. Passing settings requires async pre-fetch pattern. Deferred. |
| **`defaultQuoteTerms` / `defaultInvoiceTerms` in PDFs** | Same reason as above. |

---

## 5. Access Control

| Action | Required Role |
|--------|--------------|
| Read settings | `office` or `admin` |
| Update settings | `admin` only |

---

## 6. Snapshot Safety

Settings changes apply to **new records only**. No mutation in the system re-reads settings to retroactively alter:
- Existing repair quote line items (GST/PST amounts are stored snapshots)
- Existing invoice numbers (generated at creation time)
- Existing repair quote numbers (generated at creation time)
- Existing labour rates in quote headers (stored as decimal fields on the quote row)
