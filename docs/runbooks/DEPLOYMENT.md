# Deployment & Migration Safety Runbook

**Status:** active. Applies to the production Railway deployment of `504naldo/Inspectra`.

Do **not** run production migrations automatically. Do **not** run destructive
backfills. Never expose database credentials in logs, PRs, or docs.

## Background (how this app deploys)

- Push to `main` → Railway auto-builds and deploys. Read-only inspection on
  2026-10-17 confirmed `source.branch=main` and `checkSuites=false`. Source config
  requests Nixpacks/Node 22; verify the actual runtime from the deployed image.
- **Two migration histories (intentional — see `CLAUDE.md`):**
  - `drizzle/*.sql` + journal: generated from `drizzle/schema.ts`; CI runs
    `npx drizzle-kit migrate` against a fresh `mysql:8`.
  - `drizzle/migrations/*.sql`: hand-numbered, applied only through explicitly reviewed
    maintenance (`server/runMigrations.ts` with `apply: true`), tracked in
    `__schema_migrations`. The runner ignores `ER_DUP_FIELDNAME`/`ER_DUP_KEYNAME`,
    so additive statements are idempotent. Manual migrations must be plain MySQL
    DDL (no MariaDB `IF NOT EXISTS` on `ADD COLUMN/INDEX`; no `AFTER <col>` that
    depends on apply order).

## Enable CI gates before release

For proposed isolated acceptance infrastructure, use the
[Inspectra staging setup plan](INSPECTRA_STAGING_PLAN.md). It requires resource,
spend, data and stop/cleanup approvals before provisioning, then separate
staging-deployment/provider/device approvals. Synthetic staging checks leave
production backup/restore verification and historical reconciliation open.

As observed on 2026-10-17, GitHub `main` was unprotected and Railway's source
had `checkSuites=false`. The audit fixes were tested on a separate branch; these
settings have not been changed. An authorized repository/service operator must
apply and verify both gates before merging release changes.

In Railway, select project `b594cb45-0b33-4e6e-b3f1-afbefea37457`, production
environment `acc3b1c9-1755-4f26-8703-263669598d49`, service
`4a7b9797-4ad6-4029-a828-80224babea2b` (**Inspectra**). In service settings,
enable **Wait for CI**, retaining repository `504naldo/Inspectra` and branch
`main`. The exact desired setting is `source.checkSuites: true`; do not reconnect
the source, change its commit/branch or trigger a deploy to enable this gate.
Read back the service configuration and confirm that setting, the unchanged
source and no unintended pending/deployment changes.

An authenticated Railway CLI with environment-edit support exposes the setting
at `--service-config <service-id> source.checkSuites true`; the dashboard toggle
is the direct operator path. The connected `update_service` and
`connect_service_source` tools do not expose this field. Reconnecting a live
source starts a build. The current executor has no Railway CLI/local credentials,
so no CLI or service-setting mutation was performed here.

In GitHub repository settings, protect `main` with an active branch rule/ruleset
requiring pull requests and all five status checks from the **CI** workflow in
[ci.yml](../../.github/workflows/ci.yml):

| Required check context | Acceptance covered |
|---|---|
| `test` | TypeScript, tenant scan, MySQL tests/migrations, production build and built-server smoke. |
| `storage-acceptance` | Disposable storage, workbook and authenticated upload/signature cases. |
| `payment-acceptance` | Real browser/payment and synthetic full backup recovery. |
| `browser-acceptance` | Production component interruption and account-boundary scenarios. |
| `android-build` | Android debug APK build; no hardware execution. |

Select the checks emitted by GitHub Actions, require the branch to be current
before merging, and prohibit force-push/deletion of `main`. Verify the rule is
active and document any administrator/bypass exceptions. The connected GitHub
App has no administration capability; its GET-only fetch tool cannot configure
branch protection/rulesets. No protection change was performed here.

[Railway Wait for CI](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci)
waits for GitHub Actions **workflow conclusions**, not individual required job
contexts. Skipped/neutral workflows do not block; a cancelled workflow can be
ignored if another workflow succeeded. Thus `source.checkSuites=true` does not
provide GitHub branch protection or prove all required checks ran. Keep the
workflow's `push: main` trigger and required jobs intact; preserve the separate
maintenance/backup prerequisites below. Enabling either gate is not release or
schema-maintenance acceptance.

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
4. **Apply production migration.** Only a separately authorized maintenance operator applies reviewed
   files under the required write freeze. Startup is read-only and refuses pending
   manual migrations; journal startup verifies required schema and guards. See
   [PR18_RELEASE_SAFETY.md](PR18_RELEASE_SAFETY.md) before any migration.
5. **Verify schema version.** Confirm the expected files appear in the correct
   history (`__schema_migrations` for manual maintenance or `__drizzle_migrations`
   for journal installs). Verify required columns, null-capture preflight and all
   six payment guard definitions. Startup performs read-only checks; it does not
   apply missing migrations.
6. **Deploy the application.** Push to `main` (or trigger redeploy).
7. **Smoke test.** `GET /health` → 200; exercise the manual smoke checklist
   (auth redirect, one tenant-scoped read, invoice mark-paid guard, a customer PDF).
8. **Rollback procedure.** If a deploy regresses, freeze writes and verify exact-version
   compatibility before changing an image. Previous images are **not** assumed safe
   against migrated payment data. Prefer compatible forward recovery, retaining
   receipts and guards. Old-version recovery requires a verified full restore and
   reconciliation of all post-backup operations; see [PR18_RELEASE_SAFETY.md](PR18_RELEASE_SAFETY.md).
9. **Do not run destructive backfills automatically.** Backfills that mutate existing
   rows are applied manually, reviewed, and only after a backup.

## Temporary email automation pause

Automated email delivery is **off by default**. `EMAIL_AUTOMATION_ENABLED`
must be exactly `true` at server startup to enable it; unset, `false` and other
values keep it paused. Leave it unset or `false` while the safety pause is in
effect. This gate applies even when Resend credentials, per-customer notification
preferences and `REPORT_NOTIFICATIONS=true` are configured.

Paused paths: job/schedule notifications, automatic customer portal invitations,
customer report-ready emails, report-generated owner emails, and quote/report
approval owner notifications. Business operations still complete; suppressed
emails are dropped rather than queued for delivery when automation is restored.
Explicit Send actions for Gmail reports, quotes, repair quotes, invoices and the
admin owner-notification action remain available.

The code gate must be deployed before it can stop automation in a running
production instance. After deliberate approval to restore automation, set
`EMAIL_AUTOMATION_ENABLED=true` and restart/redeploy; report-generated owner
emails additionally require `REPORT_NOTIFICATIONS=true`. Keep credentials
unchanged. Local regression tests mock every outbound request and do not send
real email.

## Deployment mismatch detection

- Missing-column and explicit-maintenance startup errors mean the code and
  schema are incompatible. The latest attempted Railway deployment, October 4
  `5b14e294-35e0-4e84-991f-849a6ee480e2`, failed on missing
  `jobs.googleCalendarOwnerId` before listening. This requires reviewed schema
  maintenance, not a longer healthcheck timeout.
- Startup now fails closed on pending manual history, missing required columns
  and absent protocol-v2 payment guards. Never let a warning substitute for a
  successful schema/ledger preflight.

## Backup checklist (pre-migration)

- [ ] Verified, restorable backup taken; id/time recorded.
- [ ] Generated SQL reviewed; additive/non-destructive confirmed.
- [ ] Migration tested on a disposable DB; `pnpm test` green.
- [ ] Rollback plan written for any high-risk change.
- [ ] No credentials in logs/PR/docs.

## Audit remediation release prerequisites (updated 2026-10-17)

PR #18 was merged as `179e8c8`; Railway reports its deployment failed. The newer
local audit fixes are not deployed. Main auto-deploys before CI finishes; keep
release blocked until the readiness register's prerequisites are resolved.

The journal now runs through **0042**; manual migrations **0086–0092** target the
separate manual history. See the current migration-pair table in
[PR18_RELEASE_SAFETY.md](PR18_RELEASE_SAFETY.md). Before a separately
approved release, inspect actual live DDL for manual 0014's non-null inspection
snapshot and 0044's sessionVersion. Startup now fails when required columns or
legacy non-null captures are missing. Review old records using original evidence;
do not fabricate snapshots or run automatic backfills. New Calendar pointers
record owner/calendar; legacy unknown owners require reconciliation before edits.

Manual Gmail/Resend operations reserve a durable email_outbox operation first.
`accepted` means provider acceptance, not confirmed recipient delivery. Reusing
the same accepted request ID returns its receipt. `sending`/`unknown` must be
reconciled against provider logs before any explicit new send; never automatically
replay an ambiguous operation. `rejected` requires an explicit corrected send
with a new operation ID. Quote, invoice and Gmail dialogs now retain exact
payloads and UUIDs and look up owned receipts. Unknown-outcome provider
reconciliation remains an operator task; the UI cannot mark an ambiguous send
accepted/rejected or erase it. Automated delivery remains default-off; no live
automation setting was changed in the continuation.

Payments require a stable client request UUID and record cumulative receipts
under an invoice lock. Existing accounting history is not backfilled. Resolve
historical reconciliation and live Sage export acceptance before claiming full
accounting acceptance. Disposable MySQL tests cover batch concurrency and rollback.
Required built-server CI smoke runs without a database
or provider credentials; it proves boot/health/UI only, not live integrations.
