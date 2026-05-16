import { z } from "zod";
import { router, officeProcedure } from "../_core/trpc.js";
import * as db from "../db.js";

const ENTITY_TYPES = z.enum([
  "job",
  "schedule",
  "service_schedule",
  "monthly_service_tracking",
  "site",
  "deficiency",
  "repair_quote",
  "approved_work",
  "work_order",
  "invoice",
  "report",
  "company_settings",
  "parts_catalog",
]);

export const activityRouter = router({
  listForEntity: officeProcedure
    .input(z.object({
      entityType: ENTITY_TYPES,
      entityId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      return db.getActivityEventsForEntity(
        ctx.user.companyId!,
        input.entityType,
        input.entityId,
        input.limit,
      );
    }),

  listRecentByCompany: officeProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      entityType: ENTITY_TYPES.optional(),
    }))
    .query(async ({ input, ctx }) => {
      return db.getRecentActivityByCompany(
        ctx.user.companyId!,
        input.limit,
        input.entityType,
      );
    }),
});
