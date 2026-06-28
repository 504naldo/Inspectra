# Inspectra — Customer Hand-off Checklist

**Date:** 2026-06-28
**Production URL:** https://inspectra-production.up.railway.app
**Deploy model:** push to `main` → Railway auto-deploys (project `innovative-reprieve`)

This document is the go-live punch list. It is self-contained — every action
item includes the exact steps/SQL so it can be executed without prior context.

---

## 1. Verified production state (as of 2026-06-28)

| Area | State |
|---|---|
| Latest deploy | ✅ SUCCESS; `main` HEAD == deployed commit (no drift) |
| Liveness | ✅ `GET /health` → 200 `{"status":"ok"}` |
| Deploy targets | ✅ Single Railway project deploys from `main` (the accidental duplicate `stellar-essence` was retired) |
| Config | ✅ 34 service variables set incl. `JWT_SECRET`, `DATABASE_URL`, `GOOGLE_*`, `S3_*`; app refuses to boot without `JWT_SECRET` by design |
| Deploy policy | `railway.json`: healthcheck `/health` (30s), restart `ON_FAILURE` (max 3 retries) |
| Tests | 907 pass, 0 logic failures, 0 type errors (integration tests require a real MySQL — see §4) |
| Revenue loop | ✅ Approved Work → invoice (auto line items) → PDF + email → Sage 50 CSV export |
| Security | ✅ Cross-tenant ownership + finalization-lock enforced on inspection paths (21 dedicated tests pass) |

---

## 2. Blockers — complete BEFORE handing the keys over

### 2.1 Rotate the Railway token 🔴 (security)
The project token used during setup was shared in plaintext **and** is
workspace-wide (can see/modify all projects in the account). Replace it:
1. Railway dashboard → **Account/Workspace Settings → Tokens** → delete the current token.
2. Create a fresh token, ideally **project-scoped to `innovative-reprieve` only**.
3. Update any automation/CI that used the old token.

### 2.2 Finish Sage 50 Canada export wiring 🔴 (workflow)
The CSV export works, but two things must be set for it to be usable end-to-end:
1. **Set the Sage tax code** — `companySettings.sageTaxCodeDefault` is currently
   empty, so the CSV "Tax Code" column is blank. Set it (e.g. `G` for GST, `GP`
   for GST+PST) via company settings.
2. **Confirm the import route** — stock Sage 50 Canada cannot import a sales-invoice
   CSV natively (its bulk route is General Journal entries). The current export is
   a Sage-50-oriented line-item layout suited to add-on importers (Zed Axis/XLGL).
   Validate one export against the actual Sage import before relying on it; if a
   different layout is needed, the columns/date format/tax code are documented and
   easily adjusted in `server/routers/invoiceRouter.ts` (`exportSage`).

### 2.3 Reconcile chronically-failing manual migrations 🟡
Five legacy manual migrations fail every boot (MariaDB-only `IF NOT EXISTS`
syntax / `AFTER <col>` positioning) and are retried forever by the startup
runner. Their columns/tables already exist; only some indexes may be missing.
Run the remediation SQL in **`MIGRATION_RUNBOOK.md` → "Manual Migration
Reconciliation (2026-06-28)"** to stop the retry loop and backfill any missing
indexes. DB-only; no redeploy needed.

### 2.4 Confirm external database backups 🔴
The database is **not** hosted in the Railway project (no DB service/volume there)
— it lives wherever `DATABASE_URL` points (PlanetScale / external MySQL). Confirm
that provider has automated backups enabled and that a restore has been tested.
Railway backups do **not** cover this data.

---

## 3. Recommended before go-live (non-blocking)

- **UAT pass** — ✅ Automated workflow-level UAT done (2026-06-28): the full suite
  (957 tests) passes against a real MySQL 8, including a new end-to-end revenue-loop
  test (`server/invoiceWorkflow.test.ts`: Approved Work → invoice → Sage 50 CSV → PDF).
  *Still recommended:* a human UI click-through of the manual checklist at the bottom
  of `INVOICE_HARDENING_REPORT.md`, since the automated UAT covers the API/data layer,
  not the browser UI.
- **Uptime monitoring/alerting** — ✅ Added (2026-06-28): `.github/workflows/uptime.yml`
  pings `/health` every 5 min from GitHub (external to Railway) and opens/auto-closes a
  tracking issue on outage. *Optional:* add a phone/SMS-grade monitor (UptimeRobot/
  BetterStack) pointed at `/health` if you need paging rather than a GitHub issue.

---

## 4. Known, accepted states (not defects)

- **Integration tests need a real MySQL.** Tests that call DB helpers fail locally
  without `DATABASE_URL`; CI provisions `mysql:8` and they pass there. Not a regression.
- **Dual migration history is intentional.** `drizzle/*.sql` (journal, CI via
  `drizzle-kit migrate`) vs. `drizzle/migrations/*.sql` (hand-numbered, applied to
  prod by the startup runner). See `CLAUDE.md → Database Migrations`.
- **`users.sessionVersion`** is deliberately not in `schema.ts`; its read/write paths
  are handled defensively (best-effort raw SQL + cast/default), so they don't fail CI.

---

## 5. Ops quick reference

- **Deploy:** push to `main` → Railway builds (Nixpacks) and deploys automatically.
- **Migrations on deploy:** `server/runMigrations.ts` applies pending
  `drizzle/migrations/*.sql` on boot, tracked in `__schema_migrations` (idempotent
  on dup-key errors).
- **Storage:** S3/R2 (`S3_*` vars) for PDFs and attachments.
- **Auth:** Google OAuth (`jose` JWTs); `JWT_SECRET` required to boot.
- **Health:** `GET /health` → liveness JSON.
</content>
