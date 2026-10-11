# Dependency security remediation — 2026-10-11

Baseline: Inspectra main `179e8c8c898a8a74309f7a5acece34c971f2c1f6`.
This branch is independent of the EWF integration PR; it introduces no database
migration, production setting or integration activation.

The earlier scan reported 75 findings. A refreshed `pnpm audit --json` against
the unchanged baseline reported **200**: 12 low, 84 moderate, 96 high, 8 critical.
The first remediation commit reduced this to **2 high SheetJS findings**.
After installing the official SheetJS 0.20.3 distribution, fresh full and
production-only audits report **zero findings at every severity**. The full
audit covers 1,113 dependencies; the production-only audit covers 573.
No advisory is suppressed. These are dependency scan results, not a claim that
every application or release risk has been resolved.

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

## SheetJS blocker resolved

- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6):
  SheetJS prototype pollution; fixed upstream0.19.3+.
- [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9):
  SheetJS ReDoS; fixed upstream0.20.2+.

The earlier Codex environment denied the official download with HTTP 403.
The continuation workspace downloaded the archive successfully with HTTP 200:
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
The archive manifest identifies `xlsx` 0.20.3 and Apache-2.0 licensing.
`package.json` pins this exact official URL; the generated lockfile records its
version and SHA-512 integrity. A separate direct download matches that integrity:

```text
sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==
```

Archive SHA-256:
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
The updated graph removes the old SheetJS package and its eight unused legacy
dependencies; all other package versions and resolution metadata are unchanged.
The disposable worker and its 15-second parser timeout remain as defense in
depth. The npm registry package and third-party republishers are not used.

Build environments must permit `cdn.sheetjs.com`, including the configured
Codex environment and any fresh Railway installation. The current build was
verified here; the live Railway builder/runtime is a separate release check.
README and dev-container setup instructions now use the existing pinned
pnpm 10.34.5 instead of the stale 10.4.1 reference.

## Verified local checks

| Status | Check | Evidence |
|---|---|---|
| Passed | Locked install | pnpm10.34.5, frozen lockfile |
| Passed | Focused tests after SheetJS update | Node 24.19.0: 6 files / 55 tests, zero failures or skips; parser, XLSX/XLSM/CSV diagnostics, workbook identity, tenant isolation, summary extraction and Markdown security |
| Passed | Typecheck/build after SheetJS update | TypeScript, production assets/server and generated PWA worker (227 precache entries) |
| Passed | Strict tenant audit after SheetJS update | 60 router files, zero active findings, two existing reviewed exceptions; `node --import tsx scripts/auditTenantGuards.ts --strict` |
| Passed | Built-server smoke after SheetJS update | Health/UI; no database or integration credentials |
| Passed | Full/production dependency audit after SheetJS update | Zero info/low/moderate/high/critical findings; no suppressions |
| Previous head | Full tests/PDF/migration | Before the SheetJS update: Node 22.23.3, 1,244 passed / 14 existing skipped; disposable MySQL migration passed. See hosted run 38089270234 on commit 469ee9da72c6f93390cc2292ca526f8bcac4933c |
| Previous head | Chromium/mobile/PWA | Before the SheetJS update: actual chat Markdown/maths, blocked executable HTML/links, public login shell reload offline; no external traffic |
| Pending hosted CI | Full suite/database migration after SheetJS update | This workspace has no MySQL server; the existing GitHub CI provisions disposable MySQL and runs the complete suite. Exact-commit results belong in PR #20 |
| Unrun | Native/live/release | Android SDK/device and Xcode, live OAuth/storage/email, Railway builder/runtime; no production changes |

The `tsx` CLI's local IPC socket was rejected with EPERM in this workspace.
Running the same tenant-audit script through Node's `--import tsx` loader passed
without creating that socket. The audit script and its strict mode are unchanged.

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
