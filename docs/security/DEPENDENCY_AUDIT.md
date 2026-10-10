# Dependency security remediation — 2026-10-10

Baseline: Inspectra main `179e8c8c898a8a74309f7a5acece34c971f2c1f6`.
This branch is independent of the EWF integration PR; it introduces no database
migration, production setting or integration activation.

The earlier scan reported 75 findings. A refreshed `pnpm audit --json` against
the unchanged baseline reported **200**: 12 low, 84 moderate, 96 high, 8 critical.
Advisory data changes over time; the captured before/after scan now reports
**2 high findings**, both in `xlsx@0.18.5`, and zero low/moderate/critical findings.
Both full and production-only audits fail with those two findings. No advisory
is ignored and no claim of zero vulnerabilities is made.

## Changes

Updated the locked compatible dependency graph and raised security-sensitive
minimum versions for AWS SDK, tRPC, Drizzle ORM/kit, MySQL2, adm-zip, Capacitor,
Vite, PostCSS and nanoid. Vitest moves from 2.1.9 to 4.1.11 to fix the testing
server/mocker advisories. pnpm is pinned to integrity-verified 10.34.5; its
redundant vulnerable dev dependency is removed. adm-zip now includes its types,
so the separate type package is removed. The existing wouter patch is retained.

Removed the vulnerable nanoid3 override. Narrow parent overrides patch
Drizzle's legacy esbuild loader, Terser's serialize-javascript, Xcode's uuid
and typography's selector parser. KaTeX is patched across all Markdown/math
parents. Overrides cross older parent ranges: compatibility evidence includes
fresh migration, full tests, native CLI configuration inspection, build/PWA
generation and actual browser rendering; native Xcode/device execution is
unverified. Review/remove overrides when parents adopt patched ranges.

Workbox build7.4.1 is declared explicitly as a development dependency to satisfy
the upgraded PWA plugin's existing peer requirement. No new runtime service or
infrastructure is introduced. Neither native projects nor production deployment
configuration was changed; a release must verify the package-manager version
used by the existing Railway builder and complete native acceptance.

`pnpm security:dependency-audit` reports every severity. A separate CI audit job
fails on unresolved findings; test CI runs independently. There are no audit
exceptions, lowered thresholds or changed authorization tests.

## Remaining release blocker

- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6):
  SheetJS prototype pollution; fixed upstream0.19.3+.
- [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9):
  SheetJS ReDoS; fixed upstream0.20.2+.

The official0.20.3 distribution at
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` is proxy-denied403 here.
The npm `xlsx` package has no patched release. No third-party republisher was
substituted to make the scanner pass. Enable the official domain in this cloud
environment, obtain and verify the upstream artifact, retain lockfile integrity
and rerun spreadsheet/security/full checks. Keep the existing isolated-worker
timeout/prototype containment; it mitigates exposure but does not fix the library.

## Verified local checks

| Status | Check | Evidence |
|---|---|---|
| Passed | Locked install | pnpm10.34.5, frozen lockfile |
| Passed | Full tests | Node22.23.3: 1,244 passed, 14 existing skipped; initial Node24.19 suite:1,242 passed,14 skipped plus2 new math tests passed |
| Passed | Spreadsheet/PDF/security regressions | Included in full suite; fixtures and authorization assertions unchanged |
| Passed | Typecheck/build | TypeScript, production assets/server and generated PWA worker |
| Passed | Strict tenant audit | 60 router files, zero active findings, two existing reviewed exceptions |
| Passed | Built-server smoke | Health/UI; no database or integration credentials |
| Passed | Chromium/mobile/PWA | Actual chat Markdown/maths, blocked executable HTML/links, public login shell reload offline; no external traffic |
| Passed | Disposable migration | Fresh local MySQL schema migration with upgraded ORM/kit |
| Failed | Full/production dependency audit | Two high SheetJS findings; explicit release gate |
| Skipped | Existing optional tests | 14 S3/disabled Phase2/auto-mapping tests |
| Unrun | Native/live/release | Android SDK/device and Xcode, live OAuth/storage/email, Railway builder/runtime; no production changes |

Intermediate browser fixture checks assumed a literal strong tag; Streamdown
uses its documented strong component. Production browser verification initially
used127.0.0.1, which existing CORS rejects; it now uses the permitted localhost
origin. No CORS, CSP, sanitizer or service-worker protections were relaxed.
SSR renders no streaming content until effects run, so the final safety evidence
comes from actual Chromium and the real KaTeX dependency, not an empty SSR tree.

Use `node scripts/checkDependencyBrowser.mjs` after `pnpm build`. It uses external
Playwright tooling (`PLAYWRIGHT_MODULE`, default the existing `/tmp/ewf-browser-tools`
installation) and Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium`), creates
temporary fictional fixtures, blocks external requests and cleans up its files
and processes. This is public-shell offline coverage, not technician offline
sync or native hardware acceptance. Hosted exact-commit results belong in the PR.
