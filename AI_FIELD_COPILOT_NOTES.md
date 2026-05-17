# AI Field Copilot for Technicians — Implementation Notes

## Backend Methods Added

All new procedures in `server/routers/aiAssistantRouter.ts`.

### `aiAssistant.askFieldCopilot` (`technicianProcedure`)
- **Purpose**: General-purpose Q&A for technicians in the field
- **Input**: `jobId` (required), `message` (required, max 1000 chars), `contextType` (optional: job | device | deficiency | work_site_info | inspection_progress), `contextId` (optional)
- **Output**: `answer`, `warnings[]`, `suggestedActions[]`, `contextUsed`
- **Context**: Builds technician-safe job context; optional deficiency context if contextId provided; KB lookup (technician + ai_only visibility)
- **Access**: Technicians must be assigned to the job; admin/office can call for any company job

### `aiAssistant.summarizeJobForTechnician` (`technicianProcedure`)
- **Purpose**: One-tap job briefing — summary of everything the technician needs to know on arrival
- **Input**: `jobId` (required)
- **Output**: `jobSummary`, `accessNotes`, `importantSiteInfo`, `openDeficiencies[]`, `inspectionProgress`, `warnings[]`, `isDraft`, `disclaimer`
- **Context**: `buildTechnicianJobContext` (excludes pricing/invoices/admin data) + KB snippets
- **Access**: Assigned technicians only; admin/office for any company job

### `aiAssistant.checkBeforeSubmitForQA` (`technicianProcedure`)
- **Purpose**: Pre-flight check — what's missing before the technician can submit for QA
- **Input**: `jobId` (required)
- **Output**: `readyForQA` (boolean), `missingItems[]`, `untestedDevicesCount`, `deficiencyCount`, `criticalWarnings[]`, `suggestedNextSteps[]`
- **Implementation**: Pure data computation (no LLM) — fast and reliable even without AI key
- **Access**: Assigned technicians only; admin/office for any company job

---

## Context Builder Added

### `buildTechnicianJobContext(jobId, companyId)` — `server/routers/aiAssistantRouter.ts`
- Fetches: job, site, WSI, inspection stats, deficiencies, technicians, previous job
- **Includes**: job number/title/type/status, scheduled date, site name/address/phone, access notes, key info, lockbox code, FA panel location, annunciator location, monitoring company/phone, sprinkler notes, emergency lighting notes, device count, inspection progress, open deficiencies list, previous unresolved deficiencies from last finalized job
- **Excludes**: invoices, pricing, Sage export data, repair quotes, customer billing info, admin-only notes, Google tokens

---

## DB Helper Added

### `isUserAssignedToJob(jobId, userId)` — `server/db.ts`
- Checks `jobs.leadTechnicianId === userId` OR entry in `job_assignments` table
- Used by `verifyJobAccessForCopilot` in aiAssistantRouter

---

## Technician Pages Updated

### `JobDetails.tsx`
- Added import for `FieldCopilotPanel`
- Added `<FieldCopilotPanel jobId={jobId} isOnline={isOnline} jobStatus={job.status} />` in the page header (beside the online/offline indicator)

### `DeficiencyEditor.tsx` (existing work from previous session)
- "Draft from Notes" modal: raw notes → AI draft → apply selected fields
- "Improve Wording" modal: shows improved versions of all text fields → apply
- Both show "AI Draft" disclaimer banner; nothing saves without user action

---

## FieldCopilotPanel Component

New file: `client/src/components/FieldCopilotPanel.tsx`

### Features
- **Trigger**: "Ask AI" button in the job header
- **Container**: `Sheet` (bottom drawer) at 88vh — mobile-friendly
- **Action buttons**: "Summarize Job" + "Check Before Submit" (only shown for in_progress jobs)
- **Quick prompts**: 4 one-tap prompts:
  - "What should I know before starting?"
  - "Summarize site access notes"
  - "What is still incomplete?"
  - "Suggest corrective action wording"
- **Ask AI input**: Textarea + Send button (Enter key also sends)
- **Response views**: Separate renderers for ask/summary/qacheck results
- **Copy buttons**: On answer text and accessNotes
- **Offline handling**: Disables all AI inputs, shows "AI requires an internet connection" banner
- **Disclaimer**: "AI suggestions are drafts. Verify before saving or submitting."

### Result display
| Result kind | Display |
|---|---|
| `ask` | Answer + suggested actions list + warnings |
| `summary` | Job summary + access notes (amber highlight) + site info + open deficiencies + progress + warnings |
| `qacheck` | Ready/Not Ready badge + missing items (red) + critical warnings (amber) + next steps list |

---

## Knowledge Base Visibility

Field copilot procedures (`askFieldCopilot`, `summarizeJobForTechnician`) use `visibilities: ["technician", "ai_only"]` — they do **not** expose `admin_office` KB entries to technicians.

Admin/office AI procedures continue to use `["admin_office", "ai_only"]` (unchanged).

---

## Offline Behavior

- AI panel detects `isOnline` prop (passed from `useOfflineStorage`)
- When offline: all AI buttons disabled, textarea disabled, message shown
- Normal inspection workflow (device testing, deficiency logging) is unaffected
- No AI results are cached; previous results clear when panel is reopened

---

## Technician Access Rules

| Rule | Enforcement |
|---|---|
| Technicians can only access assigned jobs | `verifyJobAccessForCopilot` checks `leadTechnicianId` and `job_assignments` table |
| Admin/office can use all field copilot methods | Role check in `verifyJobAccessForCopilot` |
| No customer-facing AI in v1 | All procedures require authenticated session |
| CompanyId from server context only | `companyId = ctx.user.companyId!` — never trusted from client |
| No cross-company data | Every fetched record verified against `companyId` |
| No pricing/invoice exposure | `buildTechnicianJobContext` only fetches job/site/WSI/deficiencies |
| No auto-save | Panel is read-only; apply buttons exist only in DeficiencyEditor for deficiency drafting |
| No auto-submit | `checkBeforeSubmitForQA` never calls `submitForQA` — technician must tap the existing Submit button |
| No auto-close or auto-status | No record mutations in any copilot procedure |

---

## Activity Logging

| Procedure | eventType | entityType |
|---|---|---|
| `askFieldCopilot` | `ai_assistant.fieldCopilotAsked` | job |
| `summarizeJobForTechnician` | `ai_assistant.jobSummarized` | job |
| `checkBeforeSubmitForQA` | `ai_assistant.preQAChecked` | job |

All fire-and-forget, metadata-only (no full prompt logged).

---

## Safety Limits

- AI does not invent device serial numbers, locations, or test results
- AI does not claim a job is compliant or complete unless data supports it
- AI does not tell technicians to skip required inspection steps
- AI does not guarantee code compliance
- `checkBeforeSubmitForQA` uses real DB data for `readyForQA` boolean — not AI opinion
- All drafted text is labelled as draft
- Missing data is called out explicitly, not invented

---

## Manual Test Checklist

### Field Copilot Panel — Job Details
- [ ] Open a job (in_progress) as a logged-in technician
- [ ] Tap "Ask AI" in the header — copilot drawer slides up from bottom
- [ ] If offline: confirm all AI buttons are disabled, "AI requires an internet connection" shown
- [ ] Tap "Summarize Job" — loading state shown, result displays with job summary and access notes
- [ ] Tap "Check Before Submit" (only visible for in_progress jobs) — shows readyForQA badge + missing items
- [ ] Tap a quick prompt — answer appears in result view
- [ ] Type a custom question, tap Send — answer appears
- [ ] Press Enter to send message (not Shift+Enter)
- [ ] Tap "Back" — returns to home screen
- [ ] Copy button on answer text — confirm clipboard populated
- [ ] Close drawer — confirm nothing was modified in the job

### Assignment Enforcement
- [ ] Log in as technician assigned to a job — copilot works
- [ ] Attempt to call `askFieldCopilot` for a job NOT assigned to this technician — expect FORBIDDEN error
- [ ] Log in as admin/office — copilot works for any company job

### Pre-QA Check
- [ ] Job with untested devices: `readyForQA = false`, untested count shown
- [ ] Job with all devices tested and in_progress status: `readyForQA = true`, next step shown
- [ ] Job not in_progress: `readyForQA = false`, status shown in missingItems
- [ ] Critical deficiencies: shown in criticalWarnings
- [ ] Tapping the result does NOT submit the job — must use the existing "Submit for QA" button

### Deficiency Integration (existing from previous session)
- [ ] Open DeficiencyEditor — "Draft from Notes" button visible
- [ ] Enter rough notes → Generate → Apply All Fields → confirm "AI Draft" banner shown
- [ ] Nothing saved until user taps Save deficiency button
