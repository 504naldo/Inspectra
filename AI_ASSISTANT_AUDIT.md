# AI Assistant — Audit

## Existing AI Infrastructure

### Provider & Library
- **Provider**: OpenAI Chat Completions API (direct fetch, no SDK)
- **Module**: `server/_core/llm.ts` — `invokeLLM(params)` function
- **Default model**: `gpt-4o-mini`
- **High-quality tasks**: `gpt-4o` (used in `prePublishReview`)
- **API key env var**: `OPENAI_API_KEY` (read via `ENV.openaiApiKey` in `server/_core/env.ts`)
- **No SDK dependency**: pure fetch + TypeScript types; no `openai` npm package

### Existing aiRouter Procedures (`server/routers/aiRouter.ts`)

| Procedure | Role | Purpose |
|---|---|---|
| `generateDeficiencyNarrative` | technicianProcedure | Generates description, correctiveAction, customerExplanation from device/issue data |
| `generateRepairRecommendations` | technicianProcedure | Troubleshooting steps, parts/tools, photos, checklist |
| `generateReportSummary` | officeProcedure | Executive summary from job stats and deficiencies |
| `generatePhotoCaption` | technicianProcedure | Short caption + inspection note from photo label |
| `prePublishReview` | protectedProcedure | QA review with issues/blockers (uses gpt-4o, persists to ai_reviews table) |
| `saveReviewOverrides` | protectedProcedure | Stores dismissed QA issues |
| `runQACheck` | adminProcedure | Logic-based (non-AI) validation before publishing |

### Existing DB Tables with AI Columns

| Table | AI Columns |
|---|---|
| `ai_reviews` | jobId, issues (json), modelUsed, reviewedAt, overrides (json) |
| `deficiencies` | aiGeneratedAt, aiModelId, aiPromptHash, aiContext |
| `attachments` | aiCaption |
| `repairs` | aiRecommendations (json) |
| `reports` | aiSummary |

### Existing DB Functions for AI
- `createAiReview(data)` — persist review result
- `getAiReviewsByJob(jobId)` — retrieve reviews
- `updateAiReview(id, data)` — update with overrides

### Frontend Pages with Existing AI Features
- `DeficiencyEditor.tsx` — "Generate with AI" button using `ai.generateDeficiencyNarrative`
- `Reports.tsx` / `FinalizeJobDialog.tsx` — pre-publish QA review using `ai.prePublishReview`
- `QACheck.tsx` — `ai.runQACheck` (logic-based)

---

## Available Context for AI Assistant

| Context Type | Data Available | Source |
|---|---|---|
| Job | jobNumber, title, type, status, scheduledDate, site, customer, technician, deviceStats, deficiencyCount, reportStatus | `getJobById` + `getInspectionStats` + `getDeficienciesByJob` + `getReportsByJob` |
| Site | name, address, city, buildingId, fileNumber, customerOrg, recentJobs, openDeficiencies, workSiteInfo | `getSiteById` + `getMonthlyTrackingBySite` + `getWorkSiteInfoBySiteId` |
| Deficiency | title, severity, systemCategory, observedIssue, description, correctiveAction, customerExplanation, status, deviceInfo | `getDeficiencyById` + `getDeviceById` |
| Report | jobId, title, status, deviceCount, pass/fail counts, deficiencyCount, aiSummary, reportNumber | `getReportById` |
| Approved Work | title, type, status, scheduledDate, site, customer, description | `getApprovedWorkById` |
| Invoice | invoiceNumber, status, total, dueDate, lineItems, sageStatus, linkedSite | `getInvoiceById` |
| Repair Quote | quoteNumber, status, lineItems, total, scopeWording | `getRepairQuoteById` |
| Compliance | site risk list, overdue inspections, open deficiencies, pending reports | `compliance.getSummary` |

---

## Missing Backend Pieces

1. **No general "chat" or "ask" procedure** — all existing AI is task-specific (generate narrative, generate summary, etc.)
2. **No context builder utility** — each procedure builds its own prompt ad-hoc
3. **No `draftCustomerMessage` procedure** — generating customer-facing text for quotes, invoices, etc. not yet implemented
4. **No cross-entity summarization** — no procedure that can pull a job + its site + deficiencies + reports in one call

## Security Concerns

1. `OPENAI_API_KEY` must never be sent to the frontend — all AI calls must go through the server
2. Context builders must verify `companyId` ownership before including any record data
3. Technicians may only receive context from their assigned jobs (not arbitrary jobId)
4. Office/admin can access any record within their company
5. Internal notes (officeNotes, internal pricing, etc.) should be filtered for customer-facing drafts
6. No destructive mutations should be triggered by the AI assistant

---

## Recommended Minimal Implementation

### Backend: `server/routers/aiAssistantRouter.ts`
- `ask(message, mode?, contextType?, contextId?)` — general chat with optional record context
- `getContextSummary(contextType, contextId)` — fetch and summarize a record
- `draftCustomerMessage(type, entityId, tone?)` — draft customer-facing text
- Reuse `invokeLLM` from `server/_core/llm.ts`

### Frontend: `client/src/pages/admin/AIAssistant.tsx`
- Chat panel with message history
- Mode selector (general, summarize, deficiency_help, report_qa, repair_quote, invoice, compliance)
- Context picker (optional entity type + ID)
- Quick prompts panel
- Suggested actions (non-destructive links only)

### Inline buttons (non-invasive additions)
- Report QA page: "Draft correction note" button
- Repair Quote detail: "Draft scope summary" button
- Invoice detail: "Draft customer note" button
