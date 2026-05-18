import { router, officeProcedure, adminProcedure } from "../_core/trpc";
import { logActivity } from "../activityLogger";
import { ROLE_PERMISSIONS, PERMISSION_MODULES } from "@shared/permissions";
import { getAllUsers } from "../db";

export const accessControlRouter = router({
  getPermissionMap: officeProcedure.query(() => {
    return { rolePermissions: ROLE_PERMISSIONS, modules: PERMISSION_MODULES };
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
