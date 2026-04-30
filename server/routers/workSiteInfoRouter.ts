import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";

const workSiteInfoInput = z.object({
  siteId: z.number(),
  customerOrgId: z.number().optional(),
  // Contacts
  siteContactName: z.string().optional(),
  siteContactPhone: z.string().optional(),
  siteContactEmail: z.string().optional(),
  propertyManagerName: z.string().optional(),
  propertyManagerPhone: z.string().optional(),
  propertyManagerEmail: z.string().optional(),
  // Access
  accessNotes: z.string().optional(),
  keyLocation: z.string().optional(),
  keyNumber: z.string().optional(),
  lockboxCode: z.string().optional(),
  parkingNotes: z.string().optional(),
  serviceEntranceNotes: z.string().optional(),
  // Fire alarm panel
  fireAlarmPanelMake: z.string().optional(),
  fireAlarmPanelModel: z.string().optional(),
  fireAlarmPanelLocation: z.string().optional(),
  annunciatorLocation: z.string().optional(),
  // Monitoring
  monitoringCompany: z.string().optional(),
  monitoringPhone: z.string().optional(),
  monitoringAccount: z.string().optional(),
  // Other systems
  sprinklerNotes: z.string().optional(),
  backflowNotes: z.string().optional(),
  emergencyLightingNotes: z.string().optional(),
  fireExtinguisherNotes: z.string().optional(),
  // Notes
  generalNotes: z.string().optional(),
  sourceWorkbookName: z.string().optional(),
  sourceSheetName: z.string().optional(),
});

export const workSiteInfoRouter = router({
  getBySiteId: officeProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const site = await db.getSiteById(input.siteId);
      if (!site) return null;
      if (site.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.getWorkSiteInfoBySiteId(input.siteId) ?? null;
    }),

  createOrUpdate: officeProcedure
    .input(workSiteInfoInput)
    .mutation(async ({ input, ctx }) => {
      const { siteId, ...data } = input;
      const site = await db.getSiteById(siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      if (site.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.upsertWorkSiteInfo({
        siteId,
        companyId: ctx.user.companyId,
        customerOrgId: data.customerOrgId ?? site.customerOrgId,
        ...data,
      });
    }),
});
