# Template Response → Report PDF Integration v1 — Implementation Notes

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `server/routers/inspectionTemplateRouter.ts` | Modified | Added `getReportResponseSummary` procedure |
| `server/pdfGeneratorFirePro.ts` | Modified | Added `TemplatePdfSection` types, `drawTemplateChecklistSection`, `templateChecklistSections` field on `ReportData` |
| `server/routers/reportRouter.ts` | Modified | Added `fetchTemplateReportData` helper, passes template data to PDF generator |
| `client/src/pages/admin/QACheck.tsx` | Modified | Added Template Inspection Summary card with warnings |
| `TEMPLATE_REPORT_INTEGRATION_AUDIT.md` | New | Audit document |
| `TEMPLATE_REPORT_INTEGRATION_NOTES.md` | New | This file |

---

## Backend Methods Added

### `inspectionTemplate.getReportResponseSummary`

**Procedure type:** `officeProcedure` (admin + office)

**Input:** `{ jobId: number }`

**Returns:** Array of per-template summaries. Empty array when no template responses exist.

Each entry includes:
- `templateId`, `templateName`, `systemType`, `inspectionType`
- `completionPercent` — rounded integer 0–100
- `totalItems`, `answeredItems`, `requiredItems`, `unansweredRequiredItems`
- `passCount`, `failCount`, `naCount`
- `sections[]` — per section:
  - `sectionId`, `sectionTitle`, `sectionSortOrder`
  - `items[]` — per item:
    - `itemCode`, `questionText`, `responseType`
    - `responseValue`, `responseText`, `notes`
    - `codeReference`, `isRequired`
    - `deficiencyId`, `deficiencyTitle`
    - `answeredByName`, `answeredAt`

**Security:** Verifies `job.companyId === ctx.user.companyId`. No client-supplied companyId trusted.

### `fetchTemplateReportData(jobId, companyId)` (internal helper in reportRouter.ts)

Same logic as `getReportResponseSummary` but without tRPC context — called directly inside `generatePDF` before building the PDF buffer. Returns `TemplatePdfSection[]` or `[]`.

---

## PDF/Report Generator Changes

### `pdfGeneratorFirePro.ts`

**New types added to `ReportData`:**
```typescript
templateChecklistSections?: TemplatePdfSection[];
```

**New interface `TemplatePdfSection`:**
- Template-level summary (name, system type, completion stats, per-section items)
- Each item: itemCode, questionText, responseValue, notes, codeReference, isRequired, deficiencyId

**New function `drawTemplateChecklistSection(doc, section, getHeaderY)`:**
- Renders a compact table: Item | Reference | Response
- Pass (green), Fail (red highlighted row), N/A (gray), Missing required (amber highlight)
- Deficiency reference shown inline when linked (`↳ Def #N`)
- Section sub-headers break items into readable groups
- Auto page-break with repeated column headers on new pages
- Blank-page-safe: only rendered when `templateChecklistSections` is present and non-empty

**Placement in PDF:** After the Fire Alarm Checklist section, before the Deficiency Package. One page per template.

**Backwards compatibility:** When `templateChecklistSections` is undefined or empty, PDF output is identical to previous behavior.

---

## Report QA Changes (`QACheck.tsx`)

New query: `trpc.inspectionTemplate.getReportResponseSummary.useQuery({ jobId })`

New card block rendered between the Deficiency list and the QA Decision card when template responses exist:

**Per template shows:**
- Template name, system type badge, inspection type badge
- Progress bar with completion percentage
- Pass/Fail/NA counts

**Warning banners (amber/red):**
- "N required items not answered" — when `unansweredRequiredItems > 0`
- "N failed responses without linked deficiency" — lists question text, shows which responses are gaps

**Per-section breakdown table:**
- Each item shown with response badge (Pass green, Fail red, Missing amber, N/A gray)
- Deficiency reference shown when linked (`Def #N`)

**Action button:**
- "Open Template" → `/admin/inspection-templates/:id` in new tab

**Does not auto-approve.** No automated QA decisions.

---

## Customer-Facing Safety Rules

**Included in PDF checklist:**
- Question text (from `inspectionTemplateItems.questionText`)
- Response value (pass/fail/yes/no/na etc.)
- Code reference (from `inspectionTemplateItems.codeReference`) — already public-facing
- Deficiency reference number (already in deficiency report)

**NOT included in PDF:**
- Internal office notes or QA notes
- `answeredByName` or `answeredAt` (technician internal data)
- Raw JSON from `deficiencyTrigger` or `options` fields
- Admin-only metadata
- Response `notes` field (kept off PDF — may contain internal comments)

---

## Deficiency Linkage Behavior

- `inspectionTemplateResponses.deficiencyId` links a response to a deficiency
- PDF shows `↳ Def #N` inline in the checklist row when linked
- QA page shows "failed responses without linked deficiency" warning
- **No auto-creation of deficiencies** — technician must manually log via the form renderer
- "Create Deficiency" quick link not added (existing deficiency flow requires full context)

---

## AI QA Integration

The existing AI QA check (`aiAssistant.runReportQAReview`) is NOT modified in this release.
Template response data is not yet passed to AI context.

To add in a future release:
- Pass `getReportResponseSummary` result to `runReportQAReview` mutation input
- AI should flag incomplete required items and failed responses without deficiencies

---

## Activity Logging

No new activity events added in this release. Template responses are already logged when saved. Report generation is already logged. Adding template-specific logging would be premature without a defined event taxonomy.

---

## Limitations

- Compliance PDF (`pdfGeneratorCompliance.ts`) does NOT include template checklist — separate generator, future work
- `photo` and `signature` response types not rendered in PDF (no per-item image infra)
- Template versions not tracked in responses — "version" field is static at template level
- Response `notes` field excluded from PDF (kept internal)
- AI QA context not updated with template data (future task)
- No standalone "template response export" PDF

---

## Manual Test Checklist

- [ ] Create an inspection template (admin), activate it
- [ ] Assign template to a job type (e.g. annual)
- [ ] Open a job as technician — verify template card appears on job details
- [ ] Open template form, answer questions including at least one "fail" response
- [ ] For the fail response: log a deficiency when prompted (or skip)
- [ ] Open Report QA (`/admin/report-qa`)
- [ ] Click QA Check for that job
- [ ] Verify "Template Inspection Summary" card appears
- [ ] Verify completion percentage is accurate
- [ ] Verify amber warning appears for unanswered required items
- [ ] Verify red warning appears for fail responses without linked deficiency
- [ ] Generate a Deficiency Report for the job
- [ ] Open PDF — verify "Inspection Checklist" section appears near end
- [ ] Verify checklist rows show correct pass/fail/na colors
- [ ] Verify failed rows are highlighted red, missing required rows amber
- [ ] Verify deficiency reference appears next to linked fail responses
- [ ] Open a job with NO template responses — generate report — verify PDF is unchanged
- [ ] Old jobs without templates: Report QA shows no template card (no error)
