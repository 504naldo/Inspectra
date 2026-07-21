# Android Offline Field-Test Runbook

A manual, real-device test plan for Inspectra's offline capture and sync on
Android. It exercises every offline write path a technician uses in the field,
plus the failure and edge scenarios that only surface on a real device with a
real network. Run it before shipping any release that touches offline storage,
sync, the sync screen, QA submission, or the Capacitor shell.

> **Status of automated coverage.** The pure sync/QA-preflight logic and the
> server-side safeguards (finalized-job rejection, company scoping, idempotent
> replay) are covered by unit/integration tests (`client/src/lib/qaPreflight.test.ts`,
> `server/offlineSyncIdempotency.test.ts`, `server/offlineSyncSafeguards.test.ts`).
> **Real-device offline behavior — IndexedDB persistence across an OS-killed app,
> camera capture, and radio on/off transitions — is NOT covered by automated
> tests and must be verified by running this runbook on hardware.** Do not mark a
> release "offline-verified" from CI alone.

---

## 0. Scope and conventions

- **Roles:** one `technician` account (the device under test) and one
  `office`/`admin` account (a laptop, to reassign/finalize jobs and verify
  server records).
- **"Airplane mode"** means toggle the OS radios, not just the in-app banner —
  we want the real `navigator.onLine`/Capacitor Network transitions.
- **Record IDs.** Every time you create something offline, jot the on-screen
  label (Job #, deficiency title, device #) so you can match it to the server row
  later.
- **Evidence.** Capture the artifacts listed per step. Screenshots must show the
  status/queue chips, not just the form.

---

## 1. Installation / build preparation

1. Build the web assets and sync the Android project:
   ```bash
   pnpm install
   pnpm build
   npx cap sync android
   ```
2. Open `android/` in Android Studio (or `npx cap open android`).
3. Choose the build variant:
   - **Debug** on an emulator is fine for most steps.
   - Use a **release/internal build on a physical device** for the kill/restart,
     camera, and radio-transition steps — emulator network and process-death
     behavior do not match real hardware.
4. Confirm the app points at the intended API base URL (staging, not
   production, unless you are doing a production smoke test with disposable data).
5. Install to the device and launch once while online to complete first-run
   init (Capacitor push/permission prompts, service worker/asset cache).

**Evidence:** build log tail, `cap sync` output, the variant/device used.

---

## 2. Test account setup

1. As office/admin, create or reset a **technician** account for the device.
2. Sign in on the device as that technician. Confirm the dashboard loads.
3. On the office laptop, sign in separately so you can reassign/finalize jobs
   and inspect server records in parallel.
4. Note the technician's user id and company id (needed for server verification).

**Pass criteria:** technician can sign in; office can see the technician in the
users list.

---

## 3. Assigned-job setup

1. As office, create (or pick) a **site** and an **assigned job** for the
   technician that includes, ideally:
   - at least one **device** to test,
   - a **fire-alarm system** on the site (for the fire-alarm form + checklist),
   - at least one **smoke-alarm** device,
   - an **inspection template** assigned to the job.
2. Assign the job to the technician (lead or additional).
3. On the device, confirm the job appears in the technician's job list.

**Evidence:** job number, site name, and the assigned technician.

---

## 4. Offline packet caching

1. While **online**, open the job on the device so its offline packet caches
   (job details, devices, checklist/template definitions).
2. Go to **Sync Data** and confirm the job shows under **Offline Job Packets**
   with a **Ready** badge.
3. Now enable **airplane mode**.

**Pass criteria:** the job opens fully offline (no spinner-of-death); packet
badge is **Ready**. **Fail:** any screen shows "failed to load" while offline.

---

## 5. Device test (offline)

1. Offline, open the job → a device → record a **pass/fail** result.
2. Return to **Sync Data**. Confirm a **Device Test · Job #** row appears under
   **Pending Uploads** with the correct pass/fail chip.

**Pass criteria:** the result is queued and visible as pending; the Pending
count increments. **Fail:** the result vanishes or the count doesn't change.

---

## 6. Template response (offline)

1. Offline, open the job's inspection template form; answer several items.
2. Confirm **Sync Data → Pending Uploads** shows a **Template · Job #** row with
   the item count.

**Pass criteria:** template answers are queued per job.

---

## 7. Deficiency (offline)

1. Offline, create a **deficiency** (set a severity, e.g. *critical*).
2. Confirm a **Deficiency · Job #** row appears under Pending Uploads with the
   severity chip.

**Pass criteria:** deficiency queued with its severity. Keep this deficiency —
you'll attach a photo next.

---

## 8. Photo (offline)

1. Offline, open the deficiency and **capture a photo with the camera** (grant
   the camera permission if prompted — see §17).
2. Confirm **Sync Data** shows **N deficiency photo(s) queued · on this device**.

**Pass criteria:** the photo is queued locally and the count reflects it.
**Fail:** camera doesn't open, or the photo isn't queued.

---

## 9. Fire-alarm form (offline)

1. Offline, open the job's **fire-alarm inspection** and record several
   checklist results; also fill part of the **fire-alarm form** (header /
   attendance / ancillary as available).
2. Confirm **Sync Data → Pending Uploads** shows a **Fire Alarm Checklist ·
   Job #** row.

**Pass criteria:** fire-alarm checklist results are queued. Note the count.

---

## 10. Kill / restart the app (persistence)

1. Still **offline**, force-stop the app: **Settings → Apps → Inspectra → Force
   stop** (or swipe-kill from recents; for a stronger test use
   `adb shell am force-stop <appId>`).
2. Relaunch the app **while still offline**.
3. Go to **Sync Data**.

**Pass criteria:** every pending item from §5–§9 is **still present** with the
same counts (device test, template, deficiency, photo, fire-alarm). IndexedDB
and localStorage survived process death. **Fail:** any queue is empty or reduced.

**Evidence:** before-kill and after-restart screenshots of the Pending Uploads
list showing identical counts.

---

## 11. Reconnect

1. Disable airplane mode. Wait for the **Online** badge.
2. Do **not** tap Sync yet — first confirm the app didn't auto-clear anything and
   the pending counts are unchanged.

**Pass criteria:** the app detects online; pending items remain until an explicit
sync (nothing is marked synced merely because connectivity returned).

---

## 12. Repeated sync (idempotency / double-tap)

1. Tap **Sync N Items**. Watch it complete.
2. Immediately tap **Sync** again (and once more). If a **Retry Failed Items**
   button appears, tap it too.
3. Observe the toasts and the Pending → Synced transition.

**Pass criteria:**
- The Sync button is disabled while syncing (no concurrent runs).
- Items only move to **Synced** after the server confirms — a second sync does
  **not** create duplicates.
- Verify on the server (§18) that each queued item produced exactly **one** row.

**Fail:** duplicate device results / deficiencies / photos / template rows, or
"Synced" shown for something the server rejected.

---

## 13. Reassignment while offline

1. Re-enter **airplane mode** on the device.
2. Offline, record a **new device test** (or edit one) on the job.
3. On the office laptop, **reassign the job to a different technician**.
4. On the device, reconnect and **Sync**.
5. Record the actual outcome.

**Expected (guaranteed behavior):** offline writes are authorized by **company +
finalized state**, deliberately **not** by the assignment list, so the reassigned
technician's already-captured work **must still sync** — reassignment must never
drop a shift's worth of field data. This is locked by
`server/offlineSyncSafeguards.test.ts`; §13 verifies it holds on a real device.

**Pass criteria:** the reassigned technician's queued work syncs successfully and
the office user can see it on the job; **no** captured data is lost or rejected.
**Fail:** any queued item is rejected or silently dropped because the technician
was reassigned.

---

## 14. Finalized job while offline

1. Re-enter **airplane mode**.
2. Offline, record a **new** device test, a **deficiency**, a **fire-alarm
   result**, a **template answer**, and queue a **photo** on the job.
3. On the office laptop, **finalize** the job (generate/lock the report).
4. On the device, reconnect and **Sync**.

**Pass criteria (server-enforced):** every write to the finalized job is
**rejected** by the server. On the device the failed items must:
- remain visible in the queue (not silently dropped),
- surface an error / "failed to sync" message,
- stay retryable.

**Fail:** a write lands on a finalized job, or a rejected item disappears with no
message.

**Evidence:** the sync error toast/card, and the still-present pending items.

---

## 15. Session expiry before sync

1. Re-enter airplane mode; capture some offline data.
2. Invalidate the session server-side (e.g., office logs the device's session out
   / bumps session version, or wait past token expiry).
3. Reconnect and **Sync**.

**Pass criteria:** sync fails with an **actionable auth message** (prompting
re-login), and **no queued data is lost** — after re-authenticating, the same
pending items are still there and sync successfully.

**Fail:** a silent failure, an infinite spinner, or dropped queue items.

---

## 16. QA submission with pending records

1. Get the job into a state where at least one **critical** record for it is
   **still unsynced** (e.g., stay offline after capturing a fire-alarm result or
   a deficiency).
2. Open the job → **Submit for QA**.

**Pass criteria:** the QA dialog **warns** that N items are not yet synced and
**lists them by type**, including **device tests, deficiencies, checklist,
template, fire-alarm results, and smoke-alarm tests**. Submission is **blocked**
unless the technician ticks the explicit override. (Fire-alarm and smoke-alarm
counts appearing here is the specific safeguard added in this pass.)

3. Sync, confirm the warning clears, then submit cleanly.

**Fail:** the dialog reports "nothing pending" while a fire-alarm/smoke result is
still queued, or submission proceeds with no warning.

---

## 17. Camera permission handling

1. On a fresh install (or after clearing app permissions), capture a photo (§8).
2. Deny the permission once; retry and grant it.

**Pass criteria:** denial is handled gracefully (a clear prompt, no crash);
after granting, capture works and the photo queues. **Fail:** crash, or a
permanent broken state after an initial denial.

---

## 18. Server-side record verification

For each item you synced, confirm on the server (admin UI or DB) that it landed
**once** and is attributed correctly:

- **Device tests:** one `inspection_result` per device/job; `technicianId` is the
  device's technician (server-derived, not client-supplied).
- **Deficiencies:** one row per offline deficiency; `reportedById` correct;
  `idempotencyKey` = the client localId.
- **Photos:** one `attachments` row per queued photo; `idempotencyKey` set;
  image opens.
- **Fire-alarm results:** one `fire_alarm_inspection_results` row per
  (job, checklist item).
- **Template responses / checklist responses:** one row per (job, item).
- **Company:** every row's `companyId` matches the technician's company — never a
  value the client could have chosen.

**Pass criteria:** counts match what you captured; no cross-company leakage.

---

## 19. Duplicate verification

Cross-check the repeated-sync (§12), finalized (§14), and reassignment (§13)
steps:

- Re-run the sync one more time after everything shows **Synced**; confirm the
  server row counts **do not increase**.
- Confirm no deficiency/photo/device-result was created twice from a single
  offline capture.

**Pass criteria:** replay is a no-op server-side (idempotent). **Fail:** any
duplicate.

---

## 20. Evidence to capture (checklist)

- [ ] Build variant + device/OS version.
- [ ] Packet **Ready** badge (§4).
- [ ] Pending Uploads list before app-kill and after restart (§10) — identical.
- [ ] Sync success/partial/failure toasts (§12, §14, §15).
- [ ] Sync error card for the finalized-job rejections (§14).
- [ ] QA dialog showing per-type pending counts incl. fire-alarm/smoke (§16).
- [ ] Server record list proving one-row-per-item and correct `companyId` (§18).
- [ ] Duplicate re-sync showing unchanged counts (§19).
- [ ] Any anomaly (with repro steps).

---

## 21. Pass / fail criteria (overall)

**PASS** requires all of:

1. All offline captures (§5–§9) queue and **survive an app kill/restart** (§10).
2. Reconnect does not mark anything synced until an explicit, server-confirmed
   sync (§11–§12).
3. Repeated/double-tapped sync produces **no duplicates** (§12, §19).
4. Writes to a **finalized** job are **rejected**, and rejected items stay
   **visible and retryable** with a clear message (§14).
5. **Session expiry** yields an actionable message and **no data loss** (§15).
6. QA submission **warns/blocks** on unsynced critical records, including
   **fire-alarm and smoke-alarm** results, with an explicit override (§16).
7. Camera permission flow is graceful (§17).
8. Server shows **one correctly-attributed row per item**, no cross-company
   leakage (§18).
9. A **reassigned** technician's already-captured work still syncs (§13) — **no
   data lost or rejected** because of the reassignment.

**FAIL** if any of: queued data lost on restart; duplicates on replay; a write
lands on a finalized job; "synced" shown for a server-rejected item; a photo
failure hides the photo or makes it unretryable; QA submit ignores unsynced
critical data; a crash on camera/permission; or any cross-company record.

Record the result (PASS/FAIL), the build tested, the tester, and the date at the
top of your test report, and attach the evidence from §20.
