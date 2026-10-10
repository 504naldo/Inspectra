# EWF Sprinkler Desk integration — first workflow

## Baselines and service boundary

Inspectra main: `179e8c8c898a8a74309f7a5acece34c971f2c1f6` (merged PR18).
EWF main: `2586f6fc804f5c444490a8e5d6814f165e104761` (schema 17, PR4).
Inspectra's baseline suite passed 1,242 tests with 14 existing skips. EWF's
baseline passed 180 tests on Node 22.23.3 and 24.19.0, with zero audit findings.
This does not certify Inspectra's failed production deployment or its schema.

Inspectra is React 19/Vite/TypeScript, Express/tRPC and Drizzle/MySQL, with
Google/JWT authentication, company tenancy and separate customer organization
restrictions. Platform admins have the documented cross-company guard bypass.
EWF is a standalone Node/native-SQLite service, schema migrations and escaped
vanilla-JS PWA. Staff permissions are admin, estimator, dispatcher, accounting
and explicitly assigned technicians. Its original Railway `/data` volume remains
its authoritative store. No dependency or infrastructure change is introduced.
Playwright is temporary validation tooling only, not an application dependency.

The first release uses native Inspectra screens and a narrow server-to-server
adapter. It does not embed EWF or reverse-proxy its staff session. EWF keeps
same-origin cookies/CSRF, frame DENY, CSP frame-ancestors none and root-scoped
assets/service worker unchanged. EWF's standalone authenticated application
continues to own the remaining operations. Future unified navigation must add
reviewed DTO/command adapters per feature rather than tunnel arbitrary routes.

## Ownership and explicit mappings

| Record | Authority | Mapping / first-release behavior |
|---|---|---|
| Inspectra account/company | Inspectra | Authenticated server identity; roles are never supplied by browser to EWF |
| EWF staff account/permissions | EWF | Operator-reviewed client account map; active EWF role/assignment checked on every request |
| Property/customer organization | Inspectra source | Parent company/org checked; a retained `inspectra_properties` mapping identifies one EWF projection per client/company/site |
| Inspection deficiency | Inspectra source | Retained `inspectra_links` maps client/company/deficiency to EWF projection and quote, preserving full operational source/version/hash |
| Quote/estimate | EWF SQLite | Draft quote created once or explicitly linked to an allowlisted reviewed draft; commercial scope and selling prices remain office work |
| Approval, WO, appointment/visit, stock, equipment, invoices and financial audits | EWF SQLite | No duplicate ledger in Inspectra; subsequent adapters must reuse existing EWF commands and invariants |

Contacts, passwords, session cookies, access codes, selling prices and office
customer notes are not source context. The projection is not a bidirectional
sync and never marks the Inspectra deficiency repaired/compliant. EWF's initial
projection status is operational draft context; original severity/status are
retained verbatim in the integration snapshot and shown in Inspectra. New
Inspectra property/source changes cause a conflict; no automatic rebinding or
historical overwrite is permitted. Property correspondence changes need a
separately reviewed reconciliation workflow, currently unavailable.

This first adapter permits exactly one configured client/company per EWF instance.
EWF native office permissions are organization-wide, so sharing its database
between Inspectra companies would bypass tenant isolation through the native UI.
Multi-company consolidation requires a separate native tenancy design or separate
EWF instances; it is not supported by merely adding another key.

Each EWF integration client is bound to exactly one Inspectra company and a
separate >=32-character secret supplied securely at future release configuration.
Inspectra chooses its company binding from guarded parent records, including
for platform admins, and its actor from the authenticated session. A timestamped
HMAC over nonce and canonical parsed JSON authenticates the exact command;
60-second freshness and persisted nonces reject replay. HTTPS is required outside
local nonproduction validation; redirects are rejected. Keys stay server-side.
No credentials are provisioned, shared with a browser, rotated or activated here.

Do not infer account correspondence from email/name, auto-create accounts,
forward an administrator session or trust asserted roles. Mapping/activation is
an account-access decision requiring approval. Unsupported enrolled MFA accounts
and MFA-required EWF deployments fail closed: this adapter does not attest MFA.
Optional MFA policy and existing enrolled-account protection remain unchanged.
A future verified factor/delegation design requires separate approval.

## First complete workflow

1. Office navigation: **Sprinkler Desk**, choose Inspectra property and deficiency.
2. Review displayed source and explicitly create/link the draft. Existing quote
   linking additionally requires an operator allowlist, current quote revision,
   editable/unapproved/unassigned state and matching property/deficiency context.
3. Assign an active mapped technician. EWF enforces manager-only assignment.
4. Assigned fitter enters total person-hours, structured parts, proposed scope,
   restrictions and internal notes. Two fitters × four hours is eight hours.
   Hours use integer hundredths; parts use thousandths without selling prices.
   Invalid precision is rejected instead of rounded.
5. Save draft, explicitly submit saved content, and perform explicit office
   review. Draft edits/review use original row/quote revisions. Submitted content
   remains immutable using existing EWF database triggers and commands.
6. Return using the retained Inspectra workspace link. Quotes remain drafts:
   review does not copy fitter suggestions into commercial scope/prices.

Technician reads/writes require the exact active EWF fitter assignment; account
changes partition Inspectra queries and remount private form state. Customers
cannot enter the route/API. Integration assignments do not grant general EWF
property/job/financial access or change Inspectra offline sync permissions.
Fitter estimates require connectivity and never enter either app's offline visit
queue or generic replay store. API responses remain no-store. Uncertain responses
require reloading/reconciling the retained state; opening a link and reusing the same active assignment are idempotent. The adapter
returns the retained request for the same fitter/source/brief; changed briefs or
versions require reviewed cancellation and reissue. Content updates and review
retain their original revisions, so lost-response retries conflict instead of
rewriting evidence.

## Gates retained

No integration command approves a quote, generates a work-order number, alters
scope/prices/billing, sends mail, reserves inventory, records visits or advances
closeout. Work-order numbers remain manually entered, normalized uniquely and
audited on correction. Existing revision/reapproval, evidence-backed closeout,
manual invoice-number gates, ledger immutability and assigned-account checks are
unchanged. Recorded planning/checklists never authorize impairment/shutdown or
certify compliance. Customer links/mail stay disabled; accounting is CSV-only.

## Configuration and migration rehearsal

Both integrations default off. Future approved configuration uses
`EWF_INTEGRATION_ENABLED=true` and server-only `EWF_INTEGRATION_BINDINGS` in
Inspectra (companyId, clientId, HTTPS url, key); EWF uses
`EWF_INSPECTRA_ENABLED=true` and `EWF_INSPECTRA_CLIENTS` (id, companyId, key,
accounts map from verified Inspectra IDs to EWF IDs, optional allowedQuoteIds).
These names describe a contract, not permission to configure production.

EWF additive transactional migration 18 stores only property/link snapshots and
replay metadata. Inspectra adds no migration. Staging must restore a verified
attachment-aware bundle into a new directory, rehearse schema17→18, compare
counts/manual references/ledger totals/field evidence and exact retained source
JSON, and repeat execution. Tests rehearse transaction interruption/rollback,
retry and restore on fictional data. No sanitized live-data rehearsal occurred.

Before release: freeze integration/operational writes, verify a full SQLite plus
attachment bundle and independent restored copy, retain the original `/data`
volume and MFA escrow. Prefer disabling the adapter and a schema18-compatible
forward recovery image. Do not delete mappings or rewrite schema history to run
an older image. A pre18 restoration uses a new directory and original release
artifact; reconcile every post-backup estimate, source link, billing/field/stock
change first. Synthetic backup verification is not production backup/PITR proof.
No migration, switch, deployment or integration activation is approved here.

## Validation and remaining work

The release PR records final executed commands. Cross-app fictional check:
`DATABASE_URL=mysql://root@127.0.0.1:3306/inspectra_disposable node scripts/checkEwfIntegration.mjs`
requires the sibling EWF checkout (`EWF_CHECKOUT` override), Node22+, temporary
Playwright (`EWF_PLAYWRIGHT_MODULE`) and Chromium (`EWF_CHROMIUM`). It creates/drops
its own MySQL DB, uses temporary SQLite, fake sessions and blocked external
browser requests. Screenshots contain fictional records only.

Remaining integrations: commercial quote editing and approvals, manual WO,
scheduling/dispatch, multi-visit materials/testing/restoration/closeout, billing,
inventory/equipment/reporting, current-context reconciliation/cancellation,
verified MFA delegation, durable command-retry UX and assigned-request discovery
for technicians. Each requires narrow DTOs, permission/tenant/financial/evidence
regressions and device/PWA checks. This PR does not integrate the entire suite.

Fictional screenshots: [submitted fitter](screenshots/fictional-fitter-submitted.png) and [office review](screenshots/fictional-office-review.png).

## Verified development checks — 2026-10-10

| Status | Check | Evidence |
|---|---|---|
| Passed | EWF baseline | Schema17 / PR4 current main; 180 tests on Node22.23.3 and24.19.0 |
| Passed | EWF final regressions | 185 tests on Node22.23.3 and24.19.0; zero skips/failures |
| Passed | EWF browser/PWA | All ten existing Chromium scripts; fictional desktop/mobile/permissions/private cache/offline/document workflows |
| Passed | Cross-app browser | Real Inspectra and EWF services, isolated MySQL/SQLite; 8 hours, parts, saved/submitted/reviewed content, return link and account/customer denial; 390px viewport |
| Passed | Inspectra final tests | 119 files / 1,249 tests, zero failures |
| Skipped | Existing Inspectra tests | 14 tests in four files: S3-dependent, disabled Phase2, existing auto-mapping |
| Passed | Inspectra check/build/smoke | Typecheck, production build and isolated built health/UI; existing build warnings |
| Passed | Tenant audit | 61 router files / zero active findings / two reviewed exceptions |
| Passed | EWF security audit | npm audit --omit=dev: zero vulnerabilities; no dependency changes |
| Failed | Inspectra dependency audit | Existing lockfile: 75 findings (11 low,41 moderate,20 high,3 critical); no dependencies changed; separate remediation remains a release gate |
| Passed | Migration rehearsal | Fictional schema17 bundle→18, transaction interruption/rollback/retry/repeat, restored pre-change artifact and unchanged quotes/manual references/retained evidence |
| Failed, resolved | Mobile regression | Displayed long source hash overflowed; wrapping fixed and browser assertion passed |
| Unrun | Lint | Inspectra has no lint script/config; whitespace checks passed, not a lint substitute |
| Unrun | Release-only evidence | Node22.13 exact local run (22.23 tested; EWF CI targets22.13), Android/native, approved live identity/MFA delegation, production backup/staging restore and activated HTTPS integration |

No real email, customer link activation, production migration, credential change,
volume replacement, infrastructure update or deployment occurred. Hosted checks
and draft PR publication state belong in the PR, not inferred from local results.

Final adapter checks also verify atomic quote/property/deficiency/link rollback
on audit failure, safe retry and reuse of the existing EWF quote-number policy.
Work-order numbering remains untouched.

Changed Inspectra source remains readable as retained original evidence with an
explicit stale/read-only flag; assignment/save/submit/review reject it. The
adapter never rebinds the retained snapshot to current source facts.

Existing Inspectra inspection, quote, work-order, invoice and inventory records
retain their current Inspectra ownership. EWF authority applies to its own
operational/financial records; this release does not merge, copy or total the two
ledgers. Historical consolidation, duplicate matching and shared reporting need
separate reviewed ownership/reconciliation decisions. A configured tenant cannot
be relabeled after retained property mappings exist.

The signed actor classification is derived only from the authenticated Inspectra
server context; browser roles are never accepted. Technician delegation requires
an EWF technician account and explicit fitter assignment, even if an operator
misconfigured a privileged account map. Assign/review additionally require
Inspectra office permission. Cached private queries and form state include role
as well as user/company identity.

Existing-draft linking currently requires exactly one matching EWF deficiency.
Multi-deficiency quote correspondence needs an expanded reviewed source contract.

Migration18 also retains the reviewed EWF operational property/deficiency
projection separately from the Inspectra source. Changes on either side force
read-only historical access and reject new assignments/updates. Assignment
forms pin the explicitly reviewed EWF quote revision; a refresh cannot silently
replace that review with a newer revision. Current quote context is labeled
separately from the retained source.
