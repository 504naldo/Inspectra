# In-App Help + Workflow Guidance v1 — Delivery Notes

## Files Created

### New files
- `IN_APP_HELP_AUDIT.md` — Pre-build audit of existing help infrastructure and gaps
- `client/src/lib/helpContent.ts` — Static help content map (40+ route keys)
- `client/src/components/help/HelpPanel.tsx` — Sheet drawer with help content, AI Ask button, Feedback button
- `client/src/components/help/PageHelpButton.tsx` — HelpCircle button that opens HelpPanel, auto-detects route
- `client/src/components/help/WorkflowHint.tsx` — Inline info banner for specific workflow reminders

### Modified files
- `client/src/components/AdminLayout.tsx` — Added PageHelpButton to header (covers all admin pages)
- `client/src/pages/technician/Dashboard.tsx` — Added PageHelpButton to header
- `client/src/pages/technician/JobDetails.tsx` — Added PageHelpButton to header
- `client/src/pages/technician/DeviceTest.tsx` — Added PageHelpButton to header
- `client/src/pages/technician/DeficiencyEditor.tsx` — Added PageHelpButton to header
- `client/src/pages/admin/ReportQA.tsx` — Added WorkflowHint for status flow
- `client/src/pages/admin/InvoiceDetail.tsx` — Added WorkflowHint for locking behavior
- `client/src/pages/admin/RepairQuoteDetail.tsx` — Added WorkflowHint for Approved Work conversion

## Help Components

### HelpPanel
- Sheet drawer (right side, full height)
- Shows: page title, description, workflow hint (blue callout), common tasks, next steps, warnings (amber callout), role note, related page links
- "Ask AI about this page" button — calls `trpc.aiAssistant.ask` with `mode: "workflow_help"`
- "Report issue with this page" — renders FeedbackButton with route context
- AI response rendered inline in the panel (no navigation required)

### PageHelpButton
- Small ghost button with HelpCircle icon; "Help" label at `size="sm"`, icon-only at `size="icon"`
- Auto-detects current route via `useLocation()` and maps to a help key via `routeToHelpKey()`
- Accepts optional `routeKey` prop to override auto-detection (used on technician pages)
- Opens HelpPanel as a Sheet drawer

### WorkflowHint
- Blue info banner with Info icon
- Accepts a `hint` string prop
- Used inline in page JSX near the top of the main content area

## Pages Updated

### Admin (via AdminLayout header — covers all 57 admin pages):
All admin pages now show a Help button in the header. Content is available for:
- dashboard, jobs, job_detail, schedule, reports, report_qa
- compliance, data_quality, document_center
- customers, sites, customer_records, service_agreements
- invoices, invoice_detail, quotes, quote_detail
- approved_work, work_orders, payroll_hours, payroll_review, timesheets
- inventory, parts_requests, purchase_orders, vendors
- devices, asset_lifecycle
- inspection_templates, import_center
- feedback_center, ai_assistant, knowledge_base, setup_wizard
- notifications, access_control, users, settings

### Technician (individual headers):
- Dashboard — PageHelpButton added
- Job Details — PageHelpButton added
- Device Test — PageHelpButton added
- Deficiency Editor — PageHelpButton added

### Inline WorkflowHints:
- Report QA — "Status flow: Generated → Review → Approve → Send"
- Invoice Detail — "Exported or paid invoices are locked"
- Repair Quote Detail — "Approved quotes convert to Approved Work"

## Role-Based Behavior

- `roleNotes` in helpContent.ts has separate text for `admin`, `office`, `technician`
- HelpPanel reads `user.role` from `useAuth()` and shows only the matching role note
- "Ask AI about this page" button is hidden for `technician` role (uses `officeProcedure`)
- Help content for admin-specific modules (Users, Access Control, Setup Wizard) notes admin-only access in `roleNotes.admin`
- No help content exposes admin-only data to technician users

## AI Integration

- Calls `trpc.aiAssistant.ask` with:
  - `message`: "Explain the '{title}' page in Inspectra: what it is for, what I should focus on, and what to do next."
  - `mode: "workflow_help"` — uses the knowledge base and workflow guidance hints
- Only visible to `admin` and `office` roles (matches `officeProcedure` restriction)
- AI response rendered inline in HelpPanel — no navigation required
- Error state shown if AI is unavailable ("try again later")
- AI cannot modify records, approve anything, or send emails (server-enforced)

## Feedback Integration

- FeedbackButton rendered at the bottom of HelpPanel
- Label: "Report issue with this page"
- `entityType` set to the current `routeKey` for context
- Route and page URL are captured automatically by FeedbackButton (unchanged behavior)
- No new feedback logic — reuses the existing FeedbackButton component

## Limitations

- Help content is static (TypeScript config file) — no admin UI to edit it
- Technician SyncScreen has a help key (`tech_sync`) defined in helpContent but no PageHelpButton added (low priority — simple page)
- Payroll Hours, Payroll Review, Access Control, Setup Wizard, Inspection Templates pages are not on the feature branch — WorkflowHints will be added when they merge to main via helpContent entries already defined
- "Ask AI" loads a fresh answer on each button press — no conversation history in the panel
- No guided tours or multi-step walkthroughs (intentional — out of scope)

## Type Check Result

`pnpm check` — 0 new errors (pre-existing TS2688 and TS5101 errors are unrelated to this work)

## Manual Test Checklist

- [ ] Admin opens Dashboard — Help button appears in header, panel shows dashboard description and attention queue guidance
- [ ] Office opens Report QA — WorkflowHint shows status flow; Help panel shows common tasks and next steps
- [ ] Admin opens Invoice Detail — WorkflowHint explains locking behavior before editing
- [ ] Admin opens Repair Quote Detail — WorkflowHint explains path to Approved Work
- [ ] Admin clicks "Ask AI about this page" in HelpPanel — AI responds with workflow guidance
- [ ] Technician opens Job Details — PageHelpButton shows next to FieldCopilotPanel; panel shows field workflow
- [ ] Technician opens Device Test — PageHelpButton in header; panel explains Pass/Fail/N/A semantics
- [ ] Technician opens Deficiency Editor — PageHelpButton in header; panel shows severity guide
- [ ] Technician opens Dashboard — PageHelpButton shows between online badge area and FeedbackButton
- [ ] HelpPanel renders correctly on 375px (iPhone-width) — Sheet takes full width, content scrolls
- [ ] "Ask AI" button is NOT visible when logged in as technician role
- [ ] "Report issue with this page" opens FeedbackButton dialog with page URL prefilled
- [ ] Admin role note appears in HelpPanel for admin user; technician role note appears for technician user
- [ ] Navigating to a page with no help content shows "No help content available for this page yet."
- [ ] Related page links in HelpPanel close the drawer and navigate correctly
