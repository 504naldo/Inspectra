# Template Response → Report PDF Integration v1 — Audit

## Existing Report Generation Flow

### Report Routers (`server/routers/reportRouter.ts`, 706 lines)

Two deprecated top-level procedures that remain for compatibility:
- `report.generatePDF` → calls `generateInspectionReportPDF` (pdfGeneratorFirePro.ts)
- `report.generateCompliancePDF` → calls `generateComplianceReportPDF` (pdfGeneratorCompliance.ts)

Active aliases (recommended):
- `deficiencyReport.generate` → same as `report.generatePDF`
- `annualReport.generate` → same as `report.generateCompliancePDF`

Both follow the same flow:
1. Fetch job, site, customer, company, devices, deficiencies
2. Validate device/deficiency locations (required before PDF)
3. Build typed data object (`ReportData` or `ComplianceReportData`)
4. Call PDF generator → returns `Buffer`
5. Upload buffer to S3 via `storagePut()`
6. Create/update `reports` table row (status: "generated")
7. Send email to `reports@ewandf.ca`
8. Best-effort Google Drive upload

### PDF Generators

- **`pdfGeneratorFirePro.ts`** — Deficiency / Inspection Summary Report
  - Exports: `generateInspectionReportPDF(data: ReportData): Promise<Buffer>`
  - Pages: Cover, Inspection Summary, AI Summary (optional), Fire Alarm Checklist (opt-in), Deficiency Section, After Service Letter, Deficiency Tables, Inspection Results
  - Margin: 50pt. Content width: 512pt. Letter size.
  - Footer on every page: company name left, page X of Y center, job number right.
  - Already has pattern for optional page sections (`includeFireAlarmChecklist` flag)

- **`pdfGeneratorCompliance.ts`** — Annual Inspection Report
  - Exports: `generateComplianceReportPDF(data: ComplianceReportData): Promise<Buffer>`
  - Similar structure but with 16+ CAN/ULC-S536 checklist sections

- **`pdfSharedStyles.ts`** — Shared utilities (colors, fonts, logo, drawTable, drawSectionHeader, etc.)

### Report Status Lifecycle
```
draft → generated → corrections_required → approved → sent → archived
```

### Database: `reports` table
Fields relevant to templates: `jobId`, `status`, `qaNote`, `deficiencyCount`, `fileUrl`, `fileKey`

---

## Existing Report QA

### Router (`server/routers/reportQaRouter.ts`, 397 lines)

- `listQueue` — returns queue items with counts per status
- `markNeedsReview` — status → "generated"
- `approveReport` — status → "approved"
- `requestCorrections` — status → "corrections_required"
- `markSent` — status → "sent"
- `archiveReport` — status → "archived"
- `addQaNote` — sets `qaNote` text on report

### QA UI Pages
- `ReportQA.tsx` — Queue list with status tabs, action dialogs (approve/corrections/send)
- `QACheck.tsx` — Per-job detailed review with AI QA check, deficiency list, stats, report actions

### Data Shown in QACheck.tsx Currently
- Device stats (total/pass/fail)
- Deficiency count
- AI QA check results
- AI report review (aiAssistant.runReportQAReview)
- Report approve/corrections/send actions

### No Template Data in QA Currently
QACheck does not show inspection template responses at all.

---

## Inspection Template Response Tables

### `inspectionTemplateResponses`
- `jobId`, `templateId`, `sectionId`, `itemId`
- `responseValue` (varchar 100) — e.g. "pass", "fail", "na", "yes", "no"
- `responseText` (text) — free-form text responses
- `notes` (text)
- `deficiencyId` (int) — linked deficiency if response triggered one
- `answeredById`, `answeredAt`
- Unique: `(jobId, itemId)`

### Template Structure
- `inspectionTemplates` → `inspectionTemplateSections` → `inspectionTemplateItems`
- Items have `responseType`, `isRequired`, `deficiencyTrigger` (JSON), `questionText`, `codeReference`

### Existing `getResponseSummary` (thin)
Returns `{ templates: [{id, name}], responses: [] }` — no completion stats, no section structure.

---

## Deficiency Linkage
- `inspectionTemplateResponses.deficiencyId` links response → deficiency
- `deficiencyTrigger` JSON on items specifies which values trigger a prompt
- Technician must manually confirm deficiency logging — never auto-created
- Failed responses without `deficiencyId` = potential gap (should flag in QA)

---

## What Can Be Safely Integrated Now

1. **`getReportResponseSummary` procedure** — new richer query that returns structured, stat-enriched data per template per job. Safe to add without touching existing tables.

2. **QACheck.tsx template summary card** — additive UI. Does not change existing logic. Warns on incomplete required items and failed responses without deficiencies.

3. **PDF template checklist section** — add `templateChecklistSections?: TemplatePdfSection[]` to `ReportData` and render a new optional page only when data is present. When absent (jobs without templates), PDF is 100% unchanged.

4. **`reportRouter.ts` fetch template data** — before building `pdfBuffer`, call `getReportResponseSummary` logic and pass result to PDF generator. Safe because the field is optional — if no responses, `templateChecklistSections` is undefined and PDF skips the section.

---

## What Should Wait for a Later PDF Redesign

- Embedding full item-level details tables in PDF (too wide, needs redesign for landscape or multi-column)
- Compliance report integration (different generator, different structure)
- Per-image photo attachments in PDF (no per-item photo upload infra exists)
- Template response export as standalone PDF
- Report regeneration from template data changes (versions not tracked yet)
- Customer portal template response view

---

## Files Changed in This Implementation

| File | Type | Change |
|------|------|--------|
| `server/routers/inspectionTemplateRouter.ts` | Modified | Add `getReportResponseSummary` procedure |
| `server/pdfGeneratorFirePro.ts` | Modified | Add `templateChecklistSections` to ReportData + `drawTemplateChecklistSection` |
| `server/routers/reportRouter.ts` | Modified | Fetch template data before PDF, pass to generator |
| `client/src/pages/admin/QACheck.tsx` | Modified | Add TemplateInspectionSummary card |
| `TEMPLATE_REPORT_INTEGRATION_NOTES.md` | New | Implementation notes |
| `TEMPLATE_REPORT_INTEGRATION_AUDIT.md` | New | This file |
