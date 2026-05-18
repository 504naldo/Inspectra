# Role-Based Permissions + Access Control Center v1 — Implementation Notes

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `shared/permissions.ts` | New | Centralized permission map (types, role→permission map, hasPermission) |
| `server/permissions.ts` | New | Server-side wrapper: re-exports hasPermission + adds requirePermission (throws TRPCError) |
| `server/routers/accessControlRouter.ts` | New | tRPC router: getPermissionMap, getUsers, logViewed |
| `server/routers.ts` | Modified | Added `accessControl: accessControlRouter` |
| `server/routers/aiRouter.ts` | Modified | Fixed 2 procedures: protectedProcedure → technicianProcedure |
| `client/src/lib/permissions.ts` | New | Frontend re-export of shared/permissions.ts |
| `client/src/pages/admin/AccessControl.tsx` | New | Access Control UI page |
| `client/src/App.tsx` | Modified | Added `/admin/access-control` route |
| `client/src/components/AdminLayout.tsx` | Modified | Added "Access Control" to Tools nav group |
| `ACCESS_CONTROL_AUDIT.md` | New | Full code audit |
| `ACCESS_CONTROL_NOTES.md` | New | This file |

## Permission Map Added

**Location:** `shared/permissions.ts`  
**Available to:** Both server (via `@shared/permissions`) and client (via `client/src/lib/permissions.ts`)

### Modules:
- Operations (jobs, schedule, work orders, approved work)
- Customers & Sites
- Reports & Compliance
- Financial (invoices, quotes, POs)
- Payroll & Time
- Field & Inventory (devices, deficiencies, inventory, parts, vendors)
- AI Assistant
- System (users, settings, imports, access control)

### Role defaults:
| Role | Permissions |
|------|-------------|
| `admin` | All permissions |
| `office` | All except: `jobs.finalize`, `users.manage`, `settings.manage`, `accessControl.manage`, `ai.technicianFeatures` |
| `technician` | jobs.view/update/complete, devices.view, deficiencies.view/manage, reports.view, payroll.viewOwn/submitOwn, availability.viewOwn, notifications.view, ai.use/technicianFeatures |
| `customer` | None (portal not active) |

### Helper functions:
- `hasPermission(user, permission)` — safe to call on both server and client, returns boolean
- `requirePermission(ctx, permission)` — server-only, throws TRPCError FORBIDDEN if denied

## Backend Routers Hardened

| Router | Procedure | Change |
|--------|-----------|--------|
| `aiRouter` | `prePublishReview` | `protectedProcedure` → `technicianProcedure` |
| `aiRouter` | `saveReviewOverrides` | `protectedProcedure` → `technicianProcedure` |

These were the only two procedures that accepted customer-role requests without any role gate. All other high-risk operations (invoices, payroll, settings, users) were already behind `officeProcedure` or `adminProcedure`.

## Frontend Nav Changes

**AdminLayout.tsx — Tools group:**
- Added: `Access Control` → `/admin/access-control` (ShieldAlert icon)
- Visible to: admin and office (same as all Tools items except Users)

## Unauthorized Page Behavior

`Forbidden.tsx` already existed at `client/src/pages/Forbidden.tsx`. It is:
- Rendered at `/forbidden`
- Linked from all disabled customer routes: `/customer/*` → `/forbidden`
- Shows user's current role and a "Go to Dashboard" button

`ProtectedRoute` in `App.tsx` redirects to the role-appropriate dashboard (not the Forbidden page) when a user navigates to a route they don't have access to. This is intentional — users are silently redirected rather than shown an error, which is a better UX.

## Access Control UI Page

**Route:** `/admin/access-control`  
**Access:** admin and office roles

### Sections:
1. **Role overview** — 4 cards (admin, office, technician, customer) with descriptions and active status
2. **High-risk access summary** — table of 12 sensitive operations showing which roles have access
3. **Full permission matrix** — grouped by module, all permissions, all roles, checkmarks
4. **User role list** — admin-only table of all users with name, email, role, and active status; links to /admin/users for management

### Activity logging:
- Page view is logged via `accessControl.logViewed` on mount

## Customer Role Safety

| Check | Status |
|-------|--------|
| Customer users blocked from `/admin/*` routes | ✅ ProtectedRoute redirects to `/admin` → then role-redirect to `/customer` → `/forbidden` |
| Customer users blocked from `/tech/*` routes | ✅ ProtectedRoute redirects |
| Customer portal routes redirect to `/forbidden` | ✅ Already implemented in App.tsx |
| Customer role blocked from `technicianProcedure` | ✅ Middleware enforced |
| Customer role blocked from `officeProcedure` | ✅ Middleware enforced |
| Customer role blocked from `adminProcedure` | ✅ Middleware enforced |
| `aiRouter` AI calls blocked for customer | ✅ Fixed in this release (technicianProcedure) |
| Customer portal listed as "inactive" in Access Control UI | ✅ Shown with Lock icon |

## AI Safety

| Check | Status |
|-------|--------|
| `aiAssistantRouter` all `officeProcedure` (admin+office) | ✅ |
| `aiAssistantRouter.draftDeficiencyFromNotes` = `technicianProcedure` | ✅ Correct (field use) |
| `aiRouter.prePublishReview` | ✅ Fixed — now `technicianProcedure` |
| `aiRouter.saveReviewOverrides` | ✅ Fixed — now `technicianProcedure` |
| `aiRouter.runQACheck` = `adminProcedure` | ✅ |
| Knowledge base management = `officeProcedure` | ✅ |
| Customer role blocked from all AI | ✅ |

## Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `inspectionRouter.getByJob/getByJobAndItem` use `protectedProcedure` — customer role could read checklist responses | Low | Customer portal not active; no cross-company data; v2 upgrade |
| `attachmentRouters` reads use `protectedProcedure` — customer could read attachment URLs for any entity | Low | Per-entity companyId checks in DB; v2 upgrade |
| `requirePermission()` helper exists but not yet wired into all procedures | Medium | Created and documented for use in v2 |
| No per-user custom permissions | By design | v1 uses role-level only; schema doesn't support per-user perms |

## Type Check Result

`pnpm check` — only the 3 pre-existing environment errors (TS2688 node types, TS5101 baseUrl deprecated). No new TypeScript errors introduced.

## Manual Test Checklist

### Role access
- [ ] Admin can navigate to /admin/access-control
- [ ] Office user can navigate to /admin/access-control  
- [ ] Technician is redirected away from /admin/access-control (ProtectedRoute)
- [ ] Customer is redirected away from /admin/access-control

### Access Control page — admin
- [ ] Role overview cards show all 4 roles
- [ ] Customer card shows "Portal not active"
- [ ] High-risk summary table shows correct ✓/✗ per role
- [ ] Full permission matrix loads and is scrollable
- [ ] Users section is visible (admin only)
- [ ] Users table shows name, email, role badge, active status
- [ ] "Manage Users" button links to /admin/users

### Access Control page — office
- [ ] Role overview, high-risk summary, permission matrix visible
- [ ] Users section NOT shown (admin only)
- [ ] Lock note shown instead

### Nav
- [ ] "Access Control" appears in Tools dropdown (desktop)
- [ ] "Access Control" appears in Tools collapsible section (mobile)
- [ ] Link navigates to /admin/access-control

### Backend security
- [ ] Admin/office/technician can call aiRouter.prePublishReview
- [ ] Customer-role session gets FORBIDDEN on aiRouter.prePublishReview
- [ ] Customer-role session gets FORBIDDEN on aiRouter.saveReviewOverrides
- [ ] accessControl.getUsers returns FORBIDDEN for non-admin
- [ ] accessControl.getPermissionMap returns data for admin/office

### Forbidden page
- [ ] /forbidden renders Forbidden component
- [ ] /customer redirects to /forbidden
- [ ] Forbidden page shows user's current role
- [ ] "Go to Dashboard" button navigates to role-appropriate page
