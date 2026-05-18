# System Setup / Onboarding Wizard v1 — Implementation Notes

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `drizzle/migrations/0060_setup_progress.sql` | New | DB migration: setup_progress table |
| `drizzle/schema.ts` | Modified | Added setupProgress table + types |
| `server/routers/setupRouter.ts` | New | tRPC router: getOverview, updateStepStatus |
| `server/routers.ts` | Modified | Added `setup: setupRouter` |
| `client/src/pages/admin/SetupWizard.tsx` | New | Full setup wizard UI |
| `client/src/App.tsx` | Modified | Added `/admin/setup` route |
| `client/src/components/AdminLayout.tsx` | Modified | Added "Setup Wizard" to Tools nav group |
| `client/src/pages/admin/Dashboard.tsx` | Modified | Added setup progress banner |
| `SETUP_WIZARD_AUDIT.md` | New | Audit document |
| `SETUP_WIZARD_NOTES.md` | New | This file |

## Route / Nav Added

- **Route:** `/admin/setup` — `ProtectedRoute allowedRoles={['admin', 'office']}`
- **Nav:** Tools group → "Setup Wizard" with CheckSquare icon

## Setup Steps

| # | Key | Label | Auto-Complete Condition |
|---|-----|-------|------------------------|
| 1 | `company_profile` | Company Profile | `company.name` AND `company.email` are set |
| 2 | `business_settings` | Business Settings | `technicianLabourRate > 0` |
| 3 | `users_roles` | Users & Roles | `adminCount ≥ 1` AND `technicianCount ≥ 1` |
| 4 | `customers_sites` | Customers & Sites | `customerCount > 0` AND `siteCount > 0` |
| 5 | `imports` | Imports | `importCount > 0` |
| 6 | `parts_inventory` | Parts & Inventory | `partsCatalogCount > 0` |
| 7 | `reports_documents` | Reports & Documents | `reportFooterText` is set |
| 8 | `invoices_sage` | Invoices & Sage | `invoicePrefix ≠ "INV"` OR `sageDefaultGlCode` is set |
| 9 | `payroll_time` | Payroll & Time | `technicianLabourRate > 0` (same as business settings) |
| 10 | `ai_knowledge` | AI & Knowledge Base | `kbCount > 0` |
| 11 | `final_review` | Final Review | Manual only (never auto-completes) |

## Progress Tracking Behavior

**Table:** `setup_progress` — one row per `(companyId, stepKey)`, with status enum and timestamps.

**Effective status logic:**
1. If manual status is `completed` or `skipped` → use manual status
2. Else if auto-complete condition is met (data-derived) → effective status = `completed` (shown as "Auto-detected")
3. Else → use manual status (`not_started` or `in_progress`)

**Admin actions:** Mark Complete, Skip, Reset (available to admin role only)

**Office users:** Can view setup wizard and link to relevant pages; cannot manually mark steps

**`updateStepStatus`:** `adminProcedure` — upserts via `INSERT ... ON DUPLICATE KEY UPDATE`. Logs activity for completed/skipped events.

## Completeness Rules

All rules are **guidance, not enforcement** — the app is fully functional regardless of setup state.

| Module | Complete When |
|--------|-------------|
| Company Profile | company has `name` AND `email` (from companies table) |
| Business Settings | `technicianLabourRate > 0` in companySettings |
| Users & Roles | at least 1 active admin + 1 active technician |
| Customers & Sites | at least 1 customerOrg AND 1 site |
| Imports | at least 1 import log for the company |
| Parts & Inventory | at least 1 active partsCatalog item |
| Reports & Documents | `reportFooterText` is non-null/non-empty |
| Invoices & Sage | `invoiceNumberPrefix ≠ "INV"` OR `sageDefaultGlCode` is set |
| Payroll & Time | `technicianLabourRate > 0` (reuses business settings) |
| AI & Knowledge | at least 1 knowledgeBase article |
| Final Review | manual only |

## Dashboard Integration

A setup progress banner appears at the top of the Admin Dashboard (above snapshot cards) when `!setupData.isComplete`. It shows:
- "Setup X/11 steps complete"
- "Continue Setup" button → `/admin/setup`

The banner is hidden once all steps are complete or skipped.

**Query:** `trpc.setup.getOverview` — cached 2 minutes, enabled when user has companyId.

## Database Changes

**New table:** `setup_progress` (migration `0060_setup_progress.sql`)

| Column | Type | Notes |
|--------|------|-------|
| id | INT AI PK | |
| companyId | INT NOT NULL | Company scoped |
| stepKey | VARCHAR(50) NOT NULL | One of SETUP_STEP_KEYS |
| status | ENUM NOT_STARTED/IN_PROGRESS/COMPLETED/SKIPPED | Default: not_started |
| completedAt | TIMESTAMP NULL | Set when completed/skipped |
| completedById | INT NULL | User who completed/skipped |
| notes | TEXT NULL | Optional notes |
| createdAt / updatedAt | TIMESTAMP | Auto-managed |

**Unique index:** `(companyId, stepKey)` — one row per company per step.

## Limitations

- No blocking enforcement — setup is guidance only
- No email/SMS verification step
- No billing/subscription setup
- No customer-facing setup
- No export of setup report
- `final_review` step never auto-completes — always requires manual completion
- Auto-complete for `payroll_time` reuses `technicianLabourRate` check (same as business_settings)

## Security

- `getOverview`: `officeProcedure` — admin + office only
- `updateStepStatus`: `adminProcedure` — admin only
- All queries scoped to `ctx.user.companyId`; no client-supplied companyId trusted
- No secrets exposed (AI key not shown, only "configured: yes/no" shown in checklist)

## Manual Test Checklist

- [ ] Navigate to /admin/setup as admin
- [ ] Navigate to /admin/setup as office user (read-only, no action buttons)
- [ ] Technician redirect away from /admin/setup
- [ ] Progress bar shows correct percentage
- [ ] Steps with data show "Auto-detected" green badge
- [ ] Steps without data show "Not Started" badge
- [ ] Expand a step card — checklist items visible, links work
- [ ] Click "Mark Complete" — step becomes green, progress increments
- [ ] Click "Skip" — step shows "Skipped" badge
- [ ] Click "Reset" on a manually-completed step — returns to not_started
- [ ] After marking all steps: progress = 100%, "Setup is complete!" message shown
- [ ] Dashboard banner appears when setup is not complete
- [ ] "Continue Setup" button navigates to /admin/setup
- [ ] Dashboard banner disappears when all steps complete
- [ ] Setup Wizard appears in Tools nav dropdown (desktop)
- [ ] Setup Wizard appears in Tools accordion (mobile)
- [ ] Company Profile step auto-detects company name/email
- [ ] Users & Roles step shows correct admin/tech counts
- [ ] Parts step shows parts catalog count
