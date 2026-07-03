# Core Operational Workflow — Validation

**Date:** 2026-06-30 · **Status:** active

The authoritative technician→invoice path, the records created at each stage, the
status transitions, idempotency expectations, known manual steps, and a manual
smoke-test checklist. Trace is evidence-based from the routers; automated coverage
for the high-risk conversions is noted inline.

## Workflow

```
Customer Record → Customer Org → Site → Work Site Info → Contact
  → Job → Assignment → Technician inspection → Device/template result
  → Deficiency/photo → Time entry → Offline sync → Submit for QA
  → Report QA → PDF → Repair quote → Approval → Approved Work
  → Work Order → Completion → Invoice
```

## Records created per stage

| Stage | Table(s) | Key links | Scope |
|---|---|---|---|
| Customer Org | `customer_orgs` | `companyId` | company |
| Site / Work Site Info | `sites`, `site_work_site_info` | `companyId`, `customerOrgId` | company |
| Contact | `customer_contacts` | `customerOrgId` | company |
| Job | `jobs` | `companyId`, `siteId`, `customerOrgId` | company |
| Assignment | `job_assignments` | `jobId`, `userId`, `companyId` | company + tech |
| Inspection result | `inspection_results` / template responses | `jobId`, `deviceId`, `companyId` | company |
| Deficiency / photo | `deficiencies`, `attachments` | `jobId`; attachment parent ref | company |
| Time entry | `payroll_time_entries` / `time_entries` | `jobId`, `userId` | company |
| Report | `reports` | `jobId` | company |
| Repair quote | `quotes`, `repair_quote_items` | `companyId`, `jobId`, `deficiencyId` | company |
| Approved Work | `approved_work` | `companyId`, `quoteId`, `jobId` | company |
| Work Order | `work_orders` | `companyId`, `jobId`, `quoteId` | company |
| Invoice | `invoices`, `invoice_line_items` | `companyId`, `approvedWorkId`/`quoteId` | company |

## Status transitions (validated)

- **Jobs / inspection data:** writes blocked once a job is finalized
  (`assertJobNotFinalized`); finalization produces a SHA-256 hash.
- **Quotes:** `draft → sent → viewed → approved/accepted → converted_to_approved_work`
  (enum + approval metadata).
- **Approved Work:** 14-state machine ending `invoiced`/`closed`.
- **Invoices:** `ALLOWED_TRANSITIONS` table; terminal `paid`/`void`; `exported` lock.
  Terminal/edit-lock hardened in `invoiceRouter` (see `invoiceIntegrity.test.ts`).

## Idempotency / duplicate protection (validated)

| Conversion | Guard | Test |
|---|---|---|
| Approved Work → Invoice | `createInvoice` rejects if `invoiceNumber` set or an invoice already exists for the AW (`CONFLICT`) | `invoiceWorkflow.test.ts` ("blocks a second invoice") |
| Quote → Work Order | `getWorkOrderByJob` updates existing rather than duplicating | code path in `_createWorkOrderFromQuote` |
| Approved Work → Work Order | one WO per AW (`CONFLICT` if `workOrderId` set) | `approvedWorkRouter.createWorkOrder` |
| Invoice mark paid | atomic eligibility-guarded update; double-apply → `CONFLICT` | `invoiceIntegrity.test.ts` |
| Parts/Inventory import | dedup on category+name / category+sku | `partsInventoryImport.test.ts` |

## Activity events

Major transitions write `logActivity` entries (job lifecycle, AW→invoice
`converted`, invoice `paid`/`voided`/`exported`/`status_changed`, line-item edits).

## Known manual steps / gaps

- **Report email delivery** — generated PDFs are sent via the Send Center / Gmail
  path; not fully automated end-to-end (see roadmap).
- **Sage** — CSV export only; kept as a separate system by product decision.
- **Full end-to-end automated test** across all ~18 stages is **not** present (the
  chain spans many modules and heavyweight fixtures). High-risk *conversions* are
  individually tested (table above). Recommended follow-up: one happy-path
  integration test stitching Job→…→Invoice with a shared company fixture.

## Manual smoke-test checklist

1. Create customer org → site → work-site-info → contact.
2. Create job; assign technician.
3. As technician: open assigned job, record a device/template result, add a
   deficiency + photo, add a time entry.
4. Go offline; repeat a device test; reconnect; confirm sync shows **synced only
   after** server confirmation; retry once and confirm no duplicate server record.
5. Submit for QA; confirm failed-critical items surface before submission.
6. Office: Report QA → generate PDF → confirm it opens.
7. Create repair quote from deficiency; send; accept.
8. Confirm Approved Work created (not duplicated on repeat accept).
9. Create Work Order; mark completion.
10. Create Invoice from Approved Work; confirm line items snapshotted; confirm a
    second create is rejected.
11. Mark paid in full; confirm total recalculated; confirm a second mark-paid is
    rejected; confirm line items are locked.
12. Trace the invoice back to the originating job/deficiency via links.

Document anything that cannot be verified in the current environment.
