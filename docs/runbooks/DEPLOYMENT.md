# Deployment & Migration Safety Runbook

**Status:** active. Applies to the production Railway deployment of `504naldo/Inspectra`.

Do **not** run production migrations automatically. Do **not** run destructive
backfills. Never expose database credentials in logs, PRs, or docs.

## Background (how this app deploys)

- Push to `main` → Railway auto-builds (Nixpacks, **Node 20**) and deploys.
- **Two migration histories (intentional — see `CLAUDE.md`):**
  - `drizzle/*.sql` + journal: generated from `drizzle/schema.ts`; CI runs
    `npx drizzle-kit migrate` against a fresh `mysql:8`.
  - `drizzle/migrations/*.sql`: hand-numbered, applied to **production** by the
    startup migration runner (`server/runMigrations.ts`), tracked in
    `__schema_migrations`. The runner ignores `ER_DUP_FIELDNAME`/`ER_DUP_KEYNAME`,
    so additive statements are idempotent. Manual migrations must be plain MySQL
    DDL (no MariaDB `IF NOT EXISTS` on `ADD COLUMN/INDEX`; no `AFTER <col>` that
    depends on apply order).

## Deployment sequence

1. **Create a backup.** Take/verify a backup/snapshot of the production database
   (via the DB provider — the DB is **external** to the Railway project). Record the
   snapshot id/time. Do not proceed without a verified, restorable backup.
2. **Review generated SQL.** Inspect any new `drizzle/migrations/*.sql` and the
   journal diff. Confirm statements are additive/non-destructive. Flag any
   `DROP`/`MODIFY`/data backfill for explicit review.
3. **Test in development/staging.** Apply migrations to a disposable MySQL 8
   (`drizzle-kit migrate` for the journal; run the manual files through a runner-like
   path) and run `pnpm test`.
4. **Apply production migration.** For additive manual migrations, the startup runner
   applies them on deploy. For anything destructive or high-risk, apply **manually**
   and deliberately (out of band) — never let it run automatically.
5. **Verify schema version.** Confirm the expected files appear in
   `__schema_migrations` and that boot logs show `[Migrations] Applied: …` with no
   repeating failures.
6. **Deploy the application.** Push to `main` (or trigger redeploy).
7. **Smoke test.** `GET /health` → 200; exercise the manual smoke checklist
   (auth redirect, one tenant-scoped read, invoice mark-paid guard, a customer PDF).
8. **Rollback procedure.** If a deploy regresses: redeploy the previous good commit
   on Railway (app rollback is immediate). For schema: additive migrations are
   forward-safe and generally need no rollback; for a destructive change, restore
   from the step-1 backup — coordinate downtime. Document rollback notes in the PR
   for any high-risk migration.
9. **Do not run destructive backfills automatically.** Backfills that mutate existing
   rows are applied manually, reviewed, and only after a backup.

## Deployment mismatch detection

- The startup runner logging is the current mismatch signal: a chronically-failing
  `[Migrations] Failed to apply …` line means application code expects schema the DB
  lacks. Treat repeated failures as a release blocker (this was the root cause of the
  parts-import 500s — see `PRODUCTION_READINESS.md` PR-09).
- Recommended follow-up: a lightweight startup check that compares expected vs
  applied migration set and emits a clear warning when they diverge.

## Backup checklist (pre-migration)

- [ ] Verified, restorable backup taken; id/time recorded.
- [ ] Generated SQL reviewed; additive/non-destructive confirmed.
- [ ] Migration tested on a disposable DB; `pnpm test` green.
- [ ] Rollback plan written for any high-risk change.
- [ ] No credentials in logs/PR/docs.
