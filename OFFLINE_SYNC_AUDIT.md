# Offline Sync Audit — v1

## What Actually Saves Offline Today

| Flow | Offline Save? | Storage | Sync Path |
|---|---|---|---|
| Device Test (pass/fail/na) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `inspectionResult.syncBatch` |
| Deficiency create/edit | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `deficiency.create` (one by one) |
| CAN/ULC-S536 checklist (`ChecklistCompletion.tsx`) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `checklist.bulkSaveResponses` |
| Template form responses (`TemplateFormRenderer.tsx`) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `inspectionTemplate.saveResponse` (one by one, no bulk endpoint) |
| Fire Alarm checklist items (`FireAlarmInspection.tsx`) | Partial | IndexedDB via `offlineStorage.ts` | Not yet wired to SyncScreen |
| Raw mutation queue (legacy) | ✅ Yes | `localStorage` via `mutationQueue` | OfflineBanner auto-flush |

## Storage Systems

1. **`useOfflineStorage.ts` (localStorage)** — primary offline store
   - Keys: `fire_inspect_offline_results`, `fire_inspect_offline_deficiencies`, `fire_inspect_offline_checklist_responses`, `fire_inspect_offline_template_responses`, `fire_inspect_cached_jobs`, `fire_inspect_last_sync`
   - Used by: DeviceTest, DeficiencyEditor, ChecklistCompletion, TemplateFormRenderer, SyncScreen, OfflineBanner

2. **`offlineStorage.ts` (IndexedDB)** — `FireInspectOffline` DB, `pendingInspectionResults` store plus pending deficiency-photo blobs
   - Used by: FireAlarmInspection, SmokeAlarmInspection (fire alarm checklist items), DeficiencyEditor/SyncScreen (queued photos)
   - The fire-alarm checklist-item store is not connected to SyncScreen; the deficiency-photo queue is

3. **`mutationQueue.ts` (localStorage)** — raw HTTP POST queue
   - Key: `inspectra_mutation_queue`
   - Flushed by OfflineBanner on reconnect
   - No entity type tracking

## Gaps Found

### UI/UX Gaps
- **SyncScreen** shows entity labels as "Job #X - Device #Y" — not "Device Test"
- **FieldCopilotPanel** shows offline message inside panel but the trigger button is still active
- **Submit for QA** has no check for pending unsynced device test results

### Backend Safety (Already Good)
- `technicianProcedure` enforces `ctx.user.companyId` on all writes
- `deficiency.create` — companyId scoped via job lookup
- `inspectionTemplate.saveResponse` — job.companyId checked before write
- `inspectionResult.syncBatch` — job.companyId scoped (verify below)
- Finalization guards on all job mutations
- Server timestamps used (`answeredAt: new Date()`, `reportedById: ctx.user.id`)

### Activity Log Safety
- `withAudit` on deficiency.create/update — fine, only fires on actual server writes
- No activity logged for local saves (correct)
- No spam risk from offline saves

## IndexedDB vs localStorage Split

The app has two offline stores that don't know about each other:
- `offlineStorage.ts` (IndexedDB) handles fire alarm *checklist* items (used by FireAlarmInspection)
- `useOfflineStorage.ts` (localStorage) handles device test *results* (used by DeviceTest)

These are different concepts (checklist item vs device pass/fail) and different sync paths. The IndexedDB store is not connected to SyncScreen. This is a known limitation for v1.

## v1 Supported Offline Entities

| Entity | Status |
|---|---|
| Device test results (pass/fail/na) | Fully supported — save, sync, display |
| Offline deficiency queue | Fully supported — save, sync, display (photos queued separately in IndexedDB) |
| CAN/ULC-S536 checklist responses | Fully supported — save, sync, display |
| Template responses | Fully supported — save, sync, display |
| Fire alarm checklist items (`FireAlarmInspection.tsx`) | IndexedDB (separate system, not in SyncScreen v1) |
| Time tracking | Online-only |
| Signatures / photos | Online-only (deficiency photos queue offline; see IndexedDB store) |
| Job packet prefetch | Partial (job data cached on load; devices/templates not pre-fetched) |
