# Customer-Facing Report Privacy

**Date:** 2026-07-02 · **Status:** active — central allow-list sanitizer + regression test in place (PR-12 closed)

Defines what may and may not appear in customer-facing PDFs/reports, the current
sanitization boundary, the report types reviewed, and remaining limitations.

## Current boundary (evidence)

Customer-facing PDF generators do **not** receive raw database rows. Each consumes a
narrow, explicitly-typed data structure assembled by the router before rendering:

- `invoicePdfGenerator.ts` → `InvoicePdfData`
- `pdfGeneratorFirePro.ts`, `pdfGeneratorCompliance.ts` → typed report data
- `quotePdfGenerator.ts` → typed quote data

A repo scan of these generators found **no** references to internal-only fields
(office/technician notes, monitoring/lockbox/panel codes, wage/rate/margin data, AI
prompts/system messages, storage keys, integration metadata). The typed interface is
therefore the de-facto sanitization boundary today.

## Allowed (customer-safe) fields

Company/site identity, report/quote/invoice numbers and dates, device inventory and
inspection result status (pass/fail/NA), deficiency descriptions intended for the
customer, customer-facing corrective actions, customer-facing line items and totals,
approved technician name + cert label, signatures captured for the customer copy.

## Prohibited (internal-only) fields — must never appear

- Internal office notes / technician-only notes / internal QA comments
- Site access codes, monitoring passwords, panel passcodes, lockbox codes
- Raw AI prompts / AI system messages
- Payroll records, technician wage/rate data, job costing, internal quote margins
- Internal file paths, storage keys, integration metadata, hidden admin-only fields
- Unapproved draft text

## Report types reviewed

Annual / compliance reports (Fire-Pro, CAN/ULC-S536), deficiency reports, repair
quote PDFs, invoice PDFs, customer-portal report access, Document Center, Send Center.

## Remaining limitations / follow-up (tracked as PR-12)

1. ✅ **Centralized allow-list serializers** — `server/customerSafeReport.ts` holds
   one exclude-by-default serializer per customer-facing report shape. Each copies
   only enumerated customer-safe fields into a fresh object, so any field not on the
   allow-list (including new ones) is dropped by default rather than included by
   default. All customer-facing PDF paths now route their assembled data through one
   before rendering:
   - `buildCustomerSafeReportData` → `generateInspectionReportPDF` (inspection/deficiency report) — `reportRouter`
   - `buildCustomerSafeComplianceData` → `generateComplianceReportPDF` (CAN/ULC-S536) — `reportRouter`
   - `buildCustomerSafeInvoiceData` → `generateInvoicePDF` (both call sites) — `invoiceRouter`
   - `buildCustomerSafeQuoteData` → `generateQuotePDF` and `buildCustomerSafeBuildingQuoteData` → `generateBuildingQuotePDF` — `quoteRouter`
   - `buildCustomerSafeRepairQuoteData` → `generateRepairQuotePDF` (both call sites) — `repairQuoteRouter`
2. ✅ **Regression test** — `server/customerSafeReport.test.ts` seeds internal-only
   fields (wages, monitoring passwords, panel passcodes, internal/office notes, AI
   prompts, storage keys, access tokens, job-costing margins, payroll codes) at every
   nesting level of each shape and asserts, via the `findProhibitedFields` deep scan,
   that none survive sanitization — while the customer-safe fields the PDFs render
   (photo buffers, monitoring-centre *name*, billed labour rates on repair quotes,
   totals, line items) are preserved.
3. **Note on billed rates**: repair/building quotes intentionally show *billed*
   labour rates and hours to the customer (that's the quote). Those are customer-safe
   and preserved; only internal cost/margin/wage/payroll fields are prohibited.
