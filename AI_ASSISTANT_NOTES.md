# AI Assistant v1 — Implementation Notes

## Files Changed

### New Files
- `server/routers/aiAssistantRouter.ts` — Backend: 4 procedures (ask, getContextSummary, draftCustomerMessage, draftDeficiencyText)
- `client/src/pages/admin/AIAssistant.tsx` — Chat UI page with sidebar, quick prompts, suggested actions
- `AI_ASSISTANT_AUDIT.md` — Pre-implementation audit of existing AI infra and context sources

### Modified Files
- `server/routers.ts` — Registered `aiAssistantRouter` at key `aiAssistant`
- `client/src/App.tsx` — Added route `/admin/ai-assistant`
- `client/src/components/AdminLayout.tsx` — Added "AI Assistant" nav item (Bot icon, secondary nav)
- `client/src/pages/admin/ReportQA.tsx` — Inline "Ask AI" button on each report card
- `client/src/pages/admin/RepairQuoteDetail.tsx` — Inline "Draft with AI" button in header
- `client/src/pages/admin/InvoiceDetail.tsx` — Inline "Draft Note" button in header

---

## AI Routes (Backend)

| Procedure | Type | Description |
|---|---|---|
| `aiAssistant.ask` | mutation | General chat with optional record context. Supports 8 modes. |
| `aiAssistant.getContextSummary` | query | Returns structured text summary of a record for sidebar preview |
| `aiAssistant.draftCustomerMessage` | mutation | Drafts subject + body for customer-facing email. Returns `{subject, body, isDraft, disclaimer}` |
| `aiAssistant.draftDeficiencyText` | mutation | Structured deficiency writing: description, customerExplanation, correctiveAction, severitySuggestion |

All procedures are `officeProcedure` (admin + office only).

---

## Frontend Page — `/admin/ai-assistant`

- **Chat panel**: multi-turn message history (session-only, not persisted to DB)
- **Mode selector**: general, summarize, deficiency_help, report_qa, repair_quote, invoice, compliance, workflow_help
- **Context picker**: optional entity type + ID → preview snippet in sidebar
- **Quick prompts**: 6 pre-built prompts for common office tasks
- **Suggested action links**: non-destructive navigation to Jobs, Sites, Report QA, Approved Work, Invoices, Compliance
- **Disclaimer banner**: permanent amber warning that AI output is a draft

---

## Inline AI Buttons

| Page | Button | Procedure | Context |
|---|---|---|---|
| Report QA (`/admin/report-qa`) | "Ask AI" on each report card | `ask` (mode=report_qa) | contextType="report", contextId=reportId |
| Repair Quote Detail | "Draft with AI" in header | `ask` (mode=repair_quote) | contextType="repair_quote", contextId=quoteId |
| Invoice Detail | "Draft Note" in header | `draftCustomerMessage` (type=invoice) | entityId=invoice.id |

All inline dialogs have a "Copy to clipboard" button and a disclaimer. Nothing auto-sends or mutates records.

---

## Context Types Supported

| Type | Data Included |
|---|---|
| `job` | jobNumber, title, type, status, site, customer, device stats, deficiency counts, report status |
| `site` | name, address, customer org, building ID, file number, access notes, FA panel, monitoring |
| `deficiency` | title, severity, system category, device, observed issue, description, corrective action |
| `report` | fetched via `fetchContext("report", id, companyId)` — delegated to generic handler |
| `repair_quote` | quoteNumber, status, total, site, customer, line items, scope wording, notes |
| `approved_work` | title, type, status, scheduled date, site, customer, description |
| `invoice` | invoiceNumber, status, total, due date, line items, notes |
| `compliance` | delegated to generic handler |

---

## Safety Protections

1. **All procedures are `officeProcedure`** — technicians cannot call any AI assistant endpoint
2. **`companyId` always from `ctx.user.companyId!`** — never trusted from client payload
3. **Every context builder verifies `record.companyId === companyId`** before returning data
4. **No destructive mutations** — all procedures are read-only or draft-only
5. **No email sending** — `draftCustomerMessage` returns text only; no smtp/gmail calls
6. **No record approval, status changes, or closes** — AI can only recommend
7. **API key is `OPENAI_API_KEY` server-side only** — never sent to client; all AI calls go through `invokeLLM()` in `server/_core/llm.ts`
8. **Activity logging** — every `ask` and `draftCustomerMessage` call is logged via `logActivity()` for audit trail
9. **Internal notes filtered** — `draftCustomerMessage` uses only public-safe context fields; `internalNotes` are not included in customer draft context

---

## Environment Variables Required

| Variable | Location | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Railway server env | OpenAI Chat Completions API key |

No new env vars were added — this reuses the existing `ENV.openaiApiKey` already set up in `server/_core/env.ts`.

---

## Manual Test Checklist

- [ ] Navigate to `/admin/ai-assistant` as office user — page loads with sidebar + chat
- [ ] Send a general message — AI responds in the chat bubble
- [ ] Use "Today's urgent work" quick prompt — response appears
- [ ] Set Context = Job, enter a valid job ID — sidebar preview shows job data
- [ ] Send question with job context — AI references job data in response
- [ ] Navigate to `/admin/report-qa` — "Ask AI" button visible on report cards with reportId
- [ ] Click "Ask AI" on a report — dialog opens with AI summary, Copy button works
- [ ] Navigate to a Repair Quote detail — "Draft with AI" button visible in header
- [ ] Click "Draft with AI" — dialog opens with scope summary, Copy button works
- [ ] Navigate to an Invoice detail — "Draft Note" button visible in header
- [ ] Click "Draft Note" — dialog opens with subject + body, Copy button works
- [ ] Verify no AI endpoint accessible to technician role (403)
- [ ] Verify no cross-company data leakage (companyId check in context builders)
- [ ] Verify no email is sent anywhere in the AI flow
