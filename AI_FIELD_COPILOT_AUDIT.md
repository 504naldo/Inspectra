# AI Field Copilot for Technicians — Pre-Build Audit

## Existing Technician AI Hooks

**DeficiencyEditor.tsx** (technician UI, already implemented in previous session):
- "Draft from Notes" → `aiAssistant.draftDeficiencyFromNotes` (technicianProcedure)
- "Improve Wording" → `aiAssistant.improveDeficiencyText` (technicianProcedure)
- "Generate Narrative" → `ai.generateDeficiencyNarrative` (requires device + location)

**No existing**:
- Job summary AI for technicians
- Pre-QA check AI
- Field copilot chat interface
- Mobile-friendly AI panel

---

## Existing AI Assistant Methods

All in `server/routers/aiAssistantRouter.ts`:

| Procedure | Access | Purpose |
|---|---|---|
| `ask` | officeProcedure | General chat + record context |
| `getContextSummary` | officeProcedure | Record summaries |
| `draftCustomerMessage` | officeProcedure | Email drafts |
| `draftDeficiencyText` | officeProcedure | Structured deficiency fields |
| `runReportQAReview` | officeProcedure | Structured QA review |
| `getReviewsForEntity` | officeProcedure | Fetch stored AI reviews |
| `dismissReview` | officeProcedure | Mark dismissed |
| `draftDeficiencyFromNotes` | technicianProcedure | Draft from raw notes (field-safe) |
| `improveDeficiencyText` | technicianProcedure | Improve existing deficiency text |
| `suggestRepairScope` | officeProcedure | Scope suggestion for quote |
| `draftRepairQuoteSummary` | officeProcedure | Quote summary |
| `suggestPartsFromDeficiency` | officeProcedure | Parts catalog matching |

---

## Technician Job Access Rules

From `server/jobAssignmentRouter.ts`:
- `listMyJobs` — returns jobs where `job_assignments.userId = ctx.user.id` (technician role required)

From `server/db.ts`:
- `getJobsByTechnician(technicianId)` — queries by `leadTechnicianId` field
- `isUserAssignedToJob` does not exist yet — need to create
- Assignment check: `jobs.leadTechnicianId === userId` OR entry in `job_assignments` table (userId + jobId)

**`technicianProcedure`** allows roles: `['admin', 'office', 'technician']`. Assignment check must be done inside each procedure.

---

## Available Job/Site/Device/Deficiency Context

**Job fields available**: jobNumber, title, jobType, status, priority, scheduledDate, completedAt, finalizedAt, leadTechnicianId, siteId, companyId

**Site fields available**: name, address, city, contactPhone, summary, buildingId, fileNumber

**Work Site Info fields** (`siteWorkSiteInfo` table): accessNotes, keyNumber, keyLocation, lockboxCode, fireAlarmPanelLocation, fireAlarmPanelMake, fireAlarmPanelModel, annunciatorLocation, monitoringCompany, monitoringPhone, monitoringAccount, sprinklerNotes, emergencyLightingNotes

**Device fields**: deviceType, location, serialNumber, manufacturer, model, category, isActive, siteId

**Deficiency fields**: title, severity, status, systemCategory, observedIssue, description, correctiveAction, customerExplanation

**Inspection stats** (from `getInspectionStats`): total, pass, fail, na, notTested

**Previous job** (from `getLastCompletedJobForSite`): last finalized job for the same site

---

## Fields Excluded from Technician Context

- Invoices (any pricing, Sage export, billing)
- Repair quote details and pricing
- Admin-only notes
- Customer billing/payment details
- Google/OAuth tokens or secrets
- Other companies' records
- Internal office communications
- Report QA reviewer notes (for AI review results)

---

## Knowledge Base Visibility

KB entries have three visibility levels:
- `admin_office` — admin and office users only
- `technician` — technician-visible
- `ai_only` — used by AI context only (not displayed in UI)

Current `getRelevantKnowledgeContext` only includes `admin_office` and `ai_only`.
For the field copilot, include `technician` and `ai_only` entries only (not `admin_office`).

---

## Offline Limitations

- `isOnline` state available in all technician pages via `useOfflineStorage` hook
- Cached job data available offline via `getCachedJobData(jobId)`
- AI methods require active internet connection — cannot be queued for offline use
- Recommended: disable AI buttons when `!isOnline`, show "AI requires an internet connection"
- Normal inspection workflow (device testing, deficiency logging) must remain fully usable offline

---

## Recommended Minimal Implementation

### Backend (3 new procedures in aiAssistantRouter.ts)

1. **`askFieldCopilot`** (technicianProcedure) — general Q&A with job context
2. **`summarizeJobForTechnician`** (technicianProcedure) — structured job briefing
3. **`checkBeforeSubmitForQA`** (technicianProcedure) — pre-flight data check (no LLM)

Plus:
- `buildTechnicianJobContext(jobId, companyId)` — context builder that excludes pricing/admin data
- `isUserAssignedToJob(jobId, userId)` in db.ts — assignment verification
- KB lookup scoped to `technician` + `ai_only` visibility for field procedures

### Frontend (1 new component + 1 page update)

1. **`FieldCopilotPanel`** (`client/src/components/FieldCopilotPanel.tsx`) — mobile Sheet drawer
   - Quick prompts, Summarize Job, Check Before Submit, Ask AI input
   - Offline-aware: disables and shows message when offline
   - Result display with copy/dismiss

2. **`JobDetails.tsx`** — add "Ask AI" button in header + render FieldCopilotPanel

### No DB schema changes required

All needed fields already exist. Job assignment check uses existing `job_assignments` table.
