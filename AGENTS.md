# Inspectra engineering instructions

Read README.md, CLAUDE.md, docs/PRODUCTION_READINESS.md and role/security docs.
The user-authorized integration workflow uses feature branches and draft PRs:
never follow CLAUDE.md's immediate-merge rule without explicit release approval.
Do not merge, deploy, activate integrations, change production settings/credentials
or migrate live data. Automatic email remains default-off; preserve manual send.

For Sprinkler Desk work read docs/integrations/EWF_SPRINKLER_DESK.md and the sibling
EWF AGENTS.md. EWF SQLite remains the operational/financial authority. Use guarded
parent records, explicit tenant/account mappings and existing EWF commands;
never tunnel a staff session, accept client roles, generate work-order numbers,
or invent source context. Submitted estimates and financial evidence stay
immutable. Only fictional temporary databases are authorized for tests.

Run pnpm check, tests against fresh disposable MySQL, build, strict tenant audit
and isolated built-server smoke; run cross-app browser checks for UI integration.
Report skipped/unrun checks separately. Do not add application dependencies or
infrastructure without first explaining the change. Save reusable cloud setup
instructions and never assume processes survive a task restart.
