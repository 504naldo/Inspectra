import { TRPCError } from "@trpc/server";
import { hasPermission, resolvePermission, type Permission } from "@shared/permissions";
import { getRolePermissionOverrides } from "./db";

export { hasPermission, type Permission };

type MinimalUser = { role: string; companyId?: number | null };

/**
 * Throws FORBIDDEN if the user lacks the required permission by the *baseline*
 * role map (ignores company overrides). Kept for callers that don't need the
 * per-company overrides; prefer requireCompanyPermission for high-risk actions
 * that admins can customize per role.
 */
export function requirePermission(
  ctx: { user: MinimalUser },
  permission: Permission,
): void {
  if (!hasPermission(ctx.user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: ${permission}`,
    });
  }
}

/**
 * Company-scoped permission check: applies the caller's company per-role
 * overrides on top of the baseline. `admin` (platform operator) always passes.
 * Throws FORBIDDEN when the effective permission is denied.
 *
 * Backward-compatible: with no overrides set, the effective result equals the
 * baseline, so wiring this into an endpoint doesn't change behaviour until an
 * admin explicitly toggles a permission for a role.
 */
export async function requireCompanyPermission(
  ctx: { user: MinimalUser },
  permission: Permission,
): Promise<void> {
  if (ctx.user.role === "admin") return; // platform operator
  const companyId = ctx.user.companyId;
  const overrides = companyId ? await getRolePermissionOverrides(companyId) : [];
  if (!resolvePermission(ctx.user.role, permission, overrides)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: ${permission}`,
    });
  }
}
