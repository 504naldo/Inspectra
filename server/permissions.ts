import { TRPCError } from "@trpc/server";
import { hasPermission, type Permission } from "@shared/permissions";

export { hasPermission, type Permission };

type MinimalUser = { role: string; companyId?: number | null };

/**
 * Throws FORBIDDEN if the user lacks the required permission.
 * Use inside tRPC procedure handlers for high-risk operations.
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
