# Offline Sync Hardening v1 — Implementation Notes

## v2 Update — Real Offline Queues for Deficiencies, Checklist & Template Responses

Items 4 and 5 below, and the "Deficiency Offline Queue" gap note, described a v1
design where deficiencies and checklist responses were intentionally online-only
("honest disabled controls" rather than a local queue). That has since changed:

- **DeficiencyEditor.tsx** now calls `saveOfflineDeficiency` when offline (queued
  in `useOfflineStorage`, synced one-by-one via `deficiency.create` in SyncScreen).
- **ChecklistCompletion.tsx** (CAN/ULC-S536 checklist) now persists each
  online/offline edit via `saveOfflineChecklistResponse`/`OfflineChecklistResponse`,
  synced via `checklist.bulkSaveResponses`.
- **TemplateFormRenderer.tsx** (generic inspection-template responses) now has the
  same offline queue via `saveOfflineTemplateResponse`/`OfflineTemplateResponse`,
  synced one-by-one via `inspectionTemplate.saveResponse` (no bulk endpoint exists
  for templates). The nested deficiency-logging dialog inside it is still
  online-only by design (disabled with a tooltip when offline), since that always
  requires a server round-trip.

All three queues follow the same pattern: a `localId`-keyed CRUD set in
`useOfflineStorage.ts`, an "overlay unsynced edits on top of server data" effect on
load, and a "mark-synced-on-successful-online-save" call so a later bulk sync
can't replay a stale local copy over a fresher server value. See
`OFFLINE_SYNC_AUDIT.md` for the current, accurate per-flow table.

## What Was Changed

### 1. `client/src/hooks/useOfflineStorage.ts`
- Added `clearSyncedDeficiencies()` method (mirrors `clearSyncedResults` for the deficiency store)
- Exposed in hook return value

### 2. `client/src/components/OfflineBanner.tsx`
- Now shows total pending count from **both** `mutationQueue` AND `useOfflineStorage` (inspection results + deficiencies)
- When online with pending offline-storage items, shows a link to `/tech/sync` to navigate to SyncScreen
- Shows last sync time when online and nothing is pending
- Existing mutationQueue auto-flush on reconnect is preserved

### 3. `client/src/pages/technician/SyncScreen.tsx`
- Shows **both** pending inspection results AND pending offline deficiencies
- Entity type labels: "Device Test" and "Deficiency" instead of just "Job # - Device #"
- For deficiencies: syncs one by one via `trpc.deficiency.create`; marks each succeeded as synced and clears
- Fixed original bug: now correctly marks inspection results synced by unique job IDs before clearing
- Shows error state with "Retry Failed Items" button when partial failures occur
- Counts total pending across both entity types

### 4. `client/src/pages/technician/DeficiencyEditor.tsx`
- Imports `useOnlineStatus`
- Shows amber offline warning banner when offline
- Disables both "Save Deficiency" and "Save & Add Another" buttons when offline
- Honest behavior: deficiencies require server-side creation (no offline queue for them)

### 5. `client/src/pages/tech/ChecklistCompletion.tsx`
- Imports `useOnlineStatus`
- Shows amber offline warning banner when offline
- Auto-save (per-item and comment-blur) is skipped when offline — local UI state is still updated
- "Save All" button disabled when offline
- Note: selections are preserved in React state while offline; reconnect and tap "Save All" to upload

### 6. `client/src/pages/technician/JobDetails.tsx`
- Destructures `syncStatus` from `useOfflineStorage`
- Submit for QA dialog shows a warning box when `pendingResults > 0 || pendingDeficiencies > 0`
- Warning lists the count of unsynced items and links to `/tech/sync`
- Not a hard block — tech can still submit, but is informed the report may be incomplete

### 7. `client/src/components/FieldCopilotPanel.tsx`
- "Ask AI" trigger button is now `disabled={!isOnline}` with a title tooltip
- Inside the panel, the offline message was already shown (unchanged)
- Action buttons inside were already `disabled={!isOnline}` (unchanged)

## Parts Not Implemented (Scope / Limitation Notes)

### Part 8 — Job Packet Prefetch
Not implemented. The current approach (job data cached on load via `cacheJobData` in JobDetails) is sufficient for v1. Proactive prefetch of devices, template data, and site info would require a "Make Available Offline" button and significant storage management — out of scope for this hardening pass.

### IndexedDB (offlineStorage.ts) → SyncScreen gap
The `offlineStorage.ts` (IndexedDB) store — used by FireAlarmInspection and SmokeAlarmInspection for checklist items — is NOT connected to SyncScreen. These are fire alarm checklist items (different from device test results in localStorage). Connecting them requires a separate `inspectionResult.syncBatch` call scoped to fire alarm items. This is a known gap, tracked for v2.

### Deficiency Offline Queue
The `OfflineDeficiency` type and store exist in `useOfflineStorage`, but DeficiencyEditor still doesn't write to it (it requires a server round-trip). The SyncScreen now handles offline deficiencies IF they somehow end up in the queue, but in practice the queue will be empty until a future feature adds offline deficiency creation.

## Backend Safety Verification (Part 10)

All tRPC procedures involved in sync are safe:
- `inspectionResult.syncBatch` — scoped to `ctx.user.companyId` via job lookup
- `deficiency.create` — uses `technicianProcedure`, jobId validated against companyId, `reportedById: ctx.user.id`
- `inspectionTemplate.saveResponse` — job.companyId checked against ctx.user.companyId before write
- `checklist.saveResponse` — uses protectedProcedure (no cross-company write possible)
- All use server timestamps (no client-supplied `createdAt`)
- Finalization guards in place on job mutations

## Activity Log Safety (Part 11)

No changes to activity logging. `withAudit` only fires on actual server writes, not local saves. OfflineBanner sync and SyncScreen sync do NOT trigger activity log spam — each deficiency create fires one audit log entry (correct).
