# Workflow Health / Bottleneck Monitor — Audit

**Date:** 2026-05-19

## Current State

No workflow health or bottleneck monitoring existed before this feature. The Admin Dashboard showed snapshot counts (overdue jobs, open deficiencies, etc.) but could not surface the full cross-module picture of where records were stuck.

## Problem

Operations staff had no single view to identify:
- Reports stuck in QA review for days
- Repair quotes sent to customers weeks ago with no response
- Approved work sitting idle without scheduling
- Invoices past their due date
- Payroll entries waiting for approval
- Parts requests blocking urgent jobs

Each module had to be navigated individually to find issues.

## Data Model Findings

| Table | Has companyId | Key Status Fields |
|---|---|---|
| `jobs` | yes | status, scheduledDate, completedAt |
| `reports` | **NO** — must join via jobs | status, updatedAt, approvedAt |
| `quotes` | yes | status, quoteType="repair", sentAt, approvedAt |
| `approvedWork` | yes | status (14 states), approvedAt, completedAt |
| `workOrders` | yes | status, priority, startedAt |
| `invoices` | yes | status, dueDate, sageExportStatus |
| `payrollTimeEntries` | yes | status, submittedAt, rejectedAt |
| `partsRequests` | yes | status, priority, neededByDate |

## Bottleneck Rules Implemented

### Report QA
- `status = "generated"` + `updatedAt < now - 2d` → stale in review (warning)
- `status = "corrections_required"` + `updatedAt < now - 3d` → not addressed (critical)
- `status = "approved"` + `updatedAt < now - 5d` → approved but not sent (warning)

### Repair Quotes (quoteType = "repair")
- `status = "draft"` + `createdAt < now - 7d` → idle draft (warning)
- `status in ["sent","viewed"]` + `sentAt < now - 14d` → no customer response (warning/critical)
- `status = "approved"` + `approvedAt < now - 5d` → not converted to work (critical)

### Approved Work
- `status in ["approved","ready_to_schedule"]` + `approvedAt < now - 7d` → not scheduled (warning)
- `status in ["awaiting_parts","parts_ordered"]` + `updatedAt < now - 30d` → parts blocked (warning)
- `status = "completed"` + `completedAt < now - 14d` → not invoiced (critical)

### Work Orders
- `status = "pending"` + `createdAt < now - 7d` → idle (warning)
- `priority = "urgent"` + `status in ["pending","scheduled"]` → unstarted urgent (critical)
- `status = "in_progress"` + `startedAt < now - 14d` → long-running (warning)

### Invoices
- `status = "draft"` + `createdAt < now - 7d` → idle draft (warning)
- `status = "overdue"` → past due (critical)
- `sageExportStatus = "error"` → export failure (critical)
- `status in ["sent","viewed"]` + `dueDate < now` → past due (critical)

### Payroll
- `status = "submitted"` + `submittedAt < now - 3d` → pending approval (warning/critical)
- `status = "rejected"` + `rejectedAt < now - 3d` → not resubmitted (critical)
- Grouped by userId to prevent flooding (one item per employee)

### Parts Requests
- `priority = "urgent"` + `status = "submitted"` + `submittedAt < now - 1d` → urgent unapproved (critical)
- `status in ["ordered","partially_received"]` + `neededByDate < now` → overdue delivery (critical)
- `status = "submitted"` + `submittedAt < now - 7d` → idle (warning)

## Safety Constraints

- Read-only — no status changes, emails, or record modifications
- All queries scoped to `ctx.user.companyId`
- Reports joined via jobs to ensure company scoping
- `officeProcedure` only (admin + office roles)

## Files Created

- `server/routers/workflowHealthRouter.ts` — backend query
- `client/src/pages/admin/WorkflowHealth.tsx` — full-page monitor
- Dashboard card in `client/src/pages/admin/Dashboard.tsx`
- Nav item in `client/src/components/AdminLayout.tsx`
- Route in `client/src/App.tsx`
