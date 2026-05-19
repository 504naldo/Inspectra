# Workflow Health / Bottleneck Monitor v1 — Delivery Notes

**Date:** 2026-05-19

## What Was Built

A read-only operational monitor at `/admin/workflow-health` that surfaces stuck or delayed records across 7 modules: Report QA, Repair Quotes, Approved Work, Work Orders, Invoices, Payroll, and Parts Requests.

## Components

### Backend
- `server/routers/workflowHealthRouter.ts` — `officeProcedure` (admin+office)
  - `workflowHealth.getSummary` — single query, returns overview counts + grouped bottleneck items
  - All queries scoped by `ctx.user.companyId`
  - Reports joined via `jobs` (no direct companyId on reports table)
  - Payroll grouped by userId to prevent entry-level flooding

### Frontend
- `client/src/pages/admin/WorkflowHealth.tsx` — full-page view
  - 7 overview metric cards
  - Module-grouped bottleneck list with severity badges
  - Each item shows: title, customer/site, reason, suggested next action, age, link to the record
  - Clean empty state when no bottlenecks found
- `client/src/pages/admin/Dashboard.tsx` — small summary card added before AI Copilot widget
  - Shows total bottlenecks + critical count
  - Links to full `/admin/workflow-health` page
- `client/src/components/AdminLayout.tsx` — "Workflow Health" added to Operations nav group
- `client/src/App.tsx` — route `/admin/workflow-health` added

## Severity Levels

| Level | Color | Criteria |
|---|---|---|
| critical | Red | Corrections unaddressed, approved work not invoiced, overdue invoices, urgent unstarted, rejected payroll, urgent parts unapproved |
| warning | Amber | Stale review, awaiting customer response, unscheduled work, idle drafts |
| info | Blue | Reserved for future use |

## Safety

- **Read-only** — no status changes, emails, deletions, or any record modifications
- Scoped to `ctx.user.companyId` on every query
- Not exposed to technicians or customers

## Known Limitations / Future Ideas

- Business-day awareness (currently uses calendar days)
- Configurable thresholds per company
- Email digest / push notification when critical count changes
- Export to CSV
- Filtering by module, severity, or date range
