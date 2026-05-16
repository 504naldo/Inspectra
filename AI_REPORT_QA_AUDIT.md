# AI Inspection Review / Report QA — Pre-Build Audit

## Existing Report QA Flow

1. **Technician** completes inspection → calls `technician.submitForQA` (new from Task H)
2. **Report** status set to `generated` → appears in Report QA Queue
3. **Office** opens `/admin/report-qa` (`ReportQA.tsx`) — sees all reports in queue
4. **Office** can: Approve, Request Corrections, Mark Sent, Archive, Add Note (via `reportQaRouter`)
5. **Office** can also click "QA Check" per job → `/admin/qa/:jobId` (`QACheck.tsx`)
6. **QACheck.tsx** runs `trpc.ai.runQACheck` (logic-based, no LLM) → shows issues

### Status Values (reports table)
`draft` | `generated` | `corrections_required` | `approved` | `sent` | `archived`

### reportQaRouter Procedures
- `listQueue(filter, limit)` — paginated queue with status/open-deficiency counts
- `approveReport(reportId, note?)` — sets status='approved'
- `requestCorrections(reportId, note)` — sets status='corrections_required'
- `markSent(reportId, note?)` — sets status='sent'
- `archiveReport(reportId, note?)` — sets status='archived'
- `addQaNote(reportId, note)` — updates qaNote field

### Existing Logic-Based QA Check (aiRouter.runQACheck, adminProcedure)
Checks without LLM:
- Untested devices
- Failed devices without deficiency records
- Deficiencies without photos (queries attachments per deficiency)
- Failed devices without inspection notes
- Job status vs completion

Returns: `{ jobId, siteName, totalDevices, testedDevices, deficienciesCount, issues[], passedQA }`

---

## Existing AI Utilities

### invokeLLM (server/_core/llm.ts)
- OpenAI Chat Completions via `OPENAI_API_KEY`
- Default model: `gpt-4o-mini`
- Supports `responseFormat: { type: "json_schema", json_schema: {...} }` for structured JSON output

### aiAssistantRouter procedures (all officeProcedure)
- `ask` — general chat with optional record context + KB integration
- `getContextSummary` — text summary of a record
- `draftCustomerMessage` — draft subject + body for customer emails
- `draftDeficiencyText` — structured deficiency writing with JSON schema output

### Existing buildJobContext (aiAssistantRouter.ts)
Already fetches: job + site + stats + deficiencies + reports. But it's a compact text summary — not the full structured inspection context needed for QA review.

---

## Existing aiReviews Table (ai_reviews)

```typescript
export const aiReviews = mysqlTable("ai_reviews", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  issues: json("issues").$type<AiReviewIssue[]>().notNull(),  // existing type: {device_id, device_type, field, issue, severity: "warning"|"blocker"}
  modelUsed: varchar("modelUsed", { length: 64 }).notNull(),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
  overrides: json("overrides").$type<AiReviewOverride[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

**Existing DB functions:**
- `createAiReview(data: InsertAiReview)` — insert
- `getAiReviewsByJob(jobId)` — list (NO companyId filter — security gap)
- `updateAiReview(id, data)` — update (used for saving overrides)

**Used by:** `aiRouter.prePublishReview` (saves structured QA issues before report publish)

**Missing from schema:**
- `companyId` — security gap, no company scoping
- `reviewType` — can't distinguish pre-publish vs report-qa review
- `status` — no completed/dismissed tracking
- `summary` — no overall summary text
- `riskLevel` — no risk assessment
- `suggestedQaNote` — no suggested note field
- `findingsJson` — structured v2 findings separate from legacy `issues` field
- `suggestedActions` — no action recommendations
- `createdById` — no creator tracking

---

## Available Inspection Context

From existing db.ts functions:
| Function | Data |
|---|---|
| `getJobById(id)` | jobNumber, title, jobType, status, priority, scheduledDate, completedAt, siteId, companyId, leadTechnicianId |
| `getSiteById(id)` | name, address, city, buildingId, fileNumber, customerOrgId, companyId |
| `getCustomerOrgById(id)` | name, contactName, email |
| `getWorkSiteInfoBySiteId(id)` | accessNotes, keyLocation, fireAlarmPanelLocation, monitoringCompany |
| `getInspectionStats(jobId)` | total, pass, fail, na, notTested |
| `getInspectionResultsByJob(jobId)` | per-device results with deviceType, location, result, notes |
| `getDeficienciesByJob(jobId)` | title, severity, systemCategory, description, correctiveAction, customerExplanation, status, deviceId |
| `getReportsByJob(jobId)` | reportNumber, status, aiSummary |
| `getUserById(id)` | name (for technician lookup) |
| `getRelevantKnowledgeContext(companyId, query, opts)` | KB snippets for RAG |

---

## Missing Pieces

1. **No `aiAssistant.runReportQAReview`** — LLM-powered structured review
2. **No `aiAssistant.getReviewsForEntity`** — list saved reviews for a job
3. **No `aiAssistant.dismissReview`** — mark review dismissed
4. **aiReviews missing v2 fields** — companyId, reviewType, status, summary, riskLevel, suggestedQaNote, findingsJson, suggestedActions, createdById
5. **No scoped getAiReviewsByJob** — existing function has no companyId filter
6. **ReportQA.tsx** has "Ask AI" (general) but no structured AI review panel
7. **QACheck.tsx** has logic check but no LLM-powered review

---

## Recommended Implementation

### Backend
- Migration 0051: extend `ai_reviews` with 9 new columns
- Add `getAiReviewById(id)` and `getAiReviewsByJobScoped(jobId, companyId)` to db.ts
- Add to `aiAssistantRouter`: `runReportQAReview`, `getReviewsForEntity`, `dismissReview`
- `runReportQAReview` builds rich inspection context + calls LLM with JSON schema → stores in ai_reviews → logs activity → creates notification if high/critical risk

### Frontend
- **ReportQA.tsx**: Add "AI Review" button per queue card → dialog with risk badge, findings, suggested QA note, previous reviews
- **QACheck.tsx**: Add LLM review panel (alongside existing logic check)

### Safety
- No auto-approve, no record mutation
- All output labeled as draft/advisory
- companyId from ctx.user only
- Graceful degradation if OPENAI_API_KEY missing
