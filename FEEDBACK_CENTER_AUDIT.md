# Feedback Center Audit — v1

## Existing Feedback/Support Infrastructure

**No existing feedback or support table found.** The following tables were checked:
- `notifications` — operational alerts (job submissions, QA notifications); NOT used for user feedback
- `activityEvents` — audit trail of mutations; NOT for user-facing feedback
- `knowledgeBase` — internal documentation articles; no feedback mechanism
- No `feedback`, `bug_reports`, `support_tickets`, or similar tables exist

## Existing Notification System

`notifications` table exists and is actively used:
- Fields: id, companyId, userId, roleTarget, entityType, entityId, type, severity, title, message, href, isRead, readAt, isDismissed, dismissedAt, dedupeKey, createdAt, expiresAt, metadataJson
- Severities: `info`, `warning`, `urgent`, `critical`
- `db.createNotification()` and `db.hasUndismissedNotification()` helpers exist
- `notificationRouter` with `list`, `getUnreadCount`, `markRead`, `markAllRead`
- Unread count badge in AdminLayout header
- **Plan**: notify admins via this system when urgent feedback is submitted

## Existing Activity Logging

`logActivity()` in `server/activityLogger.ts`:
- Fire-and-forget (never throws)
- Uses ctx.user for companyId and actor info (never trusts client)
- **Plan**: log feedback submitted and status changed events here

## Layouts Where FeedbackButton Can Be Added

### AdminLayout (`client/src/components/AdminLayout.tsx`)
- Header: brand + desktop nav dropdowns + GlobalSearch + right side (username, bell, logout, mobile toggle)
- **Best placement**: small ghost button before the bell icon in the right-side cluster
- Nav: "Tools" group has Setup Wizard, Access Control, AI Assistant, etc.
- **Best nav placement**: add "Feedback Center" to the Tools group

### Technician Dashboard (`client/src/pages/technician/Dashboard.tsx`)
- Header: brand (Inspectra shield) + right side (online badge, logout)
- **Best placement**: icon-only FeedbackButton between online badge and logout

### JobDetails (`client/src/pages/technician/JobDetails.tsx`)
- Already has FieldCopilotPanel in header. Adding another button would be too crowded.
- **Skip** — technicians primarily use Dashboard as their home base.

## Role Access Patterns

```
protectedProcedure     — any authenticated user (including customers)
technicianProcedure    — admin, office, technician (not customer)
officeProcedure        — admin, office
adminOrOfficeProcedure — admin, office
adminProcedure         — admin only
```

**Feedback access model:**
- Submit: `technicianProcedure` (all internal roles; customers excluded from internal feedback)
- View own: `technicianProcedure`
- List/manage all: `adminOrOfficeProcedure`
- Route `/admin/feedback`: `allowedRoles: ['admin', 'office']`

## Recommended Minimal Implementation

### Data Model
New `feedback_items` table with:
- companyId scoping (never trust client)
- submittedById (from ctx.user)
- type, status, priority as enums
- title, description, pageUrl, routeName, entityType, entityId
- browserInfo, deviceInfo (safe, generic — no secrets)
- adminNotes, assignedToId, resolvedAt, resolvedById

### Backend
`feedbackRouter.ts` with:
- `submit` (technicianProcedure)
- `mySubmissions` (technicianProcedure)
- `list` (adminOrOfficeProcedure) with filters
- `get` (adminOrOfficeProcedure)
- `updateStatus`, `updatePriority`, `assign`, `addAdminNote`, `close` (adminOrOfficeProcedure)

### Frontend
1. `FeedbackButton.tsx` — reusable dialog trigger, auto-captures route + browser info
2. `FeedbackCenter.tsx` — admin page at `/admin/feedback` with stats, filters, list, detail sheet

### Notifications
- Urgent feedback → notify admins via existing notification system
- No spam for normal feedback (low/medium/high priorities)

### Safety Limits
- companyId always from ctx.user.companyId
- No cross-company queries
- browserInfo strips to 500 chars max, uses navigator.userAgent (no tokens/cookies)
- No screenshot capture
- No customer role access
- Not a public support portal
