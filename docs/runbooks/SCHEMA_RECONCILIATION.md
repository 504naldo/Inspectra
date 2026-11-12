# Read-only schema reconciliation and synthetic forward rehearsal

A migration ledger is history, not proof of matching DDL. Before selecting any
maintenance SQL, compare the exact intended application's schema contract with
actual database metadata. Startup behavior is unchanged by this tool.

## Read-only inventory

Use a reviewed read-only database account and explicitly select its environment
variable. The script does not load dotenv files or choose DATABASE_URL implicitly:

```sh
node --import tsx scripts/checkSchemaContract.ts --database-url-env REVIEW_DATABASE_URL
```

The account and connection must already be authorized. Keep credentials out of
command arguments, shared logs and issue descriptions. The CLI rejects URL query
parameters/fragments and creates a connection using only validated options.
Non-loopback destinations require verified TLS. Configure the trusted server CA
through normal operator certificate setup; there is no insecure TLS override.

Output contains schema metadata only, with blocking/review/unknown counts:

- Missing tables, columns and named indexes, incompatible types/nullability and
  index definitions are blocking findings.
- Extra legacy tables/columns/indexes require review. They are **never** a deletion
  recommendation. A review-only result has zero blocking findings but still exits
  nonzero until its scope is understood.
- MySQL integer display widths are normalized; signedness, decimal/string widths
  and enum values remain meaningful.
- The intentional manual and journal ledger tables are reported separately.
  Their existence does not establish lineage or prove their records correct.
- Query failures, unsupported metadata and cleanup failures produce an unknown
  result, not a false pass. Connections and metadata queries are time-bounded.

This is not a release certificate. Defaults/generated expressions, auto-increment,
foreign keys/check constraints, collations, invisible indexes, triggers/routines/
events, historical records and migration lineage still require review. Metadata
reads are not an atomic snapshot; concurrent DDL invalidates the comparison.
A missing-metadata result can also indicate insufficient visibility: do not apply
DDL until privileges and complete definitions are verified.

## Forward plan, before any live maintenance

1. Fix the exact application commit/image and establish complete table/index/
   constraint/default/trigger definitions plus real migration history. Resolve
   contradictory evidence rather than choosing the convenient interpretation.
2. Build a complete difference inventory. Separate semantic drift from physical
   aliases, and preserve extra legacy fields unless separately reviewed.
3. Classify data conversion requirements. Empty-table observations become stale:
   recheck under an effective write freeze. Any populated invoice or approved-work
   table requires reviewed ownership/amount mapping; do not guess or rename fields
   blindly. Line-item and related records must be included.
4. Preserve historical captures exactly. No null check or NOT NULL constraint can
   certify authenticity; unknown provenance remains unknown. Never rebuild old
   answers from today's templates or label them newly captured.
5. Review a forward-only sequence and recovery checkpoints. MySQL DDL commits per
   statement. If partially applied, inventory the committed definitions and review
   an explicit continuation; do not delete ledger entries or skip mismatches.
6. Obtain a current consistent backup and rehearse that reviewed sequence on an
   authorized isolated restored copy. Disable integrations and sanitize before
   application tests. Compare original values, counts, ownership, totals, captured
   JSON, event pointers, ledger entries and guard definitions before/after.
7. Only after that acceptance, use separately authorized live maintenance with an
   effective write freeze and a compatible application image. Keep payment guards
   intact. Validate the combined release candidate and runtime acceptance before
   reopening writes. An old writable image is not a safe rollback after protocol
   activation.

The read-only checker does not apply any of these changes. A plan or green
synthetic test does not authorize deployment or live SQL.

## Synthetic candidate rehearsal

`server/legacyForwardRehearsal.test.ts` creates a new random database only on an
explicit loopback Inspectra test server. It models legacy empty business tables,
missing release prerequisites and incompatible nullable/type definitions. It
owns all fixture data and drops only the database it created. It does not connect
to an existing application's schema or copy production records.

`fixtures/empty-legacy-forward.sql` is a **test fixture**, not a production
migration. It is outside the automatically discovered migration directories.
The test's private preflight checks the expected shape, empty business tables,
non-null captures and absence of unexpected drift before executing it. Interrupted
or different shapes stop. The subsequent selected 0086/0087 files use the existing
explicit maintenance runner. The test then checks the full supported contract,
required-schema checks, original values, historical unknown provenance, ledgers
and four payment guards. Extra legacy columns remain present for review.

Run only against a disposable local/CI MySQL server:

```sh
DATABASE_URL=mysql://root@127.0.0.1:3306/inspectra_ci \
  pnpm exec vitest run server/schemaContract.test.ts server/legacyForwardRehearsal.test.ts
```

This tests the proposed mechanics for its deliberately constructed fixture. It
is not a production DDL snapshot, complete data conversion, fresh-backup rehearsal
or full application/device/provider acceptance. Use exact-head CI evidence and
keep any unrun checks explicit.
