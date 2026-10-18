# Ubuntu hosted-runner compatibility — October 17, 2026

## Outcome and exact source

All 26 jobs in [hosted comparison run 39047055020](https://github.com/504naldo/Inspectra/actions/runs/39047055020) succeeded. [Normal PR CI 39047120705](https://github.com/504naldo/Inspectra/actions/runs/39047120705) also succeeded. Both runs used workflow commit `b5b85983dfccb317e4f0431dcb9989b96e616f1d` on `codex/ubuntu-runner-compat-20261017`; [PR #21](https://github.com/504naldo/Inspectra/pull/21) remains draft.

The comparison checked out each candidate by immutable SHA, without merging their features or dependency changes:

| Candidate | Exact commit | Full suite on EACH image | Android on EACH image |
|---|---|---|---|
| main | `179e8c8c898a8a74309f7a5acece34c971f2c1f6` | 1,242 passed; 14 existing skips | assembleDebug passed |
| codex/audit-acceptance-20261017 | `925f365c688993bad5a74b90ea0ad4c49d442a59` | 2,345 passed; 18 existing skips | assembleDebug passed |
| codex/dependency-security / draft PR #20 | `8fefdac3fd0053389524b9f6833214c7f20747f4` | 1,244 passed; 14 existing skips | assembleDebug passed |
| codex/ewf-integration / draft PR #19 | `6f229e5e598fe22ee1e7027f2c2c4723a15848ce` | 1,249 passed; 14 existing skips | assembleDebug passed |

Audit and dependency candidates diverge by 10 and 2 commits respectively from their common ancestor. No candidate branch was changed.

## Actual hosted image evidence

Job setup logs identify GitHub-hosted Azure compute, runner 2.337.0:

- Ubuntu 26.04.1 LTS, `ubuntu-26.04`, image `20261012.163.1`. [Example setup/test log](https://github.com/504naldo/Inspectra/actions/runs/39047055020/job/117437771328).
- Ubuntu 24.04 baseline, `ubuntu-24.04`, image `20261012.334.1`. [Example setup/test log](https://github.com/504naldo/Inspectra/actions/runs/39047055020/job/117437771072).

These are hosted results, not an inference from local Linux. GitHub's [official migration announcement](https://github.com/actions/runner-images/issues/14748) specifies October 19–November 19, 2026.

All candidate core jobs passed frozen installs with each candidate's own pinned pnpm, Node 22, typecheck, strict tenant audit, fresh MySQL 8.0 journal migration, full Vitest suite, PDF regressions, production asset build and isolated built-server smoke. MySQL came from the explicit `mysql:8.0` service container, not the host's database packages; no MariaDB substitution or production database was used. `poppler-utils` installed successfully: `26.01.0-2ubuntu0.2` on 26.04 and `24.02.0-1ubuntu9.10` on 24.04.

Android builds explicitly installed Temurin Java 21, platform-tools, Android platform 36, build-tools 35.0.0 and 36.0.0, then ran Vite, Capacitor sync and Gradle wrapper 8.14.3 `assembleDebug` with Android Gradle Plugin 8.13.0. All eight APKs built and passed nonempty artifact checks. No APK was launched; configured production API hosts were not exercised. Signing/release/device acceptance remains outside this test.

Additional audit-candidate checks passed on BOTH images:

- Official commit-pinned MinIO source built with Go 1.24.2; isolated object storage/HTTP acceptance: 5 files / 16 tests passed.
- Built-UI payment acceptance in real Chromium and fresh loopback MySQL; concurrent tabs/retry handling and synthetic backup/restore/forward recovery passed. No live payment provider was called.
- Playwright 1.62.0 Chromium production-component acceptance with synthetic HTTP fixtures passed.
- PR #20's separate frozen-install dependency audit reported no known vulnerabilities on each image. This does not remediate dependencies in main/audit/PR #19.
- Uptime monitor's actual shell and JavaScript blocks passed 4 health and 4 issue/recovery fixture scenarios on each image. curl/sleep and GitHub issue methods were mocked; the scheduled monitor and real issue/notification actions were never invoked.

## Proposed change and limitations

Draft #21 pins existing main CI and uptime jobs to Ubuntu 24.04 and includes the temporary branch-only comparison workflow and fixture script. The pin is a conservative tested baseline, **not a required workaround for a discovered Ubuntu 26.04 failure**: no compatibility regression was observed in these runs. The temporary comparison workflow has only a push trigger for this exact feature branch, contents:read permission, disabled persisted checkout credentials, no production-secret references and bounded job timeouts. It does not run on main or a schedule. Remove/archive it after evidence review if one-time test code is not wanted in main.

The audit branch's added jobs and PR #20's dependency-audit job still use ubuntu-latest in their own unchanged branches; their tested results above do not silently modify those workflows. No merging, deployment, production configuration changes, credential creation or production data access was performed explicitly.

Warnings: existing optional test skips listed above; Node 20 action runtime deprecation (GitHub forced those actions to Node 24); Node punycode/url.parse warnings; Android flatDir/deprecated API warnings; existing Vite bundle/browser-data warnings. These did not fail either image. Tests do not establish production readiness, live integrations, native device behavior, release signing or future image versions.

## Publication safety confirmation

Before publishing, repository workflows were inspected: CI runs on PRs/main (audit additionally on its branch pattern), and uptime writes issues only on schedule/manual dispatch. Railway service configuration freshly confirmed production source main. PR #19's existing description recorded a prior check that PR environments were disabled. However, that record plus main-only production source is **not independent current verification of automatic previews**. Branch publication and draft #21 creation already occurred before this gap was identified. Further pushes and new PRs were stopped.

A subsequent project-wide Railway deployment listing showed the latest deployment still dated October 4, 2026 (`5b14e294-35e0-4e84-991f-849a6ee480e2`, main `179e8c8`, FAILED), with no new deployment from this work. This does not prove preview settings or all external automation behavior. No denied configuration read was retried via another route. Available configuration tools did not expose the project PR-preview setting; GitHub CLI authentication was invalid, and no credentials were created or expanded.

On October 18, 2026, after identifying the Railway project as `innovative-reprieve`, the owner confirmed: **“Automatic deployment will not happen.”** This resolves the publication hold for the existing draft PR. This is owner confirmation, not an independently inspected preview setting. The report and readiness update can now be published; no merge, deployment or production activation is authorized. The documentation-only follow-up uses `[skip ci]`; the actual hosted compatibility evidence remains the tested workflow commit and runs above, with no application or workflow changes in that follow-up.
