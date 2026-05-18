# Inspection Template / Form Library v1 — Audit

## Existing Inspection Infrastructure

**Existing hardcoded forms (NOT replaced):**
- `client/src/pages/technician/FireAlarmInspection.tsx` — CAN/ULC-S536 fire alarm form (625 lines)
- `client/src/pages/technician/SmokeAlarmInspection.tsx` — Smoke alarm inspection (417 lines)
- `client/src/pages/technician/SprinklerITM.tsx` — NFPA 25 sprinkler form (197 lines)
- `client/src/pages/technician/DeviceTest.tsx` — Per-device test (488 lines)
- `client/src/pages/technician/ChecklistCompletion` — Generic checklist

**Existing inspection data tables:**
- `inspection_results` — per-device pass/fail result for a job
- `inspection_checklist_responses` — legacy checklist response per job/section/item
- `fire_alarm_inspection_results` — fire alarm-specific results

**Existing routers:**
- `inspectionRouter.ts` — inspectionResult + checklist CRUD
- `deficiencyRouter.ts` — deficiency CRUD (used by template renderer for prompts)
- `fireAlarmRouter.ts`, `sprinklerRouter.ts` — hardcoded system routers

## What Was NOT Changed

- All existing inspection forms are preserved unchanged
- No existing data tables modified
- No existing routes broken
- No report PDF generation touched
- No migration of existing job responses

## New Capabilities

The template library adds a **parallel, optional** inspection layer:
- Admin creates templates → attaches sections and items
- Admin assigns templates to job types/sites/customers
- Templates appear on technician's job page as additional cards
- Technician fills the form, saves responses to `inspection_template_responses`
- Deficiency triggers prompt (never auto-create) technician to log deficiencies

## Files Added

| File | Description |
|------|-------------|
| `drizzle/migrations/0061_inspection_templates.sql` | 5 new tables |
| `drizzle/schema.ts` | Schema definitions + type exports |
| `server/routers/inspectionTemplateRouter.ts` | tRPC router |
| `server/routers.ts` | Router registered as `inspectionTemplate` |
| `client/src/pages/admin/InspectionTemplates.tsx` | Template library list page |
| `client/src/pages/admin/InspectionTemplateDetail.tsx` | Template builder page |
| `client/src/pages/technician/TemplateFormRenderer.tsx` | Technician form renderer |
| `client/src/App.tsx` | 3 new routes added |
| `client/src/components/AdminLayout.tsx` | "Inspection Templates" nav item |
| `client/src/pages/technician/JobDetails.tsx` | Template cards injected |

## Data Model

### `inspection_templates`
One row per template. `status` = draft|active|archived. `isDefault` reserved.

### `inspection_template_sections`
Ordered sections within a template. `sortOrder` managed by up/down buttons.

### `inspection_template_items`
Individual questions. `responseType` controls the UI control shown. `deficiencyTrigger` JSON encodes which values trigger a deficiency prompt and the default severity/title.

### `inspection_template_assignments`
Links templates to job types, system types, sites, or customer orgs. Any combination. Technician sees templates where all specified filters match.

### `inspection_template_responses`
Unique per `(jobId, itemId)`. Upserted on save. Linked to deficiency via `deficiencyId`.

## Security

- `list`, `get`, `getResponseSummary`: `officeProcedure` (admin + office)
- `create`, `update`, `clone`, section/item CRUD, assignments: `adminProcedure` (admin only)
- `getTemplatesForJob`, `getTemplateWithResponses`, `saveResponse`: `technicianProcedure`
- All queries scoped to `ctx.user.companyId` — no client-supplied companyId trusted
- Job ownership verified on all technician writes
- Finalized job guard on `saveResponse`

## Response Types Supported

| Type | UI Control |
|------|-----------|
| pass_fail_na | Pass/Fail/N/A button group |
| yes_no_na | Yes/No/N/A button group |
| text | Textarea |
| number | Number input |
| date | Date input |
| select | Dropdown |
| multi_select | Toggle buttons |
| checkbox | Single check button |
| pressure_reading | Number input |
| time_duration | Text input |

## Deficiency Trigger Flow

1. Item has `deficiencyTrigger: { onValues: ["fail"], severity: "major", defaultTitle: "..." }`
2. Technician selects "Fail" → DeficiencyPrompt dialog appears
3. Technician reviews title/severity/notes and clicks "Log Deficiency"
4. `deficiency.create` tRPC call → deficiency created
5. `deficiencyId` saved on the response row
6. Technician can also click "Skip" to dismiss without logging

## Limitations

- No drag-and-drop reordering (up/down buttons only)
- No template versioning beyond the `version` field (not auto-incremented yet)
- No PDF export of template responses
- `photo` and `signature` response types removed (no upload infra for per-item photos)
- No customer-facing template view
- Templates do not appear in existing reports (separate system)
