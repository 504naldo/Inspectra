# Offline Sync Audit — v1

## What Actually Saves Offline Today

| Flow | Offline Save? | Storage | Sync Path |
|---|---|---|---|
| Device Test (pass/fail/na) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `inspectionResult.syncBatch` |
| Deficiency create/edit | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `deficiency.create` (one by one) |
| CAN/ULC-S536 checklist (`ChecklistCompletion.tsx`) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `checklist.bulkSaveResponses` |
| Template form responses (`TemplateFormRenderer.tsx`) | ✅ Yes | `localStorage` via `useOfflineStorage` | SyncScreen → `inspectionTemplate.saveResponse` (one by one, no bulk endpoint) |
| Fire Alarm checklist items (`FireAlarmInspection.tsx`) | ✅ Yes | IndexedDB via `offlineStorage.ts` | SyncScreen → `fireAlarm.saveInspectionResult` (one by one, no bulk endpoint), plus a redundant per-page auto-sync-on-reconnect effect |
| Smoke Alarm tests (`SmokeAlarmInspection.tsx`) | ✅ Yes | IndexedDB via `offlineStorage.ts` (`pendingSmokeAlarmTests` store, keyed by alarm device id) | SyncScreen → `smokeAlarm.recordTest` (one by one), plus a redundant per-page auto-sync-on-reconnect effect |
| Raw mutation queue (legacy) | ✅ Yes | `localStorage` via `mutationQueue` | OfflineBanner auto-flush |

## Storage Systems

1. **`useOfflineStorage.ts` (localStorage)** — primary offline store
   - Keys: `fire_inspect_offline_results`, `fire_inspect_offline_deficiencies`, `fire_inspect_offline_checklist_responses`, `fire_inspect_offline_template_responses`, `fire_inspect_cached_jobs`, `fire_inspect_last_sync`
   - Used by: DeviceTest, DeficiencyEditor, ChecklistCompletion, TemplateFormRenderer, SyncScreen, OfflineBanner

2. **`offlineStorage.ts` (IndexedDB)** — `FireInspectOffline` DB (v3), `pendingInspectionResults` store, `pendingSmokeAlarmTests` store, plus pending deficiency-photo blobs
   - Used by: FireAlarmInspection (fire alarm checklist items), SmokeAlarmInspection (smoke alarm test results), DeficiencyEditor/SyncScreen (queued photos)
   - All three stores are now connected to SyncScreen/OfflineBanner via pub/sub hooks (`subscribePendingResults`/`usePendingFireAlarmResults`, `subscribePendingSmokeTests`/`usePendingSmokeAlarmTests`, `subscribePendingPhotos`/`usePendingPhotoCount`)

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

The app has two offline stores with different storage engines, but as of v3 both are wired into SyncScreen/OfflineBanner:
- `offlineStorage.ts` (IndexedDB) handles fire alarm *checklist* items (used by FireAlarmInspection) and queued deficiency photos
- `useOfflineStorage.ts` (localStorage) handles device test *results*, deficiencies, CAN/ULC checklist, and template responses

These remain different concepts (checklist item vs device pass/fail) and different sync paths (one is React state + localStorage reads, the other is async IndexedDB reads via a pub/sub hook), but SyncScreen now surfaces and syncs pending items from both, and OfflineBanner's badge counts both.

## v3 Supported Offline Entities

| Entity | Status |
|---|---|
| Device test results (pass/fail/na) | Fully supported — save, sync, display |
| Offline deficiency queue | Fully supported — save, sync, display (photos queued separately in IndexedDB) |
| CAN/ULC-S536 checklist responses | Fully supported — save, sync, display |
| Template responses | Fully supported — save, sync, display |
| Fire alarm checklist items (`FireAlarmInspection.tsx`) | Fully supported — IndexedDB save, SyncScreen sync, display |
| Smoke alarm tests (`SmokeAlarmInspection.tsx`) | Fully supported — IndexedDB save (`pendingSmokeAlarmTests`), offline-result overlay on the page, SyncScreen sync + reconnect auto-sync |
| Time tracking | Online-only |
| Signatures / photos | Online-only (deficiency photos queue offline; see IndexedDB store) |
| Job packet prefetch | Partial (job data cached on load; devices/templates not pre-fetched) |
