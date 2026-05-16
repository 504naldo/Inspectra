# AI Inspection Review / Report QA — Implementation Notes

## Overview

Adds an LLM-powered AI inspection review layer to the existing Report QA workflow.
No existing behavior is changed. No records are auto-mutated.

---

## Files Changed

| File | Change |
|---|---|
| `AI_REPORT_QA_AUDIT.md` | NEW — pre-build audit |
| `drizzle/migrations/0051_ai_reviews_extended.sql` | NEW — migration for v2 columns |
| `drizzle/schema.ts` | Extended `aiReviews` table + `AiReviewFinding` type |
| `server/db.ts` | Added `getAiReviewById`, `getAiReviewsByJobScoped` |
| `server/routers/aiAssistantRouter.ts` | Added `runReportQAReview`, `getReviewsForEntity`, `dismissReview` |
| `client/src/pages/admin/ReportQA.tsx` | AI Review button + dialog on each QueueCard |
| `client/src/pages/admin/QACheck.tsx` | AI Report Review card (alongside existing logic check) |

---

## Backend — New tRPC Procedures (`aiAssistantRouter`)

### `aiAssistant.runReportQAReview` — officeProcedure
- Input: `{ jobId: number, reportId?: number }`
- Validates `job.companyId === ctx.user.companyId` — never trusts client-supplied scope
- Builds rich inspection context: job + site + WSI + customer + technician + stats + all inspection results + deficiencies + reports
- Computes missing-data flags: untested devices, failed without deficiency, deficiencies missing description/corrective action/customer explanation, no report, no technician
- Fetches 2 KB snippets via `getRelevantKnowledgeContext` for company-specific guidance
- Calls `invokeLLM` with structured JSON schema response format
- Saves to `ai_reviews` with all v2 fields (companyId scoped, reviewType="report_qa")
- Fire-and-forget `logActivity("ai_review.generated")`
- Creates notification for high/critical risk with deduplication (`hasUndismissedNotification`)
- Returns: `{ reviewId, riskLevel, summary, findings, suggestedQaNote, suggestedActions, missingDataWarnings }`

### `aiAssistant.getReviewsForEntity` — officeProcedure
- Input: `{ jobId: number }`
- Returns all `report_qa` reviews for the job, scoped to `ctx.user.companyId`
- Ordered by `createdAt DESC`, limit 10

### `aiAssistant.dismissReview` — officeProcedure
- Input: `{ reviewId: number }`
- Verifies `review.companyId === ctx.user.companyId` before any mutation
- Sets `status = "dismissed"` via `db.updateAiReview`
- Logs activity `"ai_review.dismissed"`

---

## AI Review Data Model (`ai_reviews` table — v2 extensions)

| Column | Type | Purpose |
|---|---|---|
| `companyId` | INT | Company scoping (security) |
| `reviewType` | VARCHAR(50) | `pre_publish` or `report_qa` |
| `status` | VARCHAR(50) | `completed` or `dismissed` |
| `summary` | TEXT | LLM overall summary |
| `riskLevel` | ENUM | `low`, `medium`, `high`, `critical` |
| `suggestedQaNote` | TEXT | Draft QA note for office use |
| `findingsJson` | JSON | `AiReviewFinding[]` — structured findings |
| `suggestedActions` | JSON | `string[]` — recommended next steps |
| `createdById` | INT | User who triggered the review |

Existing `issues` field preserved for backward compatibility with `pre_publish` reviews.

---

## Inspection Context Builder

Fetches in parallel for minimum latency:
- Job metadata (number, type, status, priority, dates)
- Site (name, address, building info)
- Work site info (access notes, panel location, monitoring company)
- Customer org (name, contact)
- Lead technician (name lookup)
- Inspection stats (total/pass/fail/NA/not-tested counts)
- All inspection results (device type, location, result, notes)
- All deficiencies (title, severity, category, description, corrective action, customer explanation, status)
- Reports (number, status, AI summary)
- 2 KB snippets via RAG

---

## Review Checks Performed by LLM

The system prompt instructs the model to identify:

1. **Completion gaps** — untested devices, incomplete inspection progress
2. **Deficiency quality** — missing descriptions, corrective actions, or customer explanations
3. **Report status** — no report generated, draft status, not sent
4. **Compliance risk** — critical/life-safety failures without proper documentation
5. **Internal consistency** — failed devices without deficiency records, mismatched data

Severity levels: `blocker` (must fix before approval), `warning` (should review), `info` (advisory)

---

## Frontend Integration

### ReportQA.tsx — QueueCard
- **AI Review button** (Sparkles icon) on every queue card
- On click: calls `aiAssistant.runReportQAReview` with `jobId` + optional `reportId`
- Dialog shows:
  - Risk level badge (color-coded: green/amber/orange/red)
  - Summary paragraph
  - Findings list grouped by severity (blockers → warnings → info)
  - Missing data warnings
  - Suggested QA note with one-click copy
  - Suggested actions list
  - Dismiss button → marks review dismissed in DB
- Existing "Ask AI" button and all QA action buttons unchanged

### QACheck.tsx — AI Report Review Card
- New "AI Report Review" card added between the logic check and deficiencies sections
- Run AI Review button calls `aiAssistant.runReportQAReview`
- Shows same structured output: risk badge, summary, findings, suggested QA note with copy, suggested actions, dismiss button
- Existing `ai.runQACheck` (logic-based) card fully preserved and unchanged

---

## Notifications / Activity Log

- `logActivity("ai_review.generated", ...)` — fire-and-forget on every review
- `logActivity("ai_review.dismissed", ...)` — on dismiss
- High/critical risk: creates notification (type=`ai_review_high_risk`, roleTarget=`office`, href=`/admin/report-qa`)
- Deduplication via `hasUndismissedNotification(companyId, "ai-review-{jobId}-{riskLevel}")` — prevents spam

---

## Safety Limits

- `companyId` always from `ctx.user.companyId` — never from client input
- No auto-approve, no report status mutation, no record changes
- All output labeled advisory ("AI suggestions are drafts only")
- Graceful degradation: if `OPENAI_API_KEY` is missing, `invokeLLM` throws and tRPC returns an error toast
- `dismissReview` verifies `review.companyId === companyId` before mutating
- No customer-facing AI exposure

---

## Manual Test Checklist

- [ ] Open `/admin/report-qa` — "AI Review" button visible on each queue card
- [ ] Click AI Review on a job with inspection data → dialog opens with risk badge, summary, findings
- [ ] Suggested QA note copy button copies to clipboard
- [ ] Dismiss review → toast confirms, review marked dismissed in DB
- [ ] Open `/admin/qa/:jobId` → "AI Report Review" card visible below existing QA Analysis card
- [ ] Run AI Review on QACheck page → structured output appears
- [ ] High/critical risk review → notification created (check notification bell)
- [ ] Activity log shows `ai_review.generated` entry
- [ ] Cross-company: review for company A not visible to company B (scoped by companyId)
- [ ] Existing `ai.runQACheck` (logic-based) still works unchanged on QACheck page
- [ ] Existing Report QA actions (Approve, Corrections, Mark Sent, Archive, Note) still work
- [ ] Existing "Ask AI" button on QueueCard still works

---

## Database Migration

Run manually on Railway after deploy:

```sql
ALTER TABLE `ai_reviews`
  ADD COLUMN `companyId` INT DEFAULT NULL,
  ADD COLUMN `reviewType` VARCHAR(50) NOT NULL DEFAULT 'pre_publish',
  ADD COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'completed',
  ADD COLUMN `summary` TEXT DEFAULT NULL,
  ADD COLUMN `riskLevel` ENUM('low','medium','high','critical') DEFAULT 'low',
  ADD COLUMN `suggestedQaNote` TEXT DEFAULT NULL,
  ADD COLUMN `findingsJson` JSON DEFAULT NULL,
  ADD COLUMN `suggestedActions` JSON DEFAULT NULL,
  ADD COLUMN `createdById` INT DEFAULT NULL;
```
