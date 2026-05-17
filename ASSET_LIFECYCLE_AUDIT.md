# Asset Lifecycle — Pre-Build Audit

## Existing Device Fields

| Field | Type | Notes |
|---|---|---|
| id, siteId, companyId | int | Core FK; companyId is on devices directly |
| category | ENUM | FIRE_EXTINGUISHER / EMERGENCY_LIGHT / FIRE_ALARM_DEVICE / SMOKE_ALARM / SPRINKLER / BACKFLOW |
| deviceType, manufacturer, model, serialNumber | varchar | Basic identity |
| installDate | timestamp | Set at creation; used for smoke alarm expiry calc |
| lastInspectionDate | timestamp | Updated on smoke alarm test result; NOT updated by fire-alarm inspection path |
| testResult | ENUM | pass/fail/no_access/na — last smoke alarm test only |
| mfgDate, lastHST, last6yr | varchar | Extinguisher manufacture + maintenance dates (strings, not typed dates) |
| batteryYear, batterySize, batteryCount, batteryReplaced | varchar/int | Emergency light battery fields |
| maintenanceRequired | varchar | Free-text flag |
| isActive | boolean | Soft-delete |
| location, floor, label, zone, circuitAddress | varchar | Physical placement |
| notes | text | General notes |

**Missing lifecycle fields:** lifecycleStatus, assetCondition, replacementRecommended, replacementRecommendedAt, nextServiceDate, serviceNotes

---

## Existing Inspection Result Links

- `inspection_results.deviceId` → device (NOT NULL for fire-alarm, nullable for others)
- `inspection_results.result` → pass/fail/na/not_tested
- `inspection_results.testedAt` → when the test was recorded
- `inspection_results.jobId` → links to the inspection job
- No per-device query function exists yet — only per-job queries

---

## Existing Deficiency Links

- `deficiencies.deviceId` → device (nullable — not all deficiencies link to a specific device)
- `deficiencies.severity` → critical/major/minor/observation
- `deficiencies.status` → open/in_progress/resolved/closed/deferred/quoted
- No per-device deficiency query function exists yet

---

## Existing Repair/Work Order Links

- Approved Work links to `deficiencyId`, `quoteItemId` — NOT directly to `deviceId`
- Work Orders link to `siteId` / `jobId` — NOT to `deviceId`
- Repairs (`repairs` table) link to `deficiencyId` only
- No direct device → repair chain — must traverse: device → deficiency → repair/approved_work

---

## Existing Maintenance Dates

| Field | Where | Notes |
|---|---|---|
| `lastInspectionDate` | devices | Set only on smoke alarm test; fire-alarm path doesn't update it |
| `mfgDate` | devices | String "YYYY" or "YYYY-MM" |
| `lastHST` | devices | String, hydrostatic test year |
| `last6yr` | devices | String, 6-year maintenance year |
| `batteryYear` | devices | String, battery install year |
| `batteryReplaced` | devices | String, last battery replaced year |
| `completedAt` | jobs | When the inspection job was completed |
| `resolvedAt` | deficiencies | When a deficiency was resolved |

---

## Existing Replacement-Related Fields

None. No `replacementRecommended`, `expectedReplacementDate`, or `lifecycleStatus` exists.

---

## Missing Pieces

1. **Device lifecycle status** — no way to mark a device as needs_service / repair_required / replacement_recommended
2. **Asset condition** — no good/fair/poor/failed rating
3. **Replacement flag** — no boolean + timestamp for "replacement recommended"
4. **Next service date** — no typed date for upcoming planned maintenance
5. **Per-device inspection history query** — only per-job queries exist
6. **Per-device deficiency history query** — only per-job queries exist
7. **`asset_lifecycle_events` table** — no manual audit trail for lifecycle events
8. **Company-wide device list** — `getDevicesByCompany()` does not exist; only per-site

---

## What Can Be Reused

| Existing | Reused For |
|---|---|
| `devices.companyId` | Filter by company without site join |
| `inspectionResults.deviceId` | Per-device inspection history |
| `deficiencies.deviceId` | Per-device deficiency history |
| `devices.mfgDate, last6yr, lastHST` | Extinguisher maintenance due indicator |
| `devices.batteryYear` | Emergency light battery age indicator |
| `devices.lastInspectionDate` | Last-inspected-date indicator (smoke alarms) |
| `jobs.completedAt` | Actual inspection date per job |
| `logActivity` | Audit log for lifecycle changes |
| `createNotification + hasUndismissedNotification` | Replacement/service alerts |

---

## Recommended Minimal Implementation

- Add 6 lifecycle columns to `devices` table (migration required)
- Add `asset_lifecycle_events` table (new; 2 CREATE TABLE statements in migration)
- New `assetLifecycleRouter` with 8 procedures
- Single `AssetLifecycle.tsx` page with overview, filters, asset list, and history dialog
- Nav entry under "More"
