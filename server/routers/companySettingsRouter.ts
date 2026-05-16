import { z } from "zod";
import { router, officeProcedure, adminProcedure } from "../_core/trpc.js";
import * as db from "../db.js";
import { logActivity } from "../activityLogger.js";

const settingsUpdateSchema = z.object({
  gstRate: z.number().nonnegative().max(1).optional(),
  pstRate: z.number().nonnegative().max(1).optional(),
  technicianLabourRate: z.number().nonnegative().optional(),
  fitterLabourRate: z.number().nonnegative().optional(),
  quoteValidityDays: z.number().int().min(1).max(365).optional(),
  defaultQuoteTerms: z.string().max(2000).nullable().optional(),
  invoiceDueDays: z.number().int().min(0).max(365).optional(),
  defaultInvoiceTerms: z.string().max(2000).nullable().optional(),
  invoiceNumberPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/i, "Prefix must be letters, numbers, or hyphens").optional(),
  repairQuoteNumberPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/i, "Prefix must be letters, numbers, or hyphens").optional(),
  sageDefaultGlCode: z.string().max(50).nullable().optional(),
  sageDefaultDepartment: z.string().max(50).nullable().optional(),
  reportFooterText: z.string().max(2000).nullable().optional(),
});

export const companySettingsRouter = router({
  get: officeProcedure.query(async ({ ctx }) => {
    return db.getCompanySettings(ctx.user.companyId!);
  }),

  update: adminProcedure
    .input(settingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.gstRate !== undefined) patch.gstRate = String(input.gstRate.toFixed(4));
      if (input.pstRate !== undefined) patch.pstRate = String(input.pstRate.toFixed(4));
      if (input.technicianLabourRate !== undefined) patch.technicianLabourRate = String(input.technicianLabourRate.toFixed(2));
      if (input.fitterLabourRate !== undefined) patch.fitterLabourRate = String(input.fitterLabourRate.toFixed(2));
      if (input.quoteValidityDays !== undefined) patch.quoteValidityDays = input.quoteValidityDays;
      if (input.defaultQuoteTerms !== undefined) patch.defaultQuoteTerms = input.defaultQuoteTerms;
      if (input.invoiceDueDays !== undefined) patch.invoiceDueDays = input.invoiceDueDays;
      if (input.defaultInvoiceTerms !== undefined) patch.defaultInvoiceTerms = input.defaultInvoiceTerms;
      if (input.invoiceNumberPrefix !== undefined) patch.invoiceNumberPrefix = input.invoiceNumberPrefix.toUpperCase();
      if (input.repairQuoteNumberPrefix !== undefined) patch.repairQuoteNumberPrefix = input.repairQuoteNumberPrefix.toUpperCase();
      if (input.sageDefaultGlCode !== undefined) patch.sageDefaultGlCode = input.sageDefaultGlCode;
      if (input.sageDefaultDepartment !== undefined) patch.sageDefaultDepartment = input.sageDefaultDepartment;
      if (input.reportFooterText !== undefined) patch.reportFooterText = input.reportFooterText;

      await db.upsertCompanySettings(ctx.user.companyId!, patch as any);
      void logActivity({ ctx, entityType: "company_settings", entityId: ctx.user.companyId!, eventType: "updated",
        title: "Company settings updated" });
      return db.getCompanySettings(ctx.user.companyId!);
    }),
});
