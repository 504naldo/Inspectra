# AI Admin Copilot — Implementation Notes

## Backend Methods Added

All new procedures in `server/routers/aiAssistantRouter.ts`.

### `aiAssistant.getAdminBriefing` (`officeProcedure`)
- **Purpose**: Structured daily operations briefing from live ops data
- **Input**: `timeframe` (today | week | overdue | all, default: today)
- **Output**: `summary`, `topPriorities[]`, `risks[]`, `suggestedActions[]`, `relatedLinks[{label,href,reason}]`
- **Context**: `buildAdminBriefingContext` (wraps `db.getOperationsSummary`) + KB (admin_office + ai_only, limit 2)
- **Access**: admin + office roles only (`officeProcedure`)
- **Safety**: No record mutations. `href` values constrained to known admin paths.

### `aiAssistant.askAdminCopilot` (`officeProcedure`)
- **Purpose**: Admin Q&A with full operations context always included
- **Input**: `message` (max 2000), `mode` (optional: daily_briefing | follow_up | compliance | reports | invoices | approved_work | scheduling | data_quality | customer_message | workflow_help)
- **Output**: `answer`, `suggestedActions[]`, `relatedRecords[{type,label,href}]`, `warnings[]`, `contextUsed`
- **Context**: `buildAdminBriefingContext` + KB (limit 3)
- **Access**: admin + office roles only

### `aiAssistant.draftCustomerFollowUp` (`officeProcedure`)
- **Purpose**: Customer-facing follow-up email draft for a specific record and purpose
- **Input**: `entityType` (job|site|deficiency|repair_quote|invoice|approved_work), `entityId`, `purpose` (report_ready|quote_followup|invoice_reminder|deficiency_followup|approved_work_scheduling|compliance_notice)
- **Output**: `subject`, `body`, `warnings[]`, `isDraft: true`
- **Context**: `fetchContext` (existing dispatcher, returns per-record context)
- **Access**: admin + office roles only
- **Safety**: Never sends. Always returns `isDraft: true`. User must copy and send manually.

---

## Context Builder Added

### `buildAdminBriefingContext(companyId)` — `server/routers/aiAssistantRouter.ts`
- Calls `db.getOperationsSummary(companyId)`
- Returns a compact text block: snapshot counts, top 10 attention queue items, invoice summary, approved work status, data quality issues, totals
- Used by both `getAdminBriefing` and `askAdminCopilot`

---

## System Prompt Added

### `ADMIN_COPILOT_SYSTEM_PROMPT` — `server/routers/aiAssistantRouter.ts`
- Distinct from `SYSTEM_PROMPT` (general assistant) and `FIELD_COPILOT_SYSTEM_PROMPT` (technician)
- Rules: no record modifications, no auto-approve, no auto-send, prefer bullet points, label drafts, flag compliance risks as requiring human judgment, fire protection operations questions only

---

## Frontend Changes

### `client/src/pages/admin/AIAssistant.tsx`
- Added "Admin Copilot" tab alongside existing "Chat" tab using shadcn `Tabs`
- Copilot tab contains three sections:

**Daily Briefing**
- Timeframe selector (today | this week | overdue | all)
- Generate button → calls `getAdminBriefing`
- Structured result: summary, top priorities, risks (amber), suggested actions, related links as badge links

**Ask the Copilot**
- 6 quick-prompt buttons in a 2-column grid
- Chat message thread with user/assistant bubbles
- Suggested actions list per assistant response
- Related records as clickable badges
- Warnings in amber
- Textarea input + Send button (Enter key support)

**Draft Customer Follow-Up**
- 3-column form: entity type selector + record ID input + purpose selector
- Generate Draft button
- Result: subject field + email body (with copy button) + draft warning

### `client/src/pages/admin/Dashboard.tsx`
- Added compact AI Copilot widget card before the footer summary
- "Generate Daily Briefing" button → calls `getAdminBriefing`, shows top 2 priorities inline
- "Open" link → navigates to `/admin/ai-assistant`
- State local to Dashboard (no global store)

---

## Safety Rules

| Rule | Enforcement |
|---|---|
| Admin/office only | `officeProcedure` on all 3 procedures |
| Never trust client companyId | `companyId = ctx.user.companyId!` always |
| No cross-company data | All DB calls scoped to `companyId` |
| No record mutations | Procedures are read-only; no `db.update*` or `db.create*` calls |
| No sending emails | `draftCustomerFollowUp` returns draft text only |
| No auto-approve | AI cannot approve reports, quotes, or invoices |
| No closing deficiencies | AI cannot change deficiency status |
| No marking invoices paid/exported | AI has no invoice mutation access |
| AI key missing | `invokeLLM` handles missing key; tRPC returns error; toast shown in UI |
| No hallucinated links | `href` constrained to VALID_HREFS list in prompt |

---

## Activity Logging

| Procedure | eventType | entityType |
|---|---|---|
| `getAdminBriefing` | `ai_assistant.adminBriefingGenerated` | company |
| `askAdminCopilot` | `ai_assistant.adminCopilotAsked` | company |
| `draftCustomerFollowUp` | `ai_assistant.customerFollowUpDrafted` | entityType |

All fire-and-forget, metadata-only.

---

## No DB Schema Changes

All context comes from existing DB functions (`getOperationsSummary`, `fetchContext`, `getRelevantKnowledgeContext`). No new tables or columns.

---

## Manual Test Checklist

### Admin Briefing
- [ ] Open `/admin/ai-assistant` → Copilot tab → Generate (timeframe: Today)
- [ ] Confirm summary, priorities, risks, and suggested actions appear
- [ ] Confirm related links are valid admin paths (not hallucinated)
- [ ] Change timeframe to Overdue → regenerate → confirm output changes
- [ ] If AI key is missing: confirm error toast, no crash

### Ask Copilot
- [ ] Tap "What needs attention today?" quick prompt → answer appears
- [ ] Type a custom question → Enter to send → answer appears
- [ ] Confirm suggestedActions and relatedRecords render correctly
- [ ] Confirm nothing is saved or modified after any interaction

### Draft Customer Follow-Up
- [ ] Select Job, enter a valid job ID, purpose: Report Ready → Generate Draft
- [ ] Confirm subject and body appear; body is clearly labelled as draft
- [ ] Tap copy button → confirm clipboard populated
- [ ] Confirm no email is sent automatically

### Dashboard Widget
- [ ] Open `/admin` → confirm AI Copilot card visible before footer
- [ ] Tap "Generate Daily Briefing" → loading spinner → summary + top 2 priorities appear
- [ ] Tap "Open" → navigates to `/admin/ai-assistant`

### Access Control
- [ ] Log in as technician → confirm `/admin/ai-assistant` is not accessible (admin route)
- [ ] All three new procedures require office/admin role — verify FORBIDDEN for technician calls
