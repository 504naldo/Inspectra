# Inspectra — Production Hardening Plan

**Branch:** `claude/inspectra-production-hardening`
**Date:** 2026-06-30
**Scope:** Focused hardening of the technician→invoice workflow, authorization, financial integrity, routing, and production readiness. No new major modules, no 3D map, no new integrations, no destructive production-data changes.

Evidence below is from direct code reads. Each area lists current state, the confirmed issue, affected files, approach, acceptance criteria, and validation.

---

## 1. Separate app entry from marketing site
- **Current:** `client/src/pages/Home.tsx` renders the full marketing site via `client/src/components/landing/{Navbar,Hero,Features,HowItWorks,FAQ,CTABanner,Footer}.tsx`. The marketing site now lives in `504naldo/inspectra-website`, so this is duplicated.
- **Issue:** Full marketing site shipped inside the secure app; landing components used only by `Home.tsx` (verified: no other importers).
- **Affected:** `Home.tsx`, `components/landing/*` (7 files), `const.ts`, `.env.example`.
- **Approach:** Replace `Home.tsx` with a lightweight `AppEntry` (logo `/inspectra-logo-cut.png`, short app message, Sign In → existing `getLoginUrl`, optional website link via `VITE_INSPECTRA_WEBSITE_URL`, role-redirect for authed users, responsive). Delete `landing/*`. Add env var. Reuse existing OAuth flow — no second auth system.
- **Acceptance:** unauth `/` = light entry; auth `/` redirects; `/login` works; no marketing duplication; no broken imports; website link configurable; responsive.
- **Validation:** `pnpm check`, `pnpm build`, grep for dangling `components/landing` imports.

## 2. Remove unsupported claims
- **Current:** Marketing/landing copy and docs may assert certifications.
- **Issue:** Unverifiable SOC2/ISO/PCI/NFPA/"fully compliant"/"production-ready 3D" claims.
- **Affected:** repo-wide text (mostly removed with landing/*), remaining docs/UI strings.
- **Approach:** grep the listed terms; remove/soften to approved wording. Add `docs/TRUST_CLAIMS.md`.
- **Acceptance:** no unsupported certification/compliance guarantees remain; feature wording accurate.
- **Validation:** grep returns only approved/neutral usages.

## 3. Centralize route-ID parsing
- **Current:** `App.tsx` route table uses raw `parseInt(params.id)` in 15 places (jobs, devices, deficiencies, sites, approved work, invoices, service agreements, parts requests, purchase orders, etc.).
- **Issue:** `parseInt("12abc")=12`, `parseInt("")=NaN`, negatives/decimals/zero pass through → components mount with `NaN`, tRPC queries run with invalid IDs.
- **Affected:** `client/src/lib/routeParams.ts` (new), `App.tsx`, new tests.
- **Approach:** `parseRequiredRouteId(value): number | null` (positive integer only; rejects empty, decimals, negatives, zero, `12abc`, `NaN`). A `<NumericRouteParam>` wrapper renders `NotFound` on invalid, else passes the parsed id. Update all numeric routes.
- **Acceptance:** no raw `parseInt(params…)` in route table; invalid IDs → controlled NotFound; valid IDs work; types pass.
- **Validation:** unit tests; `pnpm check`.

## 4. Catch-all routing
- **Current:** `App.tsx` final route `<Route><Redirect to="/"/></Route>`.
- **Issue:** Unknown URLs silently bounce to `/` (and then re-redirect authed users), masking typos.
- **Approach:** Final route renders `NotFound`. Keep `/404`, auth redirects, portal preview.
- **Acceptance:** unknown URL → Not Found; valid routes work; mistyped authed URLs don't bounce through landing.
- **Validation:** manual + build.

## 5. Root redirect cleanup
- **Current:** `Router()` `useEffect` hard-redirects authed users off `/` via `window.location.href`, with an **unconditional** `console.log("[AuthGuard]…")`. `Home`/`getRoleBasedPath` also overlap.
- **Issue:** noisy production console; duplicated redirect logic; hard redirect undocumented.
- **Approach:** One authoritative helper; gate logging behind `import.meta.env.DEV`; keep the hard redirect (documented mobile-Chrome reason) isolated with a loop guard; light entry shows immediately for unauth (no indefinite spinner).
- **Acceptance:** one redirect path; reliable dashboard arrival; quiet prod console; no infinite spinner.
- **Validation:** build + manual smoke.

## 6. Tenant-scoped data-access patterns
- **Current:** `assertJobCompany` exists (`db.ts`) and `tenantGuards.ts` has `assertAttachmentCompany`. Many routers still load-by-id then compare `companyId`.
- **Issue:** Easy to omit ownership checks; some procedures may trust client `companyId`.
- **Approach:** Add reusable scoped getters in `tenantGuards.ts` (`getJobForCompany`, `getSiteForCompany`, `getInvoiceForCompany`, `getDeficiencyForCompany`) enforcing `id = ? AND companyId/derived = ?`; apply to high-risk procedures. Never trust client `companyId` — derive from `ctx.user`. Not a DB-layer rewrite.
- **Acceptance:** confirmed unscoped procedures fixed; helpers exist; client company IDs ignored; same-company flows unaffected.
- **Validation:** Part 7 authorization tests.

## 7. Automated authorization coverage
- **Current:** `server/crossTenantSecurity.test.ts` covers inspection paths.
- **Approach:** Add `server/authorization.test.ts` (real-DB) with reusable factories covering jobs, reports, deficiencies, users, invoices, media, AI — same-company allow vs cross-company forbid, staff vs customer scoping, reads + mutations.
- **Acceptance:** tests fail if ownership checks removed; deterministic.
- **Validation:** `pnpm test` (CI mysql:8).

## 8. Capability-based permission review
- **Current:** role procedures `officeProcedure`/`adminOrOfficeProcedure` etc. Some sensitive actions open to both admin+office.
- **Approach:** Audit existing access-control. If capabilities exist, enforce server-side; else add a **minimal** centralized `can(user, capability)` helper mapping roles→capabilities for the most sensitive ops (users.manage, payroll.export, invoices.export, integrations.manage, reports.approve). Backend mandatory; frontend secondary. No full RBAC rebuild.
- **Acceptance:** office doesn't auto-get every sensitive permission unless intended; centralized; documented.
- **Validation:** targeted tests + check.

## 9. Invoice paid/terminal-state hardening
- **Current:** `invoiceRouter` has `recordPayment`/`markPaid`-style + `exportSage` + void + `isInvoiceLocked`. `recalculateInvoiceTotals` derives from line items.
- **Issue:** documented risk that paid-state can use stale totals; need atomic recalc+validate+lock; block line-item edits after terminal states; block duplicate terminal mutations.
- **Approach:** On pay: scope-load, eligibility check, recalc from authoritative line items, compare payments to fresh total, conditional update guarded on current state to avoid double-apply, activity log. Keep edits blocked when locked. Document platform transaction limits.
- **Acceptance:** stale totals can't mark paid; terminal states consistent; duplicates blocked; audit written; tests pass.
- **Validation:** new invoice integrity tests (real DB).

## 10. Core workflow validation
- **Approach:** Trace Customer→…→Invoice; add one integration test asserting ID linkage, company scope, valid transitions, idempotent conversions; `docs/CORE_WORKFLOW_VALIDATION.md` with the path, records, transitions, idempotency, manual smoke checklist. Fix confirmed blockers only.
- **Acceptance:** documented authoritative path; repeated conversions don't duplicate; major transitions testable.

## 11. Offline/sync safeguards
- **Approach:** Audit sync router + queue; ensure jobs synced only if authorized + scoped; idempotency keys + server-side duplicate detection; QA preflight surfaces failed-critical items; "synced" only after server confirm. Focused tests (duplicate retry, unauthorized sync, stale/finalized rejection). No full rewrite.
- **Acceptance:** offline work not falsely "synced"; retries safe; unauthorized sync rejected.

## 12. Customer-facing PDF privacy
- **Approach:** Audit report assembly; introduce `buildCustomerSafeReportData()` projection excluding internal notes, site/monitoring/lockbox codes, AI prompts, payroll/cost, storage keys, draft text. Tests seed sensitive fields and assert absence. `docs/CUSTOMER_REPORT_PRIVACY.md`.
- **Acceptance:** renderers consume sanitized data; prohibited fields excluded; tests guard regression.

## 13. Documentation consolidation
- **Approach:** Add `docs/` structure (`architecture/ audits/{active,archive}/ runbooks/ security/ workflows/`) with `docs/README.md`, `docs/audits/README.md`, and the single active register `docs/PRODUCTION_READINESS.md`. Index in place rather than risky bulk moves of root audit files.
- **Acceptance:** current status findable; active vs historical distinguished; no history lost.

## 14. Dead code cleanup
- **Confirmed dead (no importers):** `client/src/pages/ComponentShowcase.tsx`, `client/src/components/DashboardLayout.tsx`, `components/landing/*` (after Part 1). Remove placeholder `/some-path` links if present. Only confirmed-unused.
- **Acceptance:** no broken refs; no placeholder nav; check passes.

## 15. Migration & deployment safety
- **Approach:** `docs/runbooks/DEPLOYMENT.md` (backup → review SQL → staging test → apply → verify version → deploy → smoke → rollback; no auto destructive backfills). Document the dual migration history + startup runner already present. No auto production migrations.
- **Acceptance:** explicit process; no silent destructive migrations; mismatch risk documented.

## 16. Tests & validation
- Run `pnpm check`, `pnpm test` (against local MySQL 8), `pnpm build`. Targeted tests per part. No mutating backfills, no production migrations.

---

### Execution order & commits
1. `refactor: separate app entry from marketing site` (Parts 1, 14-landing)
2. `fix: harden routing and route parameter validation` (Parts 3, 4, 5)
3. `security: strengthen tenant-scoped data access` (Part 6)
4. `test: add cross-tenant authorization coverage` (Part 7)
5. `fix: harden invoice terminal state transitions` (Part 9)
6. `fix: strengthen offline sync safeguards` (Part 11)
7. `security: sanitize customer-facing report data` (Part 12)
8. `docs: consolidate production readiness and deployment guidance` (Parts 2, 8, 10, 13, 15)

Honest status and any deferred items are recorded in `PRODUCTION_HARDENING_RESULTS.md`.
