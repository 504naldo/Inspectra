# Offline Job Packet / Preload Center — Audit

**Date:** 2026-05-19

## Existing Offline Cache Behavior

### Storage Layer (`useOfflineStorage.ts`)
Uses **localStorage** with 4 keys:
- `fire_inspect_offline_results` — `OfflineInspectionResult[]` (result, notes, synced flag)
- `fire_inspect_offline_deficiencies` — `OfflineDeficiency[]` (title, severity, synced flag)
- `fire_inspect_cached_jobs` — `{ [jobId]: { data, cachedAt } }` basic job cache
- `fire_inspect_last_sync` — ISO timestamp

An older `client/src/lib/offlineStorage.ts` implements IndexedDB but is **unused**.

### Existing Job Cache (`fire_inspect_cached_jobs`)
Populated by `handleDownload` in `JobsList.tsx`, which calls `sync.getJobDataForOffline`:

**Fields returned:**
```
{ job, site, areas, devices, existingResults, deficiencies, downloadedAt }
```

**Missing from this cache:**
- `workSiteInfo` (key/lockbox, access notes, fire alarm panel, monitoring)
- `customerOrg`
- Inspection templates
- Previous unresolved deficiencies from prior job
- `lastUpdatedAt` / `cacheVersion` (no stale detection)

### Sync Queue Behavior
- Inspection results synced in batch via `inspectionResult.syncBatch`
- Deficiencies synced one-by-one via `deficiency.create`
- SyncScreen shows total pending count, not per-job breakdown
- `syncStatus.pendingResults` and `syncStatus.pendingDeficiencies` are global (not job-scoped)

### Submit for QA Guardrail (existing)
`JobDetails.tsx` lines 1483-1498 already warns if `syncStatus.pendingResults > 0 || syncStatus.pendingDeficiencies > 0`. Warning is advisory only (not blocking).

### Existing Offline Fallback in JobDetails
```typescript
const cachedData = (error && !data) ? getCachedJobData(jobId) : null;
const jobData = data || cachedData;
```
Falls back to the basic cache only when the tRPC query throws (not when offline is detected). `navigator.onLine` is not used to suppress the query.

## What Can Be Safely Cached for Technicians

**Safe to include:**
- Job: id, jobNumber, title, description, jobType, status, priority, scheduledDate, startedAt, completedAt, finalizedAt, technicianNotes, siteId, customerOrgId, companyId, updatedAt
- Site: id, name, address, city, state, postalCode, phone, notes
- Customer org: name, phone (no financial/billing data)
- WorkSiteInfo: contacts, access notes, key/lockbox code, parking, fire alarm panel, monitoring company/phone/account, sprinkler/emergency lighting/extinguisher notes, general notes
- Devices: full device list (no sensitive data)
- Deficiencies: current job's open/in_progress items
- Previous unresolved deficiencies from last completed job at this site
- Inspection template metadata (name, id) — full sections/items deferred to v2 (see limitations)
- `lastUpdatedAt`, `cacheVersion`

**Must NOT cache:**
- `job.officeNotes` (admin-only internal notes)
- Invoices, quotes, pricing, payroll data
- Sage export data, accounting identifiers
- Any OAuth tokens, acceptTokens, or secrets
- `workSiteInfo.sourceWorkbookName/sourceSheetName` (admin import metadata)
- `propertyManagerEmail`, `siteContactEmail` (not needed by field tech)

## Stale Detection Capability

Basic stale detection is possible: compare `job.updatedAt` from the server against the cached packet's `lastUpdatedAt`. However:
- Device list changes do not update `job.updatedAt` (missed by stale check)
- Template changes do not update `job.updatedAt` (missed)
- Workaround: technician can manually refresh packet before heading to site

## Recommended Minimal Implementation

1. New backend procedure `job.getOfflineJobPacket` returning the full safe packet
2. New localStorage key `fire_inspect_job_packets` storing packets with metadata
3. `useOfflineJobPacket(jobId)` hook for preload/refresh/remove
4. Offline Readiness card in `JobDetails.tsx`
5. Offline indicator badge in `Dashboard.tsx` job cards
6. Cached packets section in `SyncScreen.tsx`
7. Stale detection on `job.updatedAt` comparison only (v1 limitation)

## Limitations (v1)

- **Template sections/items not cached**: Full template structure (questions, options) is not included in the packet. Template inspection pages require connectivity.
- **Calendar-day stale detection only**: Device-level or template-level changes don't trigger stale status automatically.
- **localStorage size limit**: ~5MB per origin. Large jobs (500+ devices) may fail to cache. Error is caught gracefully.
- **No cross-tab sync**: Preloading in one tab won't update another tab's status until reload.
- **Inspection results from previous job not cached**: Only deficiency status from previous job is included.
