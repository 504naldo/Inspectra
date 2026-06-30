# Inspectra Documentation

Start here.

## Active / authoritative
- **[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)** — the single live register of
  production-readiness findings and their status. **This is the source of truth.**
- **[TRUST_CLAIMS.md](./TRUST_CLAIMS.md)** — what security/compliance language may be published.
- **[CORE_WORKFLOW_VALIDATION.md](./CORE_WORKFLOW_VALIDATION.md)** — the customer→invoice workflow, transitions, idempotency, smoke checklist.
- **[CUSTOMER_REPORT_PRIVACY.md](./CUSTOMER_REPORT_PRIVACY.md)** — allowed vs prohibited fields in customer-facing reports.
- **[runbooks/DEPLOYMENT.md](./runbooks/DEPLOYMENT.md)** — deploy & migration safety procedure.

## Structure
```
docs/
  README.md                 ← you are here
  PRODUCTION_READINESS.md    ← active findings register
  TRUST_CLAIMS.md
  CORE_WORKFLOW_VALIDATION.md
  CUSTOMER_REPORT_PRIVACY.md
  architecture/             (system design notes)
  audits/
    README.md               ← index of historical vs active audits
    active/                  (active investigations, if any)
    archive/                 (pointers to historical root *_AUDIT.md)
  runbooks/
    DEPLOYMENT.md
  security/
  workflows/
```

## Historical audits
The repository root contains many point-in-time `*_AUDIT.md` / `*_NOTES.md` files.
They are **historical** and are intentionally left in place (other tooling/links may
reference their root paths). See **[audits/README.md](./audits/README.md)** for an
index and which documents are authoritative. For current status, always use
`PRODUCTION_READINESS.md`.

## Project conventions
See the repository root **`CLAUDE.md`** for stack, git workflow, and database/migration
conventions (the dual migration history is intentional — read that section before
touching migrations).
