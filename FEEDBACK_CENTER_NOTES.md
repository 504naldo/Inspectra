# Feedback Center — v1 Delivery Notes

## What Was Built

An internal feedback and bug-reporting system for Inspectra staff (admins, office, and technicians). Not a public support portal.

## Files Created / Modified

### New Files
- `drizzle/migrations/0062_feedback_items.sql` — SQL migration for the `feedback_items` table
- `server/routers/feedbackRouter.ts` — tRPC router with submit, list, get, updateStatus, updatePriority, assign, addAdminNote, close
- `client/src/components/FeedbackButton.tsx` — Reusable dialog button; auto-captures page URL, browser info, device info
- `client/src/pages/admin/FeedbackCenter.tsx` — Admin management page with stats cards, filters, list, detail sheet

### Modified Files
- `drizzle/schema.ts` — Added `feedbackItems` table + enums (FEEDBACK_TYPES, FEEDBACK_STATUSES, FEEDBACK_PRIORITIES)
- `server/routers.ts` — Registered `feedbackRouter`
- `client/src/App.tsx` — Added `/admin/feedback` route (admin + office only)
- `client/src/components/AdminLayout.tsx` — Added FeedbackButton to header; added "Feedback Center" to Tools nav group
- `client/src/pages/technician/Dashboard.tsx` — Added icon-only FeedbackButton between online badge and logout

## Database Migration

Run `drizzle/migrations/0062_feedback_items.sql` manually on Railway (PlanetScale).

## Role Access

| Action | Required role |
|---|---|
| Submit feedback | admin, office, technician |
| View own submissions | admin, office, technician |
| List / manage all | admin, office |
| Admin UI at `/admin/feedback` | admin, office |

## Notification Behavior

- Urgent priority submissions → one admin notification per item via `db.createNotification()` with `roleTarget: 'admin'`
- Deduped by `dedupeKey: 'feedback-urgent-{id}'`
- No notifications for low / medium / high priority items

## Safety Constraints

- `companyId` always from `ctx.user.companyId` — never from client payload
- No cross-company queries
- `browserInfo` capped at 500 chars; captures UA + platform + language only (no tokens, cookies, localStorage)
- Customer role excluded (`technicianProcedure` minimum)
- No screenshot capture

## Manual Test Checklist

- [ ] Technician can open FeedbackButton from Dashboard and submit a bug report
- [ ] Admin sees FeedbackButton in AdminLayout header and can submit feedback
- [ ] Submitted urgent feedback creates a notification for admins
- [ ] Admin navigates to `/admin/feedback` via Tools > Feedback Center
- [ ] Stats cards show correct counts (New, In Progress, Urgent Open, Resolved/Week, Mobile, Report Issues)
- [ ] Filters work: status, type, priority dropdowns narrow the list
- [ ] Clicking a feedback row opens the detail sheet
- [ ] Admin can change status, priority, assign to a user, add notes, and close items
- [ ] Non-admin (office) can access FeedbackCenter; admin-only users tab is hidden
- [ ] Technician cannot access `/admin/feedback` (redirected by ProtectedRoute)
