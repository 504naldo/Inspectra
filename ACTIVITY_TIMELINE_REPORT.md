# Activity Timeline / Audit Trail — Phase 1 Implementation Report

**Date:** 2026-05-16  
**Branch:** `claude/continue-work-vt04A`  
**Status:** Complete

---

## Summary

Phase 1 adds a lightweight, fire-and-forget activity log to Inspectra. Every key workflow mutation now records a human-readable event. A reusable timeline component renders the log on four detail pages.

---

## Files Created

| File | Purpose |
|---|---|
| `drizzle/migrations/0046_activity_events.sql` | Migration: `activity_events` table with three indexes |
| `server/activityLogger.ts` | Fire-and-forget `logActivity()` helper; never throws |
| `server/routers/activityRouter.ts` | tRPC router: `listForEntity`, `listRecentByCompany` |
| `client/src/components/ActivityTimeline.tsx` | Reusable timeline UI component |
| `ACTIVITY_TIMELINE_REPORT.md` | This file |

## Files Modified

### Schema & DB
- **`drizzle/schema.ts`** — Added `activityEvents` table, `ActivityEvent`, `InsertActivityEvent` types
- **`server/db.ts`** — Added `getActivityEventsForEntity()` and `getRecentActivityByCompany()` queries; added `activityEvents` to imports

### Backend Routers (logging added)
| Router | Events Logged |
|---|---|
| `server/routers/jobRouter.ts` | created, status_changed, scheduled/rescheduled, started, completed, assigned (lead), assignment_changed (setTechnicians), updated (unassign) |
| `server/routers/workOrderRouter.ts` | scheduled (update), completed |
| `server/routers/approvedWorkRouter.ts` | created, created (from quote item), status_changed, linked (work order created), converted (invoice created), closed |
| `server/routers/invoiceRouter.ts` | created, status_changed, paid, voided, exported (batch + manual) |
| `server/routers/repairQuoteRouter.ts` | created, finalized (status_changed), status_changed (sent/accepted/declined) |
| `server/routers/companySettingsRouter.ts` | updated |
| `server/routers/serviceScheduleRouter.ts` | status_changed (tracking), linked (job created from tracking) |
| `server/routers.ts` | Registered `activity: activityRouter` |

### Frontend Pages
| Page | Change |
|---|---|
| `client/src/pages/admin/RepairQuoteDetail.tsx` | Added `<ActivityTimeline entityType="repair_quote" entityId={quoteId} />` card at bottom |
| `client/src/pages/admin/ApprovedWorkDetail.tsx` | Added `<ActivityTimeline entityType="approved_work" entityId={id} />` card before closing AdminLayout |
| `client/src/pages/admin/InvoiceDetail.tsx` | Added `<ActivityTimeline entityType="invoice" entityId={id} />` card before dialogs |
| `client/src/pages/admin/JobDetails.tsx` | Added "Activity" tab with `<ActivityTimeline entityType="job" entityId={parseInt(jobId!)} />` |

---

## Database Schema

```sql
CREATE TABLE `activity_events` (
  `id`                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId`         INT NOT NULL,
  `actorUserId`       INT,
  `actorName`         VARCHAR(255),
  `actorRole`         VARCHAR(64),
  `entityType`        VARCHAR(64) NOT NULL,
  `entityId`          INT NOT NULL,
  `relatedEntityType` VARCHAR(64),
  `relatedEntityId`   INT,
  `eventType`         VARCHAR(64) NOT NULL,
  `title`             VARCHAR(255) NOT NULL,
  `description`       TEXT,
  `oldValue`          TEXT,
  `newValue`          TEXT,
  `metadata`          JSON,
  `createdAt`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `activity_events_companyId_idx` (`companyId`),
  INDEX `activity_events_entity_idx` (`entityType`, `entityId`),
  INDEX `activity_events_createdAt_idx` (`createdAt`)
);
```

**Run this migration manually on Railway** (PlanetScale does not support ALTER TABLE in transactions).

---

## Safety & Scoping Rules Verified

| Rule | Status |
|---|---|
| No secrets logged (Google tokens, DATABASE_URL, raw file contents) | ✅ — only human-readable strings logged |
| No cross-company exposure | ✅ — all queries filter by `ctx.user.companyId` |
| Logging never breaks mutations | ✅ — all calls use `void logActivity(...)`, internal try/catch |
| No new dependencies | ✅ — uses existing Drizzle + DB connection |
| companyId from `ctx.user` only | ✅ — never trusts client input |
| Zod validation on router inputs | ✅ — `ENTITY_TYPES` enum, `limit` min/max |
| Finalized job immutability unaffected | ✅ — logging is after all guards |

---

## ActivityTimeline Component

`client/src/components/ActivityTimeline.tsx`

- Coloured dot per event type (created=blue, status_changed=purple, started=orange, completed/paid=green, voided/cancelled=red, exported=teal, assigned=amber)
- Relative timestamps ("5m ago") with full datetime on hover
- Old → new value display (strikethrough red → green)
- Actor name with user icon
- Shows "No activity recorded yet" for empty state
- Loading skeleton and error state

---

## pnpm check

`pnpm check` exits with two pre-existing errors (`Cannot find type definition file for 'node'` and `'vite/client'`) that exist on the unmodified `main` branch — verified by stashing all changes and re-running. These are environment setup issues in `tsconfig.json`, not code errors. No new TypeScript errors were introduced.

---

## Deferred

- **Dashboard "Recent Activity" feed** (Part 7) — low priority per spec, can be added in Phase 2
- **GST/PST live rates** — deferred in BUSINESS_RULES_AUDIT.md; requires making `calcItemTotals` async
- **`report` entity type** — listed in ENTITY_TYPES enum but no logging added to reportRouter (reports are generated, not mutated in meaningful ways)
