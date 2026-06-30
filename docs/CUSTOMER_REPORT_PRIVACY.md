# Customer-Facing Report Privacy

**Date:** 2026-06-30 · **Status:** active (guardrail documented; central sanitizer is a follow-up)

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

1. **No centralized `buildCustomerSafeReportData()`** — the projection is currently
   implicit in each generator's typed input. Recommended: a single allow-list
   serializer that all customer-facing renderers consume, so new fields are excluded
   by default rather than included by default.
2. **No regression test** seeds sensitive internal fields and asserts their absence
   in generated report data/text. Recommended: add such a test (assert on the
   sanitized data object; use PDF text extraction if/where supported).
3. Until (1)/(2) land, the guardrail is "generators take typed projections, not raw
   rows" — enforced by code review, not by an automated check.
