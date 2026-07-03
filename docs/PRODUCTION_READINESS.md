# Inspectra — Production Readiness Register

**This is the single active register of production-readiness findings.** Historical
audit Markdown files in the repo root are point-in-time snapshots; this file is the
live status. Update it (don't fork it) when findings change.

Severity: P0 = blocks release / data-integrity / security · P1 = important · P2 = minor.
Status: open · in-progress · fixed · accepted-risk · wont-do.

| ID | Issue | Sev | Area | Status | Evidence | Fix commit | Validation | Owner | Next action |
|----|-------|-----|------|--------|----------|-----------|------------|-------|-------------|
| PR-01 | Full marketing site duplicated inside the app | P1 | Frontend | fixed | `Home.tsx` rendered `components/landing/*` | `refactor: separate app entry…` | build/check green; lightweight entry | eng | — |
| PR-02 | Raw `parseInt(params.id)` in 15 routes → NaN mounts / bad tRPC queries | P1 | Routing | fixed | `App.tsx` route table | `fix: harden routing…` | `routeParams.test.ts` (7) | eng | — |
| PR-03 | Catch-all silently redirected unknown URLs to `/` | P2 | Routing | fixed | `App.tsx` catch-all | `fix: harden routing…` | manual | eng | — |
| PR-04 | Unconditional `[AuthGuard]` console log; duplicated root redirect | P2 | Routing | fixed | `App.tsx` Router effect | `fix: harden routing…` | DEV-gated + loop guard | eng | — |
| PR-05 | `markPaid` could pay against stale stored total; no double-apply guard | P0 | Financial | fixed | `invoiceRouter.markPaid` | `fix: harden invoice…` | `invoiceIntegrity.test.ts` (9) | eng | — |
| PR-06 | Easy to omit company-ownership checks in routers | P1 | Security | in-progress | load-by-id + manual compare pattern | `security: add scoped tenant getters…` + 3× `security: adopt scoped tenant getters…` | `authorization.test.ts` (11) | eng | Migrated the exact load-then-throw checks for job/site/customerOrg/invoice/quote/workOrder/partsCatalogItem to scoped getters across jobRouter, siteRouter, deviceRouters, quote/repairQuote/approvedWork/workOrder/partsCatalog routers, media/serviceSchedule/workSiteInfo/invoice (~45 sites). Guards added: getJobForCompany, getSite/Device/CustomerOrg/PartsCatalogItem/WorkOrder assertions, getInvoiceForCompany, getQuoteForCompany. Remaining: entities using a local `companyId` var (serviceAgreement, inventory) and bespoke/list-filter checks (aiAssistant, schedulingAutomation, knowledge*) — convert opportunistically |
| PR-07 | No standing cross-tenant authorization test suite | P1 | Security | fixed | only inspection paths covered before | `security: add scoped tenant getters…` | `authorization.test.ts` | eng | Extend to users/AI/portal reads |
| PR-08 | Unsupported trust/compliance claims | P1 | Compliance | fixed | landing copy (removed) + meta tag | `docs: remove unsupported trust claims` | grep clean; `TRUST_CLAIMS.md` | eng | — |
| PR-09 | 5 manual migrations failed every boot (MariaDB syntax) | P0 | Migrations | fixed (prior) | startup logs | `Repair 5 manual migrations…` (main) | applied in prod | eng | — |
| PR-10 | Capability enforcement: sensitive actions open to admin+office by role only | P1 | Security | fixed | `officeProcedure` on payroll approval/export & invoice void/Sage export | `security: gate payroll approval/export & invoice void/Sage export to admin` | `capabilityEnforcement.test.ts` (7) | product+eng | Matrix decided: payroll approve/reject/bulk/markExported/exportData and invoice void/exportSage/markReady/markExportedToSage are admin-only (office keeps create/edit/markPaid/send + payroll view/notes). Enforced server-side via `adminProcedure` + `updateStatus` void-bypass guard; client controls hidden from office. See `CAPABILITY_MATRIX.md` |
| PR-11 | Offline/sync duplicate-protection + QA preflight hardening | P1 | Technician | fixed | non-idempotent `deficiency.create`/photo upload; QA submit could omit unsynced items | offline-sync safeguards + QA preflight + attachment idempotency + per-job scoping | `offlineSyncIdempotency.test.ts` (6), `qaPreflight.test.ts` (7) | eng | Idempotency covers deficiency + photo (smoke-alarm `recordTest` already idempotent via update-by-device); QA-preflight pending counts now scoped per-job so another job's unsynced data can't block or reassure this submit |
| PR-12 | Customer report privacy not enforced by a central sanitizer/test | P1 | Privacy | fixed | PDF generators use typed projections (no raw rows) | `security: central customer-safe report sanitizer` + `security: route all customer PDFs through sanitizer` | `customerSafeReport.test.ts` (10) | eng | Exclude-by-default allow-list serializers for every customer-facing PDF shape (inspection, compliance, invoice, quote, repair-quote, building-quote), wired at all 7 router call sites + seeded-field regression test covering each shape |
| PR-13 | Root audit docs sprawl; no single active register | P2 | Docs | fixed | many root `*_AUDIT.md` | this pass | this file + `docs/README.md` | eng | Migrate findings here over time |

## How to use this register
- Add a row per finding with evidence (file/line or commit).
- Link the fix commit and the validation (test name or manual step).
- Don't create a new root `*_AUDIT.md` for ongoing work — record it here.
- Root audit files remain for history; see `docs/audits/README.md`.
