# Inspectra isolated staging setup plan

Prepared October 16, 2026 (America/Vancouver). **Plan only; provisioning and deployment are not approved.**

## Discovery result

Read-only Railway discovery inspected all **21 accessible projects, 22 environments and 30 services**, including repository sources. The only service sourced from `504naldo/Inspectra` is:

| Resource | Observed value |
|---|---|
| Workspace | `504naldo's Projects` (`a3f1a23e-c267-4574-97fa-b9313046e4f0`) |
| Project | `innovative-reprieve` (`b594cb45-0b33-4e6e-b3f1-afbefea37457`) |
| Environment | `production` (`acc3b1c9-1755-4f26-8703-263669598d49`) |
| Service | `Inspectra` (`4a7b9797-4ad6-4029-a828-80224babea2b`), source branch `main` |

**No existing isolated Inspectra staging deployment was found in this connected inventory.** Other applications' staging environments are unrelated and will not be reused. No variable values, production credentials or customer records were read or copied for this plan.

## Proposed resources and isolation

Create a **new project `inspectra-staging`**, with a fresh **empty `staging` environment**, in the workspace above if that workspace is approved. Do not use Duplicate Environment, Sync from production, production volume clones or production database snapshots: duplication copies configuration and variables. Leave any default-named `production` environment in the new project empty.

| Resource | Proposed configuration |
|---|---|
| Application | One `inspectra-staging` service; Node 22, pnpm 10.4.1; one replica in US West/Oregon (`us-west2`); initial limit 1 GB RAM / 1 vCPU. |
| Database | New single-node **MySQL 8.0**, explicitly pinned to the reviewed version/digest; one replica, initial limit 2 GB RAM / 1 vCPU; 5 GB volume. Keep synthetic used data below 2 GB initially. Do not accept an unreviewed newer template default. This is a self-managed test database, not an HA/PITR service. |
| Database connection | A new database/schema and application login restricted to that staging schema, with reviewed runtime/preflight privileges. Keep its root/maintenance credential separate. App connects over Railway private networking; no public MySQL TCP proxy by default. |
| Object storage | New private Railway bucket, US West (`sjc`), new bucket-only credentials; initial synthetic-data allowance 5–10 GB. Private means authenticated access over public HTTPS, not Railway private networking. |
| Public access | New Railway-generated HTTPS app domain; `/health` healthcheck. No production hostname/DNS change. Limit login to dedicated Google test users and pre-registered staging membership. |
| Source | A staging-only branch derived from the reviewed audit implementation; explicit reviewed commit for the first staging deployment. No main merge. Keep automatic production/source updates out of this setup. |
| Duration | Initial 48-hour window starting with the first billable staging resource. Proposed retention: synthetic data/evidence for seven days after stopping, then approved cleanup of only the newly created staging resources. |

A separate project isolates resources and avoids production variable inheritance, but shares workspace billing and administrators. If an independently enforced spending boundary is required, use a **separate staging workspace** instead; its subscription minimum needs separate approval. Environment-specific access restrictions are plan-dependent; do not assume a staging environment alone creates a separate access-control boundary.

Current connected tools do not expose empty-environment creation or Railway `source.checkSuites`. An authorized operator must use the dashboard or an authenticated supported CLI for those steps. Do not reconnect the existing production source as a workaround. Set the new staging service's Wait for CI gate and verify its exact source/configuration before connecting code; source connection can start a build immediately.

## Estimated costs and spending controls

All figures are **USD**, before tax, currency conversion and third-party provider charges. Official Railway rates checked on the date above: RAM **$10/GB-month**, CPU **$20/vCPU-month**, volumes and incremental snapshots **$0.15/GB-month**, service egress **$0.05/GB**, bucket storage **$0.015/GB-month**. Builds, bucket operations and bucket egress are free under the published rates; uploading from an app service can still incur service egress.

These are **average-use scenarios**, not allocations or guaranteed bills. The monthly calculation uses a 30-day window.

| Assumption | Light synthetic use | More headroom |
|---|---:|---:|
| Average app + DB RAM | 0.5 + 0.5 GB | 1 + 1 GB |
| Combined average CPU | 0.1 vCPU | 0.4 vCPU |
| Used DB volume / incremental snapshots | 2 / 0.5 GB | 2 / 1 GB |
| Bucket data | 5 GB | 10 GB |
| Monthly paid service egress | 10 GB | 50 GB |
| **Monthly resource usage** | **$12.95** | **$31.10** |
| **48-hour resources**, with 2–10 GB session egress | **about $0.94** | **about $2.41** |

Budget about **$1–$3 for 48 hours**, or **$13–$32/month** if retained. The proposed runtime ceilings allow up to 3 GB RAM and 2 vCPU combined: sustained maximum use would be about **$70/month for compute alone**, plus storage/traffic. Limits do not guarantee the average-use estimate.

**Proposed approval:** a 48-hour run with a **$10 incremental resource-spend authorization**, up to **$1 additional synthetic-storage retention allowance** for seven days after stopping, manual review before extension/additional resources, and a **$40/month review threshold** if retained. These are operating budgets, not automatic hard caps. Verify billing attribution and the monitoring/stop owner before starting. Prepare accounts/build prerequisites first so paid resources do not sit waiting for a tester.

| Billing detail | Effect |
|---|---|
| Existing workspace | Another project does not add another subscription. Incremental billing depends on its current plan, other workloads and unused included credit; those billing facts were not read. |
| New workspace | Hobby is at least $5/month if eligible; Pro is at least $20/month and is the team baseline. Included usage offsets the minimum: $31.10 usage on Pro is $31.10, not $51.10. A short run can still incur the monthly minimum. No subscription purchase/upgrade is approved. |
| Alerts and hard limits | Soft alerts do not stop spending. A compute hard limit applies to the **whole workspace** and can stop every workload, including production. Do not set a low staging cap in the existing production workspace. An isolated hard limit requires the separately approved staging workspace. |
| Stopping and retention | Stopping services does not delete billable volumes, snapshots, objects or a workspace subscription. Cleanup/cancellation needs the scope approved below. |
| Backups | Staging snapshots consume additional storage and are not production recovery evidence. Railway manual snapshots have a 50%-of-volume-capacity data limit; review capacity before expanding the dataset. Native buckets do not provide automatic backups/versioning/object lock/lifecycle retention. |

Google test mailboxes/licences, Sage licences, optional AI/Maps usage, Android hardware/device farms and operator time are excluded. Keep optional paid integrations disabled until a provider-specific budget is approved.

## Secure configuration and credentials

Enter credentials through the **new staging service/environment settings**, using sealed/write-only variables where supported, or an approved secret manager. Never paste secrets into chat, commit them, print them in commands/logs, or copy values from production. Use only new staging resource references. `VITE_*` settings are compiled into browser assets and must never hold secrets.

| Category | Exact variable names | Source / handling |
|---|---|---|
| Runtime | `NODE_ENV=production`, `APP_URL`, `PORT` | Production build mode on staging; new staging HTTPS origin without trailing slash; Railway-provided/configured app port. |
| Database | `DATABASE_URL` | New staging schema's restricted app login over private networking. Keep the new DB root/migration credential with the maintenance operator; never give the browser either credential. |
| Sessions | `JWT_SECRET` | Generate a new independent cryptographically random secret, at least 32 characters. |
| Google web login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | New OAuth web client in a separate Google test project. Client secret is server-only. |
| Google browser build | `VITE_GOOGLE_CLIENT_ID` | Same staging client ID; public, available at build time. |
| Membership | `ADMIN_EMAILS`; `COMPANY_DOMAIN` left empty | Only explicitly approved staging platform operators. Pre-register individual test identities; no blanket domain activation. |
| Storage | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, conditional `S3_ENDPOINT` | New private bucket credentials only. Browser-reachable HTTPS endpoint. Use the actual provider region/style; R2 would use its own endpoint and `auto` region if separately chosen/approved. |
| Automated email | `EMAIL_AUTOMATION_ENABLED=false`, `REPORT_NOTIFICATIONS=false` | Keep both off. They do **not** disable explicit Send actions. |
| Explicit Resend testing | `RESEND_API_KEY`, conditional `NOTIFICATION_EMAIL` | Leave key unset initially. Only add a separate test account/key after the sender/test-adapter gate below; use a controlled test inbox for notifications. |
| Drive | `GOOGLE_DRIVE_CUSTOMER_ROOT_ID`; conditional `GOOGLE_DRIVE_SHARED_DRIVE_ID`, `GOOGLE_DRIVE_USE_SHARED_DRIVE` | Fresh synthetic-only folder. Shared-drive values only for a separate test shared drive; otherwise false/unset. |
| Optional Maps | `GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY` | New restricted server/browser keys with test quotas. Browser key is public. Leave unset if not testing Maps. |
| Optional AI | `OPENAI_API_KEY` | Separate capped test project; otherwise unset. |
| Optional native push | `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Separate Firebase project; service-account JSON is a server secret. Staging Android app needs its own Firebase registration/configuration. |
| Optional public branding | `VITE_APP_ID`, `VITE_INSPECTRA_WEBSITE_URL` | Staging identifier/link; not secret and not an isolation boundary. |

Leave legacy `CUSTOMER_SHARE_*`, `OWNER_OPEN_ID`, `OAUTH_SERVER_URL` and `BUILT_IN_FORGE_*` unset. Leave analytics configuration absent for this acceptance run. Google access/refresh tokens are produced by dedicated users' interactive consent and stored only in the new database; do not enter production tokens or invent token environment variables.

Google setup: OAuth consent in **Testing**, with only named dedicated test users; enable Gmail, Calendar and Drive APIs. Register the exact staging origin and `${APP_URL}/api/oauth/callback`. Current login requests `openid`, `email`, `profile`, `gmail.compose`, `calendar.events`, `drive.file` and `drive.readonly`. Protect those test accounts with normal account security; passwords/MFA stay with their operators and are never application environment variables.

## Implementation gates before first staging acceptance

These are prerequisites to prepare/review on the staging branch, not changes performed by this plan:

1. **Synthetic seed and migrations.** Prepare a reviewed routine that refuses a nonempty/unidentified database. Apply the fresh journal through **0042** in an explicitly staging-only maintenance job, then verify required schema and all six guards. Prove startup using the restricted application login: `information_schema.TRIGGERS` visibility needs appropriate privileges, so CRUD-only grants may fail the guard preflight. Review exact schema/runtime/maintenance grants; do not bypass verification or silently use root. Do not mix/replay manual history or enable production startup migrations. Seed two synthetic companies; one platform operator; an office, technician and customer identity per company; synthetic sites/devices/templates/jobs/quotes/invoices/documents. Use distinct approved Google test emails with `pending_<uuid>` identities and explicit company/role membership. Existing legacy seeds contain real names or first-company assumptions and are unsuitable unchanged. Do not use production dumps, real signatures, reports, customer addresses or workbooks. Admin is cross-tenant by design; use office/technician/customer accounts for isolation tests.
2. **Storage URL style.** Current `server/storage.ts` forces path-style URLs for custom endpoints, and `storageDownload.ts` validates that layout. New Railway buckets generally declare virtual-hosted style. Read the new bucket's non-secret style metadata and prove compatibility before attaching the app. If incompatible, review/test a staging-branch SDK + exact URL-binding change or separately approve an alternative S3/R2 bucket. Do not weaken SSRF/ownership checks or assume an environment variable fixes this.
3. **Explicit email guard.** Current Resend sends hardcode `noreply@inspectrafire.ca`; no configurable sender, recipient allowlist or generic test-mode toggle exists. Review a staging sender/testing-adapter and controlled-recipient strategy before inserting a Resend key or pressing Send. Default-off automation is not an outbound kill switch. Do not verify/use production sending domains or alter their DNS as part of this approval.
4. **Google effects.** Google has no general Gmail/Calendar sandbox toggle. Use dedicated test mailboxes and disposable **primary** calendars: current Calendar writes target the caller's primary calendar and use `sendUpdates=all`. Approve only controlled test recipients/attendees and synthetic Drive folders before provider actions. Mock-provider success and OAuth Testing status do not prove real delivery or prevent real messages.
5. **Native routing and login.** `client/src/lib/native.ts` currently hardcodes `https://app.inspectrafire.ca/api/trpc`. Browser OAuth derives callback from the current origin, which is normally `https://localhost` in Capacitor, while backend exchange uses `APP_URL`. Prepare/review explicit staging API routing and a working native OAuth/session/deep-link flow: external-browser authorization code with PKCE/state, validated app links and a reviewed session handoff. Keep `GOOGLE_CLIENT_SECRET` out of the APK and JWT/refresh tokens out of callback URLs. Setting `APP_URL` or a new `VITE_*` value alone does not retarget/authenticate the current APK. Use a distinct staging application ID, visible name and signing key. Verify destination/cookies/egress before launch; never install the current production-pointing APK for this test.
6. **Sage test company.** Integration is CSV export/import, not a Sage API. No `SAGE_*` secret is needed. Use an isolated Sage 50 sample company, licensed import access if required and accountant-reviewed synthetic customer/GL/tax/department codes.
7. **SheetJS.** The installed `xlsx 0.18.5` vulnerability remains open. Allow official `cdn.sheetjs.com` retrieval through the supported environment configuration workflow, or supply an authenticated upstream artifact. Verify/pin the official patched artifact and lockfile before accepting untrusted workbooks. Synthetic staging tests do not resolve the advisory.

## Exact approvals required

No provisioning request has been executed. Approval must identify these concrete scopes:

| Approval | Proposed scope / decision |
|---|---|
| A — Workspace and resources | Existing workspace `a3f1a23e-c267-4574-97fa-b9313046e4f0`; new `inspectra-staging` project and empty `staging` environment; one app, one MySQL 8.0 service/5 GB volume and one private bucket; regions/limits as above. Choose a separately billed workspace instead only with its own explicit plan/spend approval. |
| B — Spend and lifetime | 48 hours from first billable resource, $10 incremental resource authorization/review threshold, named billing monitor; review before extension. Confirm any new-workspace subscription floor separately. No existing-workspace hard-limit change. |
| C — Data and maintenance | Fresh staging-only schema, reviewed synthetic seed, exact restricted runtime/preflight/maintenance grants and named test identities; new independent credentials. Approve any staging snapshots/restore resources separately. No production data/secrets/snapshot duplication. |
| D — First staging deployment | After implementation gates are reviewed and CI passes, approve the exact staging branch/commit, new app service/domain and deployment. The audit implementation currently tested is GitHub `2e919f9e303c42125a306cfc5f1e2fdb104ba4d3` ([green run](https://github.com/504naldo/Inspectra/actions/runs/38999316236)); future staging changes need their own reviewed SHA/checks. Resource approval alone is not first-deploy approval. |
| E — Provider effects | Name dedicated test Google/Resend/Firebase/optional API accounts, controlled recipient/attendee list, synthetic Drive root and Sage sample company. Approve provider calls and any paid quotas only after the guard/adapter review; no real customer/staff messaging. |
| F — Android | Approve the staging-only app ID/signing/build, physical device/tester and controlled network; verify no production endpoint before installation/launch. |
| G — Stop and cleanup authority | Before provisioning, name the operator and confirm a supported stop/remove-deployment path for only new staging workloads at 48 hours, with staging auto-deploy disabled so later pushes cannot restart them; allow up to $1 additional synthetic-storage retention for seven days. Approve deletion of only recorded new staging resource IDs and revocation of only staging credentials after artifacts are saved, or name the human responsible for manual cleanup at that deadline. Subscription cancellation, if applicable, must be explicit. |

Provisioning would start only after **A–C and G** are settled. The app source stays disconnected until D; provider actions wait for E and hardware launch waits for F. If a prerequisite or supported execution path is missing, leave that phase unstarted and report it.

## Physical Android checklist

Use real hardware after the native-routing/authentication gate passes. Full steps and evidence requirements remain in the [Android field runbook](ANDROID_OFFLINE_FIELD_TEST.md), including its [audit addendum](ANDROID_OFFLINE_FIELD_TEST.md#22-audit-acceptance-addendum-device-storage-sessions-and-operation-recovery).

- [ ] Record reviewed app commit, APK digest, staging URL/app ID, signing identity reference, device model, Android/WebView versions, tester and date. Confirm install cannot overwrite production and all API/provider destinations are approved.
- [ ] Sign in as the dedicated technician, cache an assigned synthetic job and verify its packet is Ready.
- [ ] Enable airplane mode; capture device/smoke results, template answers, a deficiency/photo and fire-alarm results/forms. Confirm visible pending records.
- [ ] Force-stop/reopen while offline; persisted captures, account scope and original operation IDs remain recoverable.
- [ ] Reconnect and repeat/double sync; verify exactly one correctly attributed server record per deliberate capture.
- [ ] Reassign while offline and preserve captured work. Separately finalize a job while offline; denied writes stay visible with review/recovery status and no false success.
- [ ] Expire the session, reauthenticate, switch tenants and release delayed responses. Verify no cross-account read/write or loss of the original account's pending data.
- [ ] Inject quota/localStorage/IndexedDB failures in the disposable profile. Verify visible errors, preserved earlier data and no dispatch before durable commit. Exercise blocked QA/legacy recovery without clearing queues.
- [ ] Deny/grant camera permission; take real photos; test haptics enabled/disabled, background/foreground and radio transitions. Capture native errors and tester observations.
- [ ] Capture visibly synthetic technician/contact signatures, generate/download a test PDF and verify rendering in the device viewer. Preserve captured rows and verify failed signature retrieval cannot publish a falsely signed report.
- [ ] Drop a committed synthetic payment response; force-stop/reopen and recover its original UUID/amount/date. Confirm one receipt, then a deliberate second payment with a distinct UUID.
- [ ] With approved test providers, drop accepted quote/repair-quote/invoice/Gmail responses. Recover the same payload/UUID without another provider call; preserve `sending`/`unknown` for reconciliation. Record unsupported native Web Locks/cross-view scenarios explicitly rather than passing them.
- [ ] Perform an in-place same-staging-ID/same-signature APK update with pending work. Separately update the Chrome/PWA service worker; preserve queues/IDs and verify no duplicate effects.

For each case record **PASS / FAIL / UNRUN / UNSUPPORTED**, with sanitized request/receipt counts and before/after queue evidence. An APK build, desktop browser run or prepared checklist is not a physical-device pass.

## What remains open after staging

**Production backup/restore and PITR verification remain open. Historical inspection/report evidence and financial reconciliation remain open.** Synthetic data and a synthetic restore cannot establish production backup completeness, source accounting totals, original inspection facts, past ownership or historical signatures. Staging results must be recorded separately in the [active readiness register](../PRODUCTION_READINESS.md#remaining-release-work-after-automated-acceptance).

Production merge/deploy, production DDL, credential rotation, billing hard-limit changes, provider/customer data mutation and production DNS changes are excluded. No resources, accounts, credentials, provider effects or device results were created by this plan.

## Pricing and platform references

- [Railway pricing](https://docs.railway.com/pricing) and [plan minimums](https://docs.railway.com/pricing/plans)
- [Bucket billing](https://docs.railway.com/storage-buckets/billing), [bucket capabilities](https://docs.railway.com/storage-buckets) and [volume backups](https://docs.railway.com/volumes/backups)
- [Cost controls](https://docs.railway.com/pricing/cost-control), [environments](https://docs.railway.com/environments), [private networking](https://docs.railway.com/networking/private-networking) and [project permissions](https://docs.railway.com/projects/project-members)
- [MySQL service guidance](https://docs.railway.com/databases/mysql)
