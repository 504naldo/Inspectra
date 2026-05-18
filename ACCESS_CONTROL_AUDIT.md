# Access Control Audit — Inspectra v1

## Existing Roles (from drizzle/schema.ts)

| Role | Description |
|------|-------------|
| `admin` | Full access, user management, system settings |
| `office` | Operational access, scheduling, reporting, financial |
| `technician` | Field work, assigned jobs, own payroll/time off |
| `customer` | Customer portal (not active) |

Stored in `users.role` as a MySQL enum. No additional roles in schema.

## Procedure Types (from server/_core/trpc.ts)

| Procedure | Access |
|-----------|--------|
| `publicProcedure` | Anyone, no auth required |
| `protectedProcedure` | Any authenticated user including customer |
| `technicianProcedure` | admin + office + technician |
| `officeProcedure` | admin + office |
| `adminOrOfficeProcedure` | admin + office (same as officeProcedure) |
| `adminProcedure` | admin only |
| `customerProcedure` | customer only |

## Protected Routes (from client/src/App.tsx)

| Route Pattern | Allowed Roles |
|---------------|--------------|
| `/tech/*` | admin, office, technician |
| `/admin` | admin, office |
| `/admin/users` | admin only |
| `/admin/qa/:jobId` | admin only |
| All other `/admin/*` | admin, office |
| `/customer/*` | Redirected to /forbidden (portal not active) |

## Router Procedure Audit

### High-risk routers — properly guarded ✅

| Router | Procedure type |
|--------|---------------|
| `userRouter` | All `adminProcedure` |
| `companySettingsRouter` | `get` = officeProcedure, `update` = adminProcedure |
| `invoiceRouter` | All `officeProcedure` |
| `payrollHoursRouter` | approve/reject/export = `officeProcedure`; `get` = `protectedProcedure` with companyId check |
| `timeTrackingRouter` | approve/reject = `officeProcedure`; `get` = `protectedProcedure` with companyId check |
| `aiAssistantRouter` | All `officeProcedure` except `draftDeficiencyFromNotes` = `technicianProcedure` |
| `accessControlRouter` | `getPermissionMap` = `officeProcedure`, `getUsers` = `adminProcedure` |

### Routers with `protectedProcedure` — reviewed

| Router | Procedure | Assessment |
|--------|-----------|------------|
| `jobRouter` | `listByCustomerOrg`, `get`, `getWithDetails`, `getSummary`, `getJobTechnicians` | ✅ Each has per-row role/companyId checks |
| `deficiencyRouter` | `listByCustomerOrg`, `get` | ✅ Each has per-row role/customerOrgId checks |
| `reportRouter` | `listByJob`, `listByCustomerOrg`, `get` | ✅ Each has per-row role/companyId checks |
| `siteRouter` | `listByCustomerOrg`, `get` | Low-risk reads, customerOrg scoped |
| `attachmentRouters` | `listByEntity`, `listByJob`, `listByDevice`, `get` | Low-risk reads; could be tightened in v2 |
| `inspectionRouter` | `getByJob`, `getByJobAndItem` | Low-risk read, no customer-facing check — acceptable for v1 |
| `payrollHoursRouter.get` | Single entry fetch | ✅ has companyId check |
| `timeTrackingRouter.get` | Single entry fetch | ✅ has companyId check |
| `dashboardRouter.get` | Site data fetch | Low-risk read |
| `entityRouters.get` (company/customerOrg) | Entity fetch | Low-risk reads |

### FIXED in this release ✅

| Router | Procedure | Old | New |
|--------|-----------|-----|-----|
| `aiRouter` | `prePublishReview` | `protectedProcedure` | `technicianProcedure` |
| `aiRouter` | `saveReviewOverrides` | `protectedProcedure` | `technicianProcedure` |

**Why:** `prePublishReview` triggers an expensive AI call on a job without verifying the caller is at least a technician. A customer with a valid session could call it with any jobId. Upgraded to `technicianProcedure` which blocks customer role. `saveReviewOverrides` similarly had no role check — upgraded to match.

## Routes/Pages That Appear Under-Protected

| Area | Finding | Severity |
|------|---------|----------|
| `aiRouter.prePublishReview` | Used `protectedProcedure` — any authenticated user including customer could trigger an AI call | **HIGH — FIXED** |
| `aiRouter.saveReviewOverrides` | Same as above | **HIGH — FIXED** |
| `inspectionRouter.getByJob/getByJobAndItem` | `protectedProcedure` with no company/role check. Low risk (checklist read). | Low — v2 |
| `attachmentRouters.*` | `protectedProcedure` — no explicit company check. Low risk (file URLs). | Low — v2 |

## Frontend Role Checks Without Backend Enforcement

| Location | Frontend only? | Backend enforced? |
|----------|---------------|-------------------|
| AdminLayout nav `adminOnly: true` for Users | Frontend only hides menu item | ✅ `adminProcedure` on `userRouter` |
| `ProtectedRoute allowedRoles={['admin']}` for `/admin/users` | Route guard | ✅ `adminProcedure` on backend |
| `ProtectedRoute allowedRoles={['admin']}` for `/admin/qa/:jobId` | Route guard | ✅ `adminProcedure` on `aiRouter.runQACheck` |
| Company Settings — `office` can view, `admin` can edit | ✅ Enforced on backend via adminProcedure |

## Customer Role Safety

- Customer portal routes `/customer/*` redirect to `/forbidden`
- `getRoleBasedPath('customer')` returns `/customer` which then redirects to `/forbidden`
- Customer role users cannot access `/admin/*` — ProtectedRoute redirects them
- Customer role users cannot access `/tech/*` — ProtectedRoute redirects them
- Backend: customer role is blocked by `technicianProcedure`, `officeProcedure`, `adminProcedure`
- Backend: `customerProcedure` exists but is not wired to any active router
- **Gap:** Some `protectedProcedure` endpoints (reports, jobs, deficiencies) allow customer role with per-row scoping via `customerOrgId`. This is intentional for future customer portal. Currently harmless since customers are redirected to `/forbidden`.

## Recommended Fixes (v2+)

1. Upgrade `inspectionRouter.getByJob` to `technicianProcedure` (block customer)
2. Upgrade `attachmentRouters` reads to `technicianProcedure` (block customer)
3. Add explicit `ctx.user.companyId` check to `siteRouter.listByCustomerOrg`
4. Review `entityRouters.get` for company/customerOrg scoping
5. Add rate limiting / abuse protection to `aiRouter` AI calls

## Summary

The existing access control is well-structured. The primary gaps found and fixed were:
1. Two `aiRouter` procedures used `protectedProcedure` instead of `technicianProcedure` — fixed
2. No centralized permission map existed — added `shared/permissions.ts`
3. No Access Control UI existed — added `/admin/access-control`
