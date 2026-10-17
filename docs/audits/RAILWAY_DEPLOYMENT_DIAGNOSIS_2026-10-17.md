# Railway deployment diagnosis — 2026-10-17

Read-only investigation of project `b594cb45-0b33-4e6e-b3f1-afbefea37457`,
service `4a7b9797-4ad6-4029-a828-80224babea2b`, production environment
`acc3b1c9-1755-4f26-8703-263669598d49`.

## Confirmed failure

Deployment `5b14e294-35e0-4e84-991f-849a6ee480e2` built commit
`179e8c8c898a8a74309f7a5acece34c971f2c1f6` from `504naldo/Inspectra@main`.
The build succeeded; the container repeatedly exited before listening, then
failed Railway's healthcheck. Bounded deployment runtime logs show:

```text
2026-10-04T17:34:29.515394266Z DrizzleQueryError: Failed query:
  SELECT googleCalendarOwnerId, googleCalendarId FROM jobs LIMIT 0
2026-10-04T17:34:29.515429766Z at async verifyAuditRequiredSchema
2026-10-04T17:34:29.515433706Z at async startServer
2026-10-04T17:34:29.516760343Z code: ER_BAD_FIELD_ERROR
2026-10-04T17:34:29.516766883Z errno: 1054; sqlState: 42S22
2026-10-04T17:34:29.516773703Z Unknown column 'googleCalendarOwnerId' in 'field list'
2026-10-04T17:34:29.516785342Z ELIFECYCLE Command failed with exit code 1
```

The same failure recurs on subsequent starts. Railway's deployment diagnosis
independently attributes the failed healthcheck to unapplied PR #18 schema
changes. Increasing the healthcheck timeout does not repair a missing column.

## Current checkout and release prerequisite

`server/_core/index.ts` awaits read-only migration preflight and
`verifyAuditRequiredSchema()` before opening the HTTP listener.
`server/runMigrations.ts` intentionally does not apply migrations at startup.
The missing calendar columns are defined in production manual migration
`drizzle/migrations/0086_audit_receipts_outbox_calendar.sql` and fresh-database
journal migration `drizzle/0036_opposite_franklin_richards.sql`.

This observation proves that `jobs.googleCalendarOwnerId` was absent at the
failed deployment's runtime. It does not establish which other columns, tables,
triggers or legacy capture prerequisites are currently satisfied. The current
checkout requires later inspection capture, finalization-version and invoice
state guards as well. Review the actual live DDL and both deployment runbooks
before selecting and applying the appropriate manual migration history; do not
replay the fresh-database journal or backfill historical inspection evidence
from today's master data.

## Configuration observed

The production service configuration had no staged changes. Source remained
`504naldo/Inspectra@main`, with `checkSuites: false`, builder `RAILPACK`, build
environment `V3`, and domain `inspectra-production.up.railway.app` targeting
port 3000. This records the observed source gating; it does not certify a
healthy currently serving deployment or a complete release gate.

Build logs at `2026-10-04T17:32:23.560937670Z` record installation of
`nodejs-22.19.0`. The bounded runtime log query did not return an explicit
`process.version`/`Node.js` line, so the build artifact alone does not certify
the failed process's exact runtime version. Local validation ran under
Node `v24.19.0`.

## Local correction and validation

Schema preflight failures now name the exact checked prerequisite and link
the release runbook. Nested database cause codes, numeric errno and SQLSTATE
are retained; driver messages, SQL, parameters and connection objects are
omitted. Missing required schema still prevents startup, and preflight still
executes read queries only. This improves diagnosis and does not satisfy the
missing production migration prerequisite.

`node node_modules/vitest/vitest.mjs run server/requiredSchema.test.ts server/health.test.ts`
passed all 13 tests. The focused regression simulates the observed nested
`ER_BAD_FIELD_ERROR` calendar-column failure and checks that it stops before
later queries, identifies manual migrations 0086/0089 and journal 0036/0039,
and does not expose driver payloads. Other regressions cover database access
failure, inaccessible trigger metadata, missing guards, unreviewed historical
snapshots and successful read-only verification.

Only deployment logs, deployment diagnosis and service configuration were
read. Variable names were returned without values. No credentials, database
rows, production DDL or live configuration were read or changed; no deployment
was triggered. No endpoint or port change is justified by the observed error.
