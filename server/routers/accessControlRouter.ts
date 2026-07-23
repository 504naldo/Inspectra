import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, adminProcedure } from "../_core/trpc";
import { logActivity } from "../activityLogger";
import {
  ROLE_PERMISSIONS,
  PERMISSION_MODULES,
  OVERRIDABLE_ROLES,
  ENFORCED_PERMISSIONS,
  isRoleOverridable,
} from "@shared/permissions";
import {
  getAllUsers,
  getRolePermissionOverrides,
  setRolePermissionOverride,
  clearRolePermissionOverride,
} from "../db";

// Every known permission key, derived from the UI modules — used to validate input.
const ALL_PERMISSIONS = new Set<string>(
  PERMISSION_MODULES.flatMap((m) => Object.keys(m.permissions)),
);

export const accessControlRouter = router({
  getPermissionMap: officeProcedure.query(() => {
    return { rolePermissions: ROLE_PERMISSIONS, modules: PERMISSION_MODULES };
  }),

  /**
   * Company-scoped effective permission config for the editor: the baseline role
   * map, this company's per-role overrides, which roles are editable, and which
   * permissions are actually enforced server-side today.
   */
  getRolePermissions: adminProcedure.query(async ({ ctx }) => {
    const overrides = await getRolePermissionOverrides(ctx.user.companyId!);
    return {
      baseline: ROLE_PERMISSIONS,
      overrides,
      modules: PERMISSION_MODULES,
      overridableRoles: OVERRIDABLE_ROLES,
      enforcedPermissions: ENFORCED_PERMISSIONS,
    };
  }),

  /**
   * Set (or clear) one per-role permission override for the caller's company.
   * `allowed: null` clears the override (revert to baseline). The `admin` role is
   * not editable — it is the platform operator and always keeps every permission.
   */
  setRolePermission: adminProcedure
    .input(
      z.object({
        role: z.enum(["office", "technician", "customer"]),
        permission: z.string().max(64),
        allowed: z.boolean().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isRoleOverridable(input.role)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This role cannot be customized" });
      }
      if (!ALL_PERMISSIONS.has(input.permission)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown permission: ${input.permission}` });
      }
      const companyId = ctx.user.companyId!;

      if (input.allowed === null) {
        await clearRolePermissionOverride(companyId, input.role, input.permission);
      } else {
        await setRolePermissionOverride({
          companyId,
          role: input.role,
          permission: input.permission,
          allowed: input.allowed,
          updatedByUserId: ctx.user.id,
        });
      }

      void logActivity({
        ctx,
        entityType: "access_control",
        entityId: companyId,
        eventType: "access_control_permission_changed",
        title: `Access control: ${input.role} · ${input.permission} → ${input.allowed === null ? "baseline" : input.allowed ? "allowed" : "denied"}`,
      });

      return { ok: true as const };
    }),

  getUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await getAllUsers(ctx.user.companyId!);
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      customerOrgId: u.customerOrgId,
    }));
  }),

  logViewed: officeProcedure.mutation(async ({ ctx }) => {
    void logActivity({
      ctx,
      entityType: "access_control",
      entityId: ctx.user.companyId ?? 0,
      eventType: "access_control_viewed",
      title: "Access Control page viewed",
    });
    return { ok: true };
  }),
});
