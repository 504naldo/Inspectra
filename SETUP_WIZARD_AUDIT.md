# Setup Wizard Audit — Inspectra v1

## Existing Company Settings Support

**Schema:** `company_settings` table (migration 0043 or earlier), one row per company with a UNIQUE constraint on companyId.

**Fields available:**
- `companyDisplayName` — display name (separate from `companies.name`)
- `logoUrl` — logo image URL
- `gstRate`, `pstRate` — tax rates (decimal, defaults: 5%, 7%)
- `technicianLabourRate`, `fitterLabourRate`, `defaultFuelCharge` — labour rates (decimal)
- `quoteValidityDays` — integer, default 30
- `defaultQuoteTerms` — text
- `invoiceDueDays` — integer, default 30
- `defaultInvoiceTerms` — text
- `invoiceNumberPrefix` — varchar, default "INV"
- `repairQuoteNumberPrefix` — varchar, default "RQ"
- `sageDefaultGlCode`, `sageDefaultDepartment`, `sageCustomerCodeDefault`, `sageTaxCodeDefault` — Sage export settings
- `reportFooterText` — text

**`companies` table** — separate from settings, has: `name`, `logo`, `address`, `phone`, `email`, `emailDomain`

**Router:** `companySettingsRouter` — `get` (officeProcedure) and `update` (adminProcedure). Upserts via `INSERT ... ON DUPLICATE KEY UPDATE`.

## Existing Setup / Configuration Fields

The existing `CompanySettings.tsx` page has 6 tabs covering all settings fields. No guided setup flow or completeness tracking exists.

## Existing Import Tools

**`importLogs` table** — tracks imports by company, type (devices/sites/areas/customers), status (pending/validating/importing/completed/failed/partial).

**`importCenterRouter`** — handles CSV/Excel file imports with validation and preview.

**DB functions:** `getImportLogsByCompany(companyId, limit)`, `getPartsCatalogByCompany(companyId)`.

## Existing Data Quality Checks

**`dataQualityRouter.ts`** — `getSummary` (officeProcedure) runs queries for:
- Sites missing buildingId, fileNumber, address, city, contactInfo
- Duplicate buildingIds and fileNumbers
- CustomerOrgs missing contactEmail, contactPhone
- WorkSiteInfo: sites missing access notes, panel location, monitoring info
- Schedule: overdue items without technician
- Devices without location
- Open deficiencies > 30/90 days
- ApprovedWork without invoice/scheduled date
- Invoices with zero total or no line items

## Existing User / Role Setup

**`users` table** — role enum: admin, office, technician, customer; `isActive` tinyint.

**`userRouter`** — `listUsers`, `createUser`, `updateUser`, `deleteUser`, `mergeUsers` — all `adminProcedure`.

**`AdminUsers.tsx`** — existing page for managing users with role editing.

## Missing Setup Pieces Before This Release

1. No guided step-by-step setup wizard
2. No setup progress tracking per company
3. No "setup complete" indicator
4. No dashboard prompt to complete setup
5. No centralized checklist linking all setup areas

## Recommended Implementation

- Add `setup_progress` table (lightweight, one row per company + step key)
- Add `setupRouter` with overview query (parallel counts + auto-completeness) and step status mutation
- Add `SetupWizard.tsx` — card-per-step layout with auto-detected completeness + manual mark complete/skip
- Dashboard integration — small banner showing progress when not complete
- Nav item in Tools group

## What Was Not Built

- No forced onboarding flow (setup is optional/guidance only)
- No email verification step
- No billing/subscription setup
- No auto-import or auto-configuration
- No per-user or per-module blocking based on setup completion
