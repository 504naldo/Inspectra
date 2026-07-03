# Audits Index

The repository root holds many point-in-time audit/notes Markdown files from prior
passes. They are **historical** and are intentionally **left in their root paths**
(moving them risks breaking links/tooling that reference those paths). This index
distinguishes the authoritative active document from the historical snapshots.

## Authoritative (active)
- **`docs/PRODUCTION_READINESS.md`** — the single live findings register. Use this
  for current status. New ongoing findings go here, **not** into a new root `*_AUDIT.md`.
- `PRODUCTION_HARDENING_PLAN.md` (root) — plan for the 2026-06-30 hardening pass.
- `PRODUCTION_HARDENING_RESULTS.md` (root) — results of that pass.

## Historical snapshots (root `*_AUDIT.md`, `*_NOTES.md`)
These are read-only history. Representative examples (non-exhaustive):

- Security / access: `SECURITY_AUDIT.md`, `ACCESS_CONTROL_AUDIT.md`,
  `ACCESS_CONTROL_NOTES.md`, `SECURITY_DEBUG_AUDIT_2026-04-13.md`.
- Workflow / readiness: `NEXT_IMPLEMENTATION_AUDIT.md`, `PRODUCTION_READINESS_AUDIT.md`,
  `WORKFLOW_HEALTH_AUDIT.md`, `WORKFLOW_QA_REPORT.md`, `INSPECTRA_APPLICATION_AUDIT.md`.
- Domain modules: `OFFLINE_SYNC_AUDIT.md`, `INVOICE_HARDENING_REPORT.md`,
  `REPORT_QA_AUDIT.md`, `PHOTO_MEDIA_AUDIT.md`, `INVENTORY_PARTS_AUDIT.md`, and the
  many other `*_AUDIT.md` / `*_NOTES.md` files.

## Rule
- **Do not delete** historical audits — they are valuable context.
- **Do not start a new root `*_AUDIT.md`** for ongoing work; add a row to
  `docs/PRODUCTION_READINESS.md` instead.
- When a historical finding is still open, copy it (with its evidence) into the
  register and mark the historical file as superseded at the top.
