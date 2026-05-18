# In-App Help Audit — v1

## Existing Help / Tooltip Infrastructure

**Very minimal** — no dedicated help system exists.

### What was found:
- `<Info>` icon from lucide-react imported in Dashboard.tsx and ReportQA.tsx (not used for a help system — used for decorative callout icons)
- `TooltipProvider` wraps the app in App.tsx (line 567) — tooltip primitive is available but not used for guidance
- `FeedbackButton` in AdminLayout and technician Dashboard — lets users submit bugs/feature requests
- `FieldCopilotPanel` — AI assistant button on JobDetails for technicians
- `SetupWizard` — step-by-step onboarding at `/admin/setup` (separate from contextual help)
- `AIAssistant` page at `/admin/ai-assistant` — fully built with `workflow_help` mode available via `aiAssistantRouter.ask`
- No `TrainingCenter.tsx` — does not exist
- No help modals, no guided tours, no contextual tooltips for workflows
- `Radix UI Tooltip` primitive at `@/components/ui/tooltip` — available, unused for help

---

## Pages Missing Guidance

### Admin pages (57 total):
All pages lack contextual help. Highest priority gaps:

| Page | Route | Gap |
|---|---|---|
| Dashboard | `/admin` | No explanation of the attention queue or what to act on |
| Report QA | `/admin/report-qa` | Status transitions (generated → corrections_required → approved → sent) are not explained |
| Invoice Detail | `/admin/invoices/:id` | Locked state (exported/paid) is not explained |
| Repair Quote Detail | `/admin/repair-quotes/:id` | Path to Approved Work is not documented inline |
| Approved Work | `/admin/approved-work` | Distinction from Work Orders is unclear |
| Work Orders | `/admin/work-orders` | Relationship to Approved Work / Repair Quotes unclear |
| Payroll Hours | `/admin/payroll-hours` | Distinction from job time-tracking is not explained |
| Import Center | `/admin/imports` | Supported import types and field formats undocumented |
| Compliance Dashboard | `/admin/compliance` | What drives compliance scores is not explained |
| Data Quality | `/admin/data-quality` | What issues are flagged and why is not explained |
| Inspection Templates | `/admin/inspection-templates` | Relationship to jobs is not explained |

### Technician pages (13 total):
| Page | Route | Gap |
|---|---|---|
| Job Details | `/tech/jobs/:id` | Which tabs to complete in what order is not guided |
| Device Test | `/tech/jobs/:jobId/device/:deviceId` | Pass/Fail/N/A semantics and when to flag deficiencies |
| Deficiency Editor | `/tech/deficiency/:id` | Severity levels and system categories are not explained |
| Sync Screen | `/tech/sync` | What happens to un-synced data is not explained |

---

## Current Workflow Confusion Areas

1. **ReportQA status flow**: Users don't know the difference between "corrections_required" and "field_complete" or what to do next
2. **Repair Quotes → Approved Work**: The path from quote approval to creating approved work is not obvious
3. **Approved Work vs Work Orders**: Two similar concepts with different purposes, no inline explanation
4. **Payroll Hours vs Job Time**: Technicians log both; the distinction between payroll hours (for payroll) and job time (for costing) is confusing
5. **Invoice locking**: Users don't know why they can't edit certain invoices
6. **Device Test semantics**: N/A vs Not Tested vs Pass/Fail is unclear, especially for devices not applicable to the job type
7. **Sync / offline flow**: Technicians don't know what happens when they save offline and whether it's safe

---

## Where Contextual Help Should Be Added First

### Priority 1 (highest impact, most confusing):
1. AdminLayout header — PageHelpButton covers all admin pages
2. Technician JobDetails header — most complex tech screen
3. Report QA — status workflow hint inline
4. Invoice Detail — locking/export hint inline

### Priority 2:
5. Technician DeviceTest — result semantics hint
6. Technician DeficiencyEditor — severity guide
7. Repair Quote Detail — path to Approved Work
8. Payroll Hours — distinction from job time

### Priority 3 (nice to have, lower confusion):
9. Approved Work / Work Orders
10. Import Center
11. Compliance Dashboard
12. Data Quality

---

## AI Assistant Status

**Fully built** — `aiAssistantRouter.ask` is available via `officeProcedure` (admin + office only).
- Mode `workflow_help` exists: `"Explain Inspectra workflows and where to find modules."`
- Knowledge base integration included
- Not available to technicians (officeProcedure)

---

## Feedback Center Status

**Fully built** — `FeedbackButton` component captures route, browser info, device info automatically.
- Already present in AdminLayout header
- Already present in technician Dashboard header
- Can be embedded in HelpPanel with route context prefilled

---

## Recommended Minimal Implementation

1. **`client/src/lib/helpContent.ts`** — Static content map (routeKey → title, description, tasks, steps, warnings, role notes, workflow hint)
2. **`client/src/components/help/HelpPanel.tsx`** — Sheet drawer with help content + AI Ask button + Feedback button
3. **`client/src/components/help/PageHelpButton.tsx`** — Small HelpCircle button that opens HelpPanel; detects route automatically
4. **`client/src/components/help/WorkflowHint.tsx`** — Small amber/info inline banner for specific workflow reminders
5. **AdminLayout.tsx** — Add PageHelpButton to header (covers all 57 admin pages at once)
6. **Technician pages** — Add PageHelpButton to JobDetails, DeviceTest, DeficiencyEditor headers
7. **Key admin pages** — Add WorkflowHint banners to ReportQA, InvoiceDetail, RepairQuoteDetail, PayrollHours

### Safety constraints:
- No new database tables
- No changes to existing business workflows
- Role-gated: AI Ask button only for office/admin; technician role notes visible to technicians only
- No customer-facing help
- No secrets exposed in help text
