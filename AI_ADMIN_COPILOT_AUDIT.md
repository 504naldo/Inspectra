# AI Admin Copilot — Pre-Build Audit

## Existing AI Methods (aiAssistantRouter.ts)

| Procedure | Access | Purpose |
|---|---|---|
| `ask` | officeProcedure | General chat + record context + KB |
| `getContextSummary` | officeProcedure | Record summary preview |
| `draftCustomerMessage` | officeProcedure | Customer email drafts (type + tone) |
| `draftDeficiencyText` | officeProcedure | Structured deficiency field drafts |
| `runReportQAReview` | officeProcedure | Structured QA review stored in ai_reviews |
| `getReviewsForEntity` | officeProcedure | Fetch stored AI reviews |
| `dismissReview` | officeProcedure | Mark review dismissed |
| `draftDeficiencyFromNotes` | technicianProcedure | Draft from raw field notes |
| `improveDeficiencyText` | technicianProcedure | Rewrite existing deficiency text |
| `suggestRepairScope` | officeProcedure | Repair scope + parts search terms |
| `draftRepairQuoteSummary` | officeProcedure | Executive summary + approval note |
| `suggestPartsFromDeficiency` | officeProcedure | Parts catalog matching via LLM terms |
| `askFieldCopilot` | technicianProcedure | Field Q&A with technician-safe context |
| `summarizeJobForTechnician` | technicianProcedure | Structured job briefing |
| `checkBeforeSubmitForQA` | technicianProcedure | Pre-flight data check |

**Missing**: No admin-level ops briefing, no admin copilot with ops context built in, no `draftCustomerFollowUp` with purpose-based routing, no structured daily briefing.

---

## Existing Admin Dashboard Summary Data

`db.getOperationsSummary(companyId)` — used by `dashboard.getOperationsSummary` (officeProcedure) — returns:

```
snapshot:
  jobsToday, overdueJobs, openDeficiencies, reportsPendingReview,
  approvedWorkReadyToSchedule, repairQuotesPending, invoicesReadyForExport,
  completedThisWeek

attentionQueue[]: type, id, title, siteName, ageInDays, dueDate, severity, priority, status, link
  (types: overdue_job, deficiency, approved_work, repair_quote)

todaySchedule[]: id, title, jobNumber, siteName, status, priority, scheduledDate, link

approvedWorkByStatus: { approved, ready_to_schedule, scheduled, in_progress, ... }

invoiceSummary: { draft, sent, approved, paid, partial, overdue, void }

dataQuality: { sitesMissingBuildingId, sitesMissingFileNumber, sitesMissingCustomerOrg }

totalSites, totalJobs
```

**This is the primary context source for the Admin Copilot** — no new DB queries needed.

---

## Existing Notification Data

`trpc.notifications.list` + `trpc.notifications.getUnreadCount` — used by Dashboard.tsx.
Notification types include: `report_pending_review`, with severity levels `critical/urgent/warning/info`.
Available to admin/office via `notificationRouter`.

---

## Existing Compliance / Data Quality Data

- `complianceRouter`: `finalizeJob`, `verifyJobHash`, `getSiteRisks` (admin/office)
- Data quality: embedded in `getOperationsSummary.dataQuality` (sitesMissingBuildingId, sitesMissingFileNumber, sitesMissingCustomerOrg)
- ComplianceDashboard.tsx calls compliance queries; risk levels: compliant | watch | at_risk | critical

---

## What Context Can Be Reused

| Source | Reuse for Copilot |
|---|---|
| `db.getOperationsSummary` | Primary context for daily briefing + admin Q&A |
| `buildJobContext` | Per-job context for `draftCustomerFollowUp` |
| `buildSiteContext` | Per-site context |
| `buildDeficiencyContext` | Per-deficiency context |
| `buildRepairQuoteContext` | Per-quote context |
| `buildInvoiceContext` | Per-invoice context |
| `buildApprovedWorkContext` | Per-approved-work context |
| `fetchContext` | Dispatcher for all above |
| `getRelevantKnowledgeContext` | KB lookup (admin_office + ai_only) |

---

## Existing AIAssistant.tsx

- Full-page chat UI at `/admin/ai-assistant`
- Left sidebar: mode selector, KB toggle, context selector (type + ID), quick prompts, suggested action links
- Right: chat panel with MessageBubble component
- Uses `trpc.aiAssistant.ask.useMutation` and `trpc.aiAssistant.getContextSummary.useQuery`
- Modes: general, summarize, deficiency_help, report_qa, repair_quote, invoice, compliance, workflow_help
- Quick prompts: Today's urgent work, Sites at risk, Report QA summary, Workflow: approved work, Deficiency severity guide, Invoice check
- Suggested actions: 7 section links (Jobs, Sites, Report QA, Approved Work, Invoices, Compliance, KB)
- Disclaimer already present: "AI suggestions are drafts. Review before saving, sending, or relying on compliance decisions."

**Plan**: Add a "Copilot" tab to this page alongside the existing "Chat" tab. Do not restructure the existing chat.

---

## Recommended Minimal Implementation

### Backend (aiAssistantRouter.ts) — 3 new procedures

1. `getAdminBriefing` (officeProcedure) — structured briefing from ops data + LLM
2. `askAdminCopilot` (officeProcedure) — enhanced admin Q&A with ops context built in
3. `draftCustomerFollowUp` (officeProcedure) — structured follow-up with purpose routing

Plus: `buildAdminBriefingContext(companyId)` — compact text representation of `getOperationsSummary` result.

### Frontend

1. `AIAssistant.tsx` — add "Copilot" tab with: Daily Briefing (structured result display), Quick action buttons (askAdminCopilot), Draft Follow-up form (draftCustomerFollowUp)
2. `Dashboard.tsx` — add compact AI Copilot widget card with "Generate Daily Briefing" and "Open AI Copilot" before the footer

### No DB schema changes required

All context comes from existing DB functions. No new tables or columns needed.
