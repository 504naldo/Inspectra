# Main schema recovery: missing Calendar ownership columns

Prepared for main `179e8c8c898a8a74309f7a5acece34c971f2c1f6` and its
schema-recovery follow-up. This is a maintenance plan and synthetic rehearsal,
not evidence that production is repaired. No production database, credentials,
migrations, deploys or live settings were accessed or changed by this work.

## Failure and existing repair

The October 4 Railway deployment `5b14e294-35e0-4e84-991f-849a6ee480e2`
failed before opening its listener. Bounded runtime logs, reconfirmed read-only
on October 18, show `ER_BAD_FIELD_ERROR` / errno `1054` / SQLSTATE `42S22`
for `SELECT googleCalendarOwnerId, googleCalendarId FROM jobs LIMIT 0`.
The failed deployment does not establish that the earlier serving deployment
is offline.

Manual `0086_audit_receipts_outbox_calendar.sql` already defines these nullable
columns plus `invoice_payments` and `email_outbox`. Manual `0087` defines the
four payment protocol guards required by this main version. Their fresh-install
journal counterparts are `0036` and `0037`. A second migration, a longer health
timeout, or allowing startup without these prerequisites is not the repair.

The follow-up labels the failed schema prerequisite and preserves only driver
codes, numeric errno and SQLSTATE in its error cause. Required-schema queries
remain read-only and fail closed. This sanitization applies to those wrapped
queries; the existing migration runner and database constructor have separate
logging paths. Treat maintenance logs as restricted material.

## Required operator evidence before any live action

The no-production-write and no-deployment authorization boundary remains in
place. An authorized maintenance operator must separately obtain and review:

1. The currently serving and intended application commit/image, active workers,
   real migration ledger and actual DDL. Do not infer a complete live schema from
   the single missing-column error or from a ledger table's presence.
2. A verified full restorable backup and PITR/binlog position, plus an approved
   sanitized restore for rehearsal. Compare tenant ownership, invoice totals,
   captures, Calendar event pointers and guard definitions before and after.
3. The actual manual `0014` non-null capture and `0044` session-version
   prerequisites. Unknown historical captures stay unknown; never run `0011`
   to reconstruct them from today's templates.
4. A confirmed write freeze covering the serving image, workers and in-flight
   payment/inspection operations. The earlier image may still serve traffic;
   applying payment guards while it remains writable is unsafe.
5. Existing trigger privileges and reviewed identical definitions for any
   already-present object. No permission expansion is included in this plan.

Use the full [PR #18 release procedure](PR18_RELEASE_SAFETY.md) for backup,
historical evidence, write freeze and forward recovery requirements. Branches
with later audit features have additional migrations and six guards; this plan
does not authorize those features or their schema.

## Classify the installation before selecting a path

Inventory metadata only under separately granted database access: the two
ledger tables and their entries, `SHOW CREATE TABLE` for users, jobs,
fire_alarm_inspection_results, invoices, invoice_payments and email_outbox, and
the four `SHOW CREATE TRIGGER` definitions where present. Compare to the reviewed
SQL artifact. Do not paste credentials or customer records into review evidence.

| Observed state | Required response |
|---|---|
| Verified manual history; 0086/0087 pending; prerequisites proven | Rehearse only those selected files with the existing explicit maintenance runner. |
| Interrupted pending file; some objects already exist | Inspect each existing definition against the exact selected SQL, then resume the same reviewed file. MySQL DDL commits independently. |
| 0086/0087 recorded but required objects absent or different | Stop for ledger/schema reconciliation and a separately reviewed repair. The runner skips recorded files. Never delete ledger rows to force replay. |
| Existing table, column, key or trigger has an unexpected definition | Stop. The runner's duplicate-name handling and `IF NOT EXISTS` do not validate definitions or make incompatible DDL safe. |
| Fresh, empty installation | Use the journal only; do not replay manual history. |
| Existing journal installation, both histories present, or origin uncertain | Reconstruct verified history and rehearse the appropriate recovery on the restored copy. A journal marker alone is insufficient; do not replay fresh-install SQL onto populated legacy tables. |

## Selected manual recovery artifact

For the first two approved manual-history cases only, prepare a directory
containing exactly the two reviewed files below. These are the unchanged files
from main `179e8c8`:

| File | SHA-256 |
|---|---|
| `0086_audit_receipts_outbox_calendar.sql` | `6d761420833fd43ff73b923f36d75ba802288e896de8100340c69c20fa8ee0d0` |
| `0087_payment_protocol_guard.sql` | `9870a451724df432928df48c44094de8d391e094d1a11094b407c0ddd0a106eb` |

The existing maintenance API is:

```ts
await runMigrations({
  databaseUrl: authorizedMaintenanceUrl,
  migrationsDir: reviewedSelectedDirectory,
  apply: true,
});
```

This snippet is an operator handoff, not permission to execute it in production.
Do not run the entire manual directory, `RAILWAY_CATCHUP.sql`, `db:push`, or the
journal as a shortcut. Do not add receipts, outbox deliveries, inferred Calendar
owners or historical captures as part of schema recovery.

Retain the freeze after DDL. Verify final definitions and selected ledger entries,
the complete verified history, preserved records, and the actual application's
`verifyAuditRequiredSchema()` result. The startup check validates selected column
presence, absence of null fire-alarm captures and four trigger names; it is not
a full DDL comparison or historical release certification. Deploy/restart only
with separate authorization for the exact compatible image, then verify health
and the approved isolated smoke checks before reopening writes. Keep the guards
intact during forward recovery; do not run an older payment writer against them.

## Rehearsal and limits

Run on a disposable local MySQL 8 server with dependencies installed:

```sh
DATABASE_URL=mysql://root@127.0.0.1:3307/inspectra_schema_recovery \
  pnpm exec vitest run server/schemaRecovery.test.ts server/requiredSchema.test.ts server/health.test.ts
```

The recovery test rejects non-loopback/non-Inspectra targets, creates its own
random database and drops only the database it successfully created. It prepares
a synthetic pre-0036 journal schema with established 0014/0044 prerequisites;
this is deliberately not a copy or proof of production's complete manual history.
It reproduces the exact missing-column failure, proves read-only checks leave
it unchanged, resumes selected 0086/0087 after exact partially committed DDL,
and then passes the actual required-schema check. It compares all four trigger
bodies, unchanged invoice totals/owners, exact captures and existing Calendar
event pointers. New ownership pointers remain null, with no invented receipts
or deliveries. Repeat execution preserves state and an old payment writer fails.
Recorded-but-missing schema drift remains blocked, as required.
The test uses its disposable MySQL administrative connection; it does not prove
the production application's privileges or trigger-metadata visibility.

Local validation on October 18: Node **24.19.0**, MySQL **8.0.46**;
**14/14 focused tests passed**, including the real MySQL recovery test. Hosted
Node 22/full CI evidence belongs in the draft PR. No live schema inventory,
sanitized restored-data rehearsal, backup/PITR verification or live recovery
has been completed. Publication of this plan does not resolve those prerequisites.
