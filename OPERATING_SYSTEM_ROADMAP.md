# Inspectra — Operating System Roadmap
**Date:** 2026-05-13  
**Scope:** Product & architecture planning. No code changes in this document.

> **Reconciliation note (2026-06-28):** Several invoice-area items below were
> marked "missing/stubbed" as of 2026-05-13 but have since shipped and were
> verified by direct code read on 2026-06-28. Specifically: invoice PDF
> generation **and** email delivery (`invoicePdfGenerator.ts`,
> `invoiceRouter.generatePdf` / send-email endpoints, wired into
> `InvoiceDetail.tsx`), and Approved Work → Invoice auto-creation with line-item
> snapshotting (`approvedWorkRouter.createInvoice`). Tax handling there is
> correct: repair-quote item totals are tax-inclusive, so snapshotted lines are
> stored `taxable=false`. The remaining genuine invoice gap is the **live Sage
> API** export (CSV export exists; no API call). Inline ✅ markers below reflect
> this.

---

## 1. Current System Map

### Mature / Production-Ready
| Module | What it does | Confidence |
|--------|-------------|------------|
| **Jobs** | Full inspection lifecycle — create, assign, schedule, complete, finalize with audit lock | 95% |
| **Devices** | Asset registry by site and category (fire alarm, extinguisher, emergency light, sprinkler) | 90% |
| **Inspection Results** | Pass/fail/NA per device, technician cert snapshots, carry-forward logic | 90% |
| **Deficiencies** | Severity levels, status workflow, AI-assisted flagging, cost estimates | 90% |
| **Repair Quotes** | Line items with parts + labour + fees + tax (GST/PST), PDF, customer email/token accept | 90% |
| **Approved Work** | 14-state machine, approval source, scheduling, parts tracking, invoice linkage | 85% |
| **Work Orders** | Linked to jobs, quotes, technician assignment, estimated/actual hours | 80% |
| **Parts Catalog** | SKU, price, tax flags, labour hours, import from workbook | 85% |
| **User & Cert Management** | Roles, technician cert fields (ULC S536), Google OAuth, isActive gate | 90% |
| **Fire Alarm Module** | CAN/ULC-S536 checklist, attendance log, ancillary circuits, form header | 85% |
| **Sprinkler ITM** | NFPA 25 checklist, system-level fields, device checks | 80% |
| **Data Imports** | Excel/CSV ingestion for sites, devices, service schedule, parts catalog | 75% |
| **AI Review** | Pre-finalization quality checks, blocker/warning severity, dismissal with reason | 75% |
| **Dashboard** | Stats, recent jobs, quick actions, approved work counts | 80% |

### Partial / Working but Incomplete
| Module | What works | What's missing |
|--------|-----------|---------------|
| **Invoices** | Schema, status machine, Sage fields, line items, links to approved work/work order; ✅ PDF + email delivery; ✅ auto-creation from approved work (2026-06-28) | Live Sage **API** call (CSV export exists) |
| **Reports** | Generation framework, S3 storage, Drive stub | Email delivery, compliance report template, PDF completeness unclear |
| **Monthly Schedule** | Month-view UI, status tracking, tech assignment | Auto-job creation from schedule, calendar sync |
| **Repair Letters** | Status machine per site (not_started → completed) | Template system, connection to deficiency resolution |
| **Building Quotes** | Draft/send/accept, line items, discount | Not integrated with approved work; legacy of repair quote |

### Stubbed / Not Yet Functional
| Module | Status |
|--------|--------|
| **Sage Export** | Schema fields only (`sageCustomerCode`, `sageGlCode`, `sageExportedAt`) — no API call |
| **Gmail** | Token stored, `sendEmail` router exists — no API call implemented |
| **Google Calendar** | `linkedCalendarEventId` on jobs/schedule — no sync logic |
| **Customer Portal** | Explicitly disabled (`/customer/*` → `/forbidden`), schema ready |
| ~~**Invoice PDF**~~ | ✅ Implemented (2026-06-28) — `invoicePdfGenerator.ts`, stored to S3, downloadable + emailable from `InvoiceDetail.tsx` |
| **Offline Sync** | PWA framework and upload queue in place — service worker incomplete |

---

## 2. Missing Connection Points

### Critical (breaks operational workflows today)

**A. Completed Approved Work → Invoice** — ✅ RESOLVED (verified 2026-06-28)  
`approvedWorkRouter.createInvoice` now auto-creates the invoice, snapshots line
items (repair-quote items → work-order lines → approved-amount fallback), copies
bill-to + Sage codes, recalculates totals, and flips the approved-work status to
`invoiced` in one mutation (`ApprovedWorkDetail.tsx` "Create Invoice" button).
_Original finding (historical):_ When approved work is marked `completed` or `invoiced`, there is no mutation that auto-creates an invoice with the line items from the linked quote or work order. Office staff must create the invoice manually and then separately update the approved work status. This is the single largest gap in the revenue collection workflow.

**B. Sage Export**  
Invoice records have all the right fields (`sageCustomerCode`, `sageGlCode`, `sageDepartment`, `sageExportedAt`, `sageExportStatus`) but there is no export logic. Accounting data must be re-keyed manually into Sage, which is error-prone and time-consuming.

**C. Report Email Delivery**  
Reports are generated and stored in S3, but the Gmail router is not implemented. Office staff must download PDFs and email them manually. Every completed job requires this manual step.

**D. Monthly Schedule → Job Creation**  
The monthly service tracking table has a `linkedJobId` field, but no mutation creates a job from a schedule row. Schedulers must manually create jobs and then link them. Schedule adherence cannot be automatically tracked.

### Important (causes friction but has workarounds)

**E. Repair Quote Acceptance → Approved Work**  
When a customer accepts a repair quote (via email token), the quote status changes to `accepted` and deficiencies are marked `quoted`, but no approved work record or work order is created. Someone must manually create the approved work entry and link it to the quote.

**F. Work Order Materials → Parts Catalog**  
Materials used on a work order is a free-form JSON array (`description`, `quantity`, `unitCost`). It does not link to the parts catalog. Actual parts cost cannot be reconciled against the quoted cost or used to update inventory.

**G. Repair Letters ↔ Deficiencies ↔ Monthly Tracking**  
Three separate tables track the same resolution lifecycle:
- `deficiencies` (per device, per job)
- `repairLetterTracking` (per site, per period)
- `monthlyServiceTracking` (per site, per month)

Staff must update all three manually. There is no single "deficiency closure" view that rolls these up.

**H. Technician Cert Validation**  
Certs are stored in the users table and snapshotted on inspection results, but job finalization does not check whether the assigned technician's cert is current. A job with an expired-cert tech can be finalized and reported without warning.

**I. Sites ↔ Work Site Info**  
`workSiteInfo` is a separate router and table linked to `siteId`. The site detail page exists but the connection between site record and work site info (specific building info, panel locations, key box codes, etc.) is not surfaced in the technician's job view consistently.

**J. Customer Records ↔ Sites ↔ Org**  
`customerOrgs` → `sites` → `jobs` chain is established in the schema but the customer records module is minimal. There is no page that shows a customer's full history: all sites, all jobs, open deficiencies, outstanding quotes, outstanding invoices.

---

## 3. Recommended Module Hierarchy

Proposed navigation structure. Groups related workflows together rather than listing tables.

```
Inspectra
├── Operations (dispatch/admin daily view)
│   ├── Dashboard
│   ├── Schedule / Month View
│   └── Dispatch Board
│
├── Customers & Sites
│   ├── Customers (org-level)
│   ├── Sites
│   ├── Work Site Info
│   └── Devices / Assets
│
├── Field Work (job lifecycle)
│   ├── Jobs
│   ├── Work Orders
│   ├── Inspection Forms (fire alarm, sprinkler, smoke)
│   └── Deficiencies
│
├── Repairs & Quotes
│   ├── Repair Quotes
│   ├── Approved Work
│   └── Repair Letters
│
├── Financial
│   ├── Invoices
│   ├── Sage Export
│   └── Parts Catalog
│
├── Compliance & Reports
│   ├── Reports
│   ├── QA Queue
│   └── Audit Log
│
└── Admin / Data
    ├── Users
    ├── Companies
    ├── Imports
    └── Settings
```

---

## 4. Priority Roadmap

### Phase 1 — Complete the Revenue Loop *(~3 weeks)*

The operational system is functional but the money doesn't move without manual work at every step. Phase 1 closes the revenue loop.

**1.1 — Auto-create invoice from completed approved work**  
Add `approvedWork.createInvoice` mutation. When approved work transitions to `completed` or `invoiced`, populate invoice line items from the linked quote's line items (or work order line items if no quote). Set bill-to from customer org. This is the highest-value single feature.

**1.2 — Sage export endpoint**  
Add `invoice.exportToSage` mutation. Produce a structured output (CSV or API call depending on Sage version) from invoices with `sageExportStatus = 'pending'`. Mark as exported. Even a CSV export beats manual re-keying.

**1.3 — Invoice PDF generation** — ✅ DONE (verified 2026-06-28)  
~~Add PDFKit-based invoice PDF generation (same pattern as existing report PDFs). Store in S3, add download link to invoice detail page. Required for emailing invoices to customers.~~ Shipped: `invoicePdfGenerator.ts` + `invoiceRouter.generatePdf` (S3-stored, downloadable) and a send-email endpoint that attaches the PDF.

**1.4 — Quote acceptance → Approved Work auto-creation**  
When `quote.accept` fires, check whether an approved work record already exists for that quote. If not, create one with status `approved`, linking `quoteId`, `siteId`, `customerOrgId`. Remove the manual step.

**1.5 — Technician cert validation on finalization**  
Add cert expiry check in `job.finalize`. If the lead technician has an expired cert, block finalization with a clear error. Adds compliance protection at the right enforcement point.

---

### Phase 2 — Workflow Automation *(~3 weeks)*

Phase 2 reduces manual work across the schedule → job → report → email loop.

**2.1 — Monthly schedule → Job creation**  
Add `monthlyServiceTracking.createJob` mutation. When a schedule row is confirmed for a month, create a linked job and update `linkedJobId`. Enables schedule adherence tracking.

**2.2 — Gmail report delivery**  
Implement actual Gmail API calls in `gmailRouter.ts`. Add `report.sendToCustomer` mutation that emails the PDF to the customer org's contact email. This is the most-repeated manual task for office staff.

**2.3 — Repair letter automation**  
When deficiencies remain open 30+ days after job completion, auto-create or auto-flag a repair letter record. Link the repair letter directly to the deficiency records rather than tracking separately.

**2.4 — Work order materials → Parts catalog**  
Change `workOrder.materialsUsed` from free-form text to structured entries linked to `partsCatalog.id`. Enables actual vs. quoted cost reconciliation and forms the foundation for future inventory tracking.

**2.5 — Customer 360 view**  
Build a customer detail page that aggregates: all sites, active jobs, open deficiencies, outstanding quotes, outstanding invoices. Currently requires navigating four separate modules. This is the most-requested office workflow improvement.

---

### Phase 3 — Management Visibility *(~2 weeks)*

Phase 3 gives managers the data they need to run the business without asking staff.

**3.1 — Operations dashboard (real)**  
Replace the current basic dashboard with role-specific views:
- Office: jobs scheduled this week, overdue deficiencies, pending invoices, unsent reports
- Manager: revenue MTD, technician utilization, open approved work aging

**3.2 — QA queue**  
Formalize the QA step between job completion and report sending. Add a queue of jobs awaiting office review with action items (approve report, flag issues, send to customer). Reduces the current "check if report was sent" manual tracking.

**3.3 — Deficiency aging report**  
List all open deficiencies by site, grouped by age (0-30, 30-60, 60-90, 90+ days). Drives repair letter follow-up workflow. Currently requires manual cross-referencing.

**3.4 — Schedule compliance report**  
Show which sites' scheduled inspections were completed on time vs. late vs. missed per month. Feeds into customer reporting and internal KPIs.

---

### Phase 4 — External / Client Features *(~4 weeks, after Phase 1-3)*

Phase 4 adds customer-facing capability. Do not build this before Phase 1-2 are stable — the internal workflow must be solid first.

**4.1 — Customer portal (re-enable)**  
The schema, auth patterns, and role system are already in place. Re-enable `customerProcedure`, activate customer routes, and provide read-only access to their reports, open deficiencies, and accepted quotes.

**4.2 — Customer report access**  
Customers can download their own inspection reports from the portal without requesting them by email.

**4.3 — Online quote approval**  
Extend the current token-based quote acceptance to show quote details, collect a digital signature, and trigger the approved work creation automatically.

**4.4 — Customer deficiency dashboard**  
Show the customer their open deficiencies, their status, and which ones have approved repair quotes. Reduces "what's the status of that deficiency?" calls.

---

## 5. Next 5 Features to Build

Ranked by operational value × revenue impact ÷ implementation effort.

| Rank | Feature | Op. Value | Revenue Impact | Effort | Risk |
|------|---------|-----------|---------------|--------|------|
| **1** | Auto-create invoice from approved work completion | High | **Direct** — invoices get created on time | Low — mutation + existing schema | Low — additive only |
| **2** | Sage export CSV/API | High | **Direct** — eliminates re-keying to accounting | Medium — need Sage format spec | Low — isolated module |
| ~~**3**~~ | ~~Invoice PDF generation~~ ✅ DONE (2026-06-28) | — | — | — | — |
| **4** | Gmail report delivery | High | Medium — speeds cash collection | Medium — Gmail OAuth scope | Medium — external API |
| **5** | Quote acceptance → Approved Work auto-creation | Medium-High | Medium — faster repair-to-invoice cycle | Low — extend existing accept handler | Low — additive only |

---

## 6. Recommended Next Implementation Task

**Build `approvedWork.createInvoice` — auto-generate invoice on approved work completion.**

**Why this is the right next task:**
- It is the single most impactful gap in the revenue workflow. Every completed job today requires manual invoice creation.
- The schema is ready: invoices table has all required fields, approved work already stores `invoiceNumber` and `invoiceStatus`, and the link between them exists.
- Implementation is additive — no existing code changes, just a new mutation plus UI trigger.
- It unblocks Sage export (Phase 1.2), which requires invoices to exist in the system.
- It is low risk — a failed invoice creation does not corrupt any existing data.

**Implementation shape:**
1. `approvedWork.createInvoice` tRPC mutation: validate ownership, pull line items from linked quote or work order, populate bill-to from customer org, insert invoice record, set `approvedWork.invoiceStatus = 'sent'`.
2. Button on the Approved Work detail page (at `completed` / `report_pending` status): "Generate Invoice".
3. On success, navigate to the new invoice record.

---

## 7. Do-Not-Build-Yet List

These features are tempting but should wait until Phase 1-2 are stable.

| Feature | Reason to wait |
|---------|---------------|
| **Customer portal** | Internal workflow is not yet solid enough to expose externally. Fix the office loop first. |
| **Payment processing (Stripe/ACH)** | Sage is the accounting system of record. Adding a payment layer before Sage integration creates reconciliation hell. |
| **Inventory / stock tracking** | Parts catalog is a price list, not a warehouse system. Building inventory before work order materials are structured (Phase 2.4) adds complexity on a broken foundation. |
| **Mobile native app** | PWA + technician web interface is sufficient. Native app requires a separate release cycle and adds platform risk for a small team. |
| **Google Calendar auto-sync** | Schedule module needs Phase 2.1 (job creation from schedule) before calendar sync makes sense. Syncing unlinked events adds noise. |
| **Multi-company / SaaS mode** | Multi-tenancy is in the schema but the product is not yet complete enough as a single-company tool. Premature generalization will slow everything else. |
| **AI-generated repair quotes** | The manual quote workflow needs to be solid and tested before adding AI generation on top of it. |
| **Customer digital signature on portal** | Token-based acceptance works. Full portal signature workflow requires re-enabling the customer portal first (Phase 4). |
| **Time clock / field check-in** | Useful but niche. Attendance is tracked via fire alarm form. Separate time clock adds HR complexity without clear near-term ROI. |
| **Recurring invoice / subscription billing** | Most fire protection work is project-based. Subscription billing is a product pivot, not a feature. |

---

## Summary

Inspectra has a solid operational foundation. Inspection, deficiency, and repair quote workflows are production-ready. The gaps are concentrated in three areas:

1. **The revenue loop is now mostly closed (updated 2026-06-28).** Approved-work completion auto-creates an invoice (with snapshotted line items) and invoices generate/email a PDF. The one remaining open link is **live Sage API export** — CSV export exists, but there is still no direct API call.

2. **Report delivery is manual at every step.** Reports are generated but must be downloaded and emailed by hand. Gmail integration is stubbed and needs to be completed.

3. **The scheduling and job creation workflow is decoupled.** Monthly service tracking does not auto-create jobs, forcing schedulers to manage two systems.

Fix these three things in Phase 1-2 and Inspectra becomes a true operating system for the business. Phase 3-4 add management visibility and customer-facing features once the internal workflow is airtight.
