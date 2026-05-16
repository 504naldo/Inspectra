# Company Settings Audit

## Status: Partially Complete — gaps found and addressed

---

## Existing Implementation (already shipped)

### Schema (`drizzle/schema.ts` line 1526)
Table `company_settings`, one row per company (unique on `companyId`):

| Field | Type | Default |
|---|---|---|
| gstRate | DECIMAL(5,4) | 0.0500 |
| pstRate | DECIMAL(5,4) | 0.0700 |
| technicianLabourRate | DECIMAL(8,2) | 75.00 |
| fitterLabourRate | DECIMAL(8,2) | 65.00 |
| quoteValidityDays | INT | 30 |
| defaultQuoteTerms | TEXT | null |
| invoiceDueDays | INT | 30 |
| defaultInvoiceTerms | TEXT | null |
| invoiceNumberPrefix | VARCHAR(20) | INV |
| repairQuoteNumberPrefix | VARCHAR(20) | RQ |
| sageDefaultGlCode | VARCHAR(50) | null |
| sageDefaultDepartment | VARCHAR(50) | null |
| reportFooterText | TEXT | null |

### Backend
- `getCompanySettings(companyId)` — returns row or defaults (`server/db.ts:2333`)
- `upsertCompanySettings(companyId, data)` — INSERT ... ON DUPLICATE KEY UPDATE (`server/db.ts:2342`)
- `companySettingsRouter` with `get` (officeProcedure) and `update` (adminProcedure) (`server/routers/companySettingsRouter.ts`)
- Registered as `companySettings` in appRouter (`server/routers.ts:114`)

### Frontend
- `CompanySettings.tsx` — 5-tab UI: Tax | Labour & Quotes | Invoices | Sage Export | Reports
- Route: `/admin/settings` (ProtectedRoute, admin+office)
- Nav: "Settings" in secondary nav (AdminLayout.tsx)

### Already wired into modules
| Module | Setting Used |
|---|---|
| `invoiceRouter.create` | `invoiceNumberPrefix` for auto-generated invoice number |
| `repairQuoteRouter.createRepairQuote` | `repairQuoteNumberPrefix`, `quoteValidityDays` |
| `NewRepairQuote.tsx` | Seeds `technicianLabourRate`, `fitterLabourRate`, `quoteValidityDays` into form |
| `InvoiceDetail.tsx` | `sageDefaultGlCode`, `sageDefaultDepartment` displayed in Sage export panel |

---

## Gaps Found and Fixed

### 1. Missing schema fields
**Added** (`drizzle/migrations/0047_company_settings_extended.sql`):
- `companyDisplayName` VARCHAR(255) — company profile/branding
- `logoUrl` VARCHAR(500) — URL for company logo in reports
- `defaultFuelCharge` DECIMAL(8,2) DEFAULT 0.00 — default per-item fuel charge for repair quotes
- `sageCustomerCodeDefault` VARCHAR(50) — default Sage customer code for new invoices
- `sageTaxCodeDefault` VARCHAR(50) — default Sage tax code

### 2. `approvedWorkRouter.createInvoice` used hardcoded values
**Before:**
```ts
invoiceNumber: `INV-${now.getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-4)}`
dueDate: now + 30 days (hardcoded)
taxRate: "0"
```
**After:** Reads `getCompanySettings` and uses `invoiceNumberPrefix`, `invoiceDueDays`, `gstRate`, `sageDefaultGlCode`, `sageDefaultDepartment`, `sageCustomerCodeDefault`.

### 3. `repairQuoteRouter.createRepairQuote` hardcoded `fuelCharge: "0"`
**After:** Uses `settings.defaultFuelCharge ?? "0"` for items seeded from deficiencies.

### 4. `invoiceRouter.create` didn't seed due date or tax rate from settings
**After:** When `dueDate` or `taxRate` are not supplied by the caller, they are derived from settings.

---

## Completion Plan (already executed)

1. ✅ Migration `0047_company_settings_extended.sql`
2. ✅ `drizzle/schema.ts` — new columns added to companySettings table
3. ✅ `server/db.ts` — DEFAULT_COMPANY_SETTINGS extended
4. ✅ `server/routers/companySettingsRouter.ts` — new fields in schema + update handler
5. ✅ `server/routers/approvedWorkRouter.ts` — reads settings for invoice creation
6. ✅ `server/routers/repairQuoteRouter.ts` — uses defaultFuelCharge for new items
7. ✅ `server/routers/invoiceRouter.ts` — seeds dueDate and taxRate from settings
8. ✅ `client/src/pages/admin/CompanySettings.tsx` — Company Profile tab added, Sage tab extended

---

## Fields NOT Added (deferred)

| Field | Reason |
|---|---|
| `primaryColor`, `accentColor` | No report/PDF renderer currently reads theme colors |
| `quoteNumberPrefix` | Building quote numbering not tracked in DB currently |
| `workOrderNumberPrefix` | Work orders don't generate sequential numbers |
| `nextInvoiceNumber` etc. | Existing timestamp-based ID avoids race conditions; counters add complexity |
| `minimumLabourHours` | No billing enforcement module exists yet |
| `sageExportFormat` | Sage export currently outputs a single fixed CSV format |
