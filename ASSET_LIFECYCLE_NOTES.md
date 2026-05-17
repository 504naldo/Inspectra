# Asset Lifecycle — Implementation Notes

## What Was Built

### Database
- **Migration:** `drizzle/migrations/0054_asset_lifecycle.sql`
  - 6 new columns on `devices`: `lifecycleStatus`, `assetCondition`, `replacementRecommended`, `replacementRecommendedAt`, `nextServiceDate`, `serviceNotes`
  - New table `asset_lifecycle_events` with indexes on deviceId, companyId, siteId
- Run migration manually on Railway after deploy.

### Backend (`server/routers/assetLifecycleRouter.ts`)
9 tRPC procedures (all `officeProcedure`):

| Procedure | Type | Purpose |
|---|---|---|
| `listAssets` | query | All active company devices with lifecycle indicators; filterable by site, category, status, condition, replacement flag |
| `getAssetLifecycle` | query | Full history for one device: inspection history, deficiency history, lifecycle events |
| `createLifecycleEvent` | mutation | Manual audit trail entry |
| `updateAssetLifecycleStatus` | mutation | Update status/condition/nextServiceDate/serviceNotes with activity logging |
| `markReplacementRecommended` | mutation | Flag device, set status, create deduped notification |
| `clearReplacementRecommendation` | mutation | Unset replacement flag, restore to "active" |
| `getSiteAssetSummary` | query | Quick summary counts per site |
| `getAssetsDueForService` | query | Devices with nextServiceDate <= today+30 |
| `getRepeatedFailureAssets` | query | Devices with repeated failures indicator |

### `computeIndicators` helper
Pure function — takes one device + deficiency arrays, returns:
- `openDeficiencyCount` — count of open/in_progress deficiencies
- `hasOpenCriticalDeficiency` — any open critical def
- `repeatedFailure` — ≥2 defs in last 24mo OR ≥2 open defs
- `notInspectedRecently` — no inspection in last 18 months
- `serviceOverdue` — nextServiceDate < today
- `batteryAgeWarning` — EMERGENCY_LIGHT with batteryYear ≥ 5 years old
- `extinguisherServiceDue` — FIRE_EXTINGUISHER with last6yr ≥ 6yr OR lastHST ≥ 12yr

### Frontend (`client/src/pages/admin/AssetLifecycle.tsx`)
- **Overview cards:** Total assets, Needs Service, Replacement Recommended, Repeated Failure, Service Overdue, Battery Warning, Extinguisher Due
- **Filter bar:** Site, Category, Lifecycle Status, Condition, Replacement Flag, text search
- **Asset list:** Expandable rows with status/condition badges, indicator chips, action buttons
- **Dialogs:**
  - View History (inspection history, deficiency history, lifecycle events in tabs)
  - Add Lifecycle Event (manual event entry)
  - Update Status (status, condition, next service date, service notes)
  - Mark for Replacement (with optional notes, triggers notification)
  - Clear Replacement Flag confirmation

### New DB functions in `server/db.ts`
- `getDevicesByCompany(companyId)` — all active devices for company
- `getOpenDeficienciesByDeviceIds(ids[])` — batch open/in_progress defs
- `getAllDeficienciesByDeviceIds(ids[])` — batch all defs
- `getDeficienciesByDevice(deviceId)` — per-device def history
- `getInspectionResultsByDevice(deviceId)` — per-device inspection history (joined with jobs)
- `getLifecycleEventsByDevice(deviceId)` — lifecycle event history
- `createLifecycleEvent(data)` — insert
- `getRecentLifecycleEventsByCompany(companyId, limit)` — recent events

## Safety Rules
- No automatic device deletion
- No auto-created work orders or quotes
- No auto-marking devices as replaced
- No compliance guarantees
- Not customer-facing
- Replacement flag is manual only; no automatic triggers
