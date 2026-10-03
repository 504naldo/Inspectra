# PR #18 migration and recovery procedure

Prepared code and isolated tests only. Do not merge or deploy this draft.
Main auto-deploys on merge before CI completes. This procedure requires separate
release authorization, verified backups and access; none was executed live.

## Acceptance and historical evidence

The follow-up was tested with Node 22.23.3, pnpm 10.4.1 and MySQL 8 on freshly
created databases. Synthetic historical fixtures contain two tenants, historical
partial payments, trusted captures and missing historical captures. Comparison
assertions preserve record counts, total paid amounts, tenant IDs and exact
snapshot JSON; unknown snapshots remain unknown. No sanitized restored database
was authorized/available. This proves these fixture paths, not the complete live
migration history or production recovery. Obtain a sanitized restored copy and
representative original reports under separate authorization before release.

Historical 0011 joins today's template and cannot establish historical questions,
requirements or standard versions. Never use it to reconstruct missing facts.
0010/0012/0013 and destructive 0006/0014/0015 also require individual historical
review. The explicit runner refuses pending files in that set. A migration ledger
entry alone is not proof of trustworthy captures: previously backfilled snapshots
are flagged at reporting/QA/sealing unless reviewed original evidence establishes
the facts. No conversion or fabricated provenance is included in this change.
New `captureProvenance: captured` is written at capture time only. Records lacking
trustworthy evidence require a visible exception and inspection-owner review.

## Before any separately authorized migration

1. Inventory the exact application commits, workers, migration histories,
   current DDL and unresolved payment operations. Do not infer historical payment
   correctness from today's amountPaid or retrofit unknown receipts automatically.
2. Freeze all payment and inspection writes, stop incompatible workers/images,
   and drain in-flight operations. Confirm the freeze operationally. A UI banner
   alone is not a write freeze. Keep automated emails off; do not resend uncertain
   manual operations.
3. Take a complete consistent backup covering invoices, line items, receipts,
   captures/templates/jobs, tenants, migration tables and trigger definitions.
   Record a verified restore and PITR/binlog position. Export enough original
   documents to compare historical report facts. Protect backup access separately.
4. Rehearse on the sanitized restored copy, comparing counts, totals, owners,
   immutable captures, trigger definitions, finalization hashes and representative
   PDF text before/after. Any unknown historical fact remains unknown.
5. Confirm MySQL CREATE TRIGGER privileges and server compatibility. Existing
   trigger names must have the expected definitions; duplicate-name skipping is
   recovery of identical DDL, not authorization to replace different triggers.

## Apply and resume

Fresh installs use **only the journal** (`pnpm exec drizzle-kit migrate`), which
includes 0036 schema additions and 0037 protocol guards. Do not replay manual
history onto a journal installation. Repeat journal execution is recorded by
Drizzle. Journal replay onto a populated unrelated legacy schema is unsupported.

Legacy/manual installations use their verified manual history. Confirm actual
0014 NOT NULL and 0044 sessionVersion prerequisites from live DDL/evidence;
missing/null captures require reviewed remediation, not 0011 inference. Under
the write freeze, apply reviewed **0086** and **0087** only through explicit
maintenance, from a directory containing only the selected reviewed files:

```ts
await runMigrations({ databaseUrl: authorizedMaintenanceUrl,
  migrationsDir: reviewedSelectedDirectory, apply: true });
```

The URL must be provided by the authorized operator; never use a production URL
for the tests. The directory is a reviewed release artifact, not a random subset
of unresolved prerequisites. There is no automatic schema migration at server
startup: manual startup checks require the full recorded history; journal startup
uses required-schema/trigger preflight. Record selected files as applied only
after every statement succeeded. Required preflight checks block missing columns,
null captures and missing protocol guards before traffic is served.

MySQL DDL auto-commits. If interrupted, retain the freeze, inspect committed DDL
and ledger state, and resume the **same reviewed SQL**. The runner recognizes
existing tables/columns/keys/triggers, stops at the first real error and leaves the
file unapplied. Tests simulate committed partial DDL plus corrected fail-fast
retry. Do not assume transactions reverse DDL. Resolve unknown trigger definitions
or failed prerequisites manually under review before retrying. Never skip a real
failure just to let later constraints run.

## Compatibility boundary and recovery

Only application versions containing **all** of persistent operation recovery,
receipt lookup/immutable payload validation, protocol-v2 transactional writes,
trusted-capture handling and required-guard startup checks are approved candidates
for this schema. No earlier released version is certified compatible:

- Main `87a23db` uses older overwrite semantics and lacks these requirements.
- PR's original `cb03dde` has cumulative receipts but dialog-only IDs and no
  protocol marker; it is also incompatible with 0087.
- Version strings such as package `1.0.1` are insufficient. Record exact reviewed
  commit/image digest and matching schema/trigger definitions in release evidence.

**Rollback boundary:** after any new cumulative payment has committed, an older
payment writer must never run writable against that state. In practice retain
the freeze for all image changes after guard activation: 0087 intentionally
rejects old writers even before the first new receipt. It protects matching
receipt totals, derived balances and payment dates/status, and rejects receipt
UPDATE/DELETE. The protocol marker is a compatibility barrier, not a replacement
for authentication, tenant checks or DB access control.

Preferred recovery is **forward**: freeze, keep receipts and guards intact, run a
reviewed compatible image, reconcile pending request IDs against server receipts,
and retry only the same unresolved identity. Tests reject old overwrite/history
mutations and then use the compatible writer to preserve/reuse the receipt and
add one separately received payment. Never remove guards or delete receipts to
make an old image appear healthy.

A true old-version rollback requires restoring a verified full pre-change backup
into an isolated target, reconciling **every** post-backup operation against ledger
and source payment evidence, preserving the original history/export, and obtaining
accounting and release approval. A blind restore after new payments would lose
history and totals. If post-backup payments cannot be reconciled reliably, old
rollback is prohibited; use forward recovery. No full production backup restoration
or old-image deployment has been rehearsed here. Restorable backup/PITR, sanctioned
restore target, compatible image and source accounting evidence remain release
prerequisites.

## Payment recovery UI

Operation payloads commit to strict IndexedDB transactions under validated
account/company/invoice identity before sending; localStorage is only a cache.
Legacy cached identities are migrated without creating a new operation. Browser Web Locks coordinate tabs; unsupported browsers fail closed.
Success retains the acknowledged ID. Reopening checks the durable server receipt.
“Start another payment” is a deliberate, receipt-checked transition for a **separate
amount actually received**. Never clear a pending local record or invent a new
UUID to bypass an uncertain result. Corrupt/quota-blocked storage requires office
reconciliation and preserved evidence. Desktop Chromium refresh, process termination/reopen and simultaneous tabs have
passed against real MySQL. Android/native storage and Web Locks still require
device validation.

## Validation evidence

See the single [readiness register](../PRODUCTION_READINESS.md#pr-18-release-safety-follow-up--2026-10-03)
for passed, failed/resolved, skipped and unrun checks and independent review.

## Repeat isolated browser and backup checks

After building, use Node 22 and an explicitly disposable loopback database URL:

```sh
DATABASE_URL=mysql://root@127.0.0.1:3306/inspectra_disposable node scripts/checkPaymentBrowser.mjs
DATABASE_URL=mysql://root@127.0.0.1:3306/inspectra_disposable node scripts/checkPaymentRestore.mjs
```

The scripts create and drop their own uniquely named databases; the URL selects
the local MySQL server, not production. Browser checks require Chromium
(`CHROMIUM_BIN` may select it), intercept external requests, use fake session
credentials and leave automatic email disabled. Restore checks require the local
`inspectra-onboarding-mysql` Docker container and MySQL native dump/restore tools.
They preserve all four trigger definitions and expose the post-backup payment
gap before replaying a known synthetic receipt exactly once. This is a synthetic
rehearsal, not a certified production backup, PITR or accounting reconciliation.
