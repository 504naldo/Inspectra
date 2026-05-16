import { z } from "zod";
import { router, officeProcedure, adminProcedure } from "../_core/trpc.js";
import * as db from "../db.js";
import { logActivity } from "../activityLogger.js";

const settingsUpdateSchema = z.object({
  // Company profile
  companyDisplayName: z.string().max(255).nullable().optional(),
  logoUrl: z.string().max(500).url("Must be a valid URL").nullable().optional(),
  // Tax
  gstRate: z.number().nonnegative().max(1).optional(),
  pstRate: z.number().nonnegative().max(1).optional(),
  // Labour
  technicianLabourRate: z.number().nonnegative().optional(),
  fitterLabourRate: z.number().nonnegative().optional(),
  defaultFuelCharge: z.number().nonnegative().optional(),
  quoteValidityDays: z.number().int().min(1).max(365).optional(),
  defaultQuoteTerms: z.string().max(2000).nullable().optional(),
  // Invoice
  invoiceDueDays: z.number().int().min(0).max(365).optional(),
  defaultInvoiceTerms: z.string().max(2000).nullable().optional(),
  invoiceNumberPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/i, "Prefix must be letters, numbers, or hyphens").optional(),
  repairQuoteNumberPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/i, "Prefix must be letters, numbers, or hyphens").optional(),
  // Sage
  sageDefaultGlCode: z.string().max(50).nullable().optional(),
  sageDefaultDepartment: z.string().max(50).nullable().optional(),
  sageCustomerCodeDefault: z.string().max(50).nullable().optional(),
  sageTaxCodeDefault: z.string().max(50).nullable().optional(),
  // Reports
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
      // Company profile
      if (input.companyDisplayName !== undefined) patch.companyDisplayName = input.companyDisplayName;
      if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
      // Tax
      if (input.gstRate !== undefined) patch.gstRate = String(input.gstRate.toFixed(4));
      if (input.pstRate !== undefined) patch.pstRate = String(input.pstRate.toFixed(4));
      // Labour
      if (input.technicianLabourRate !== undefined) patch.technicianLabourRate = String(input.technicianLabourRate.toFixed(2));
      if (input.fitterLabourRate !== undefined) patch.fitterLabourRate = String(input.fitterLabourRate.toFixed(2));
      if (input.defaultFuelCharge !== undefined) patch.defaultFuelCharge = String(input.defaultFuelCharge.toFixed(2));
      if (input.quoteValidityDays !== undefined) patch.quoteValidityDays = input.quoteValidityDays;
      if (input.defaultQuoteTerms !== undefined) patch.defaultQuoteTerms = input.defaultQuoteTerms;
      // Invoice
      if (input.invoiceDueDays !== undefined) patch.invoiceDueDays = input.invoiceDueDays;
      if (input.defaultInvoiceTerms !== undefined) patch.defaultInvoiceTerms = input.defaultInvoiceTerms;
      if (input.invoiceNumberPrefix !== undefined) patch.invoiceNumberPrefix = input.invoiceNumberPrefix.toUpperCase();
      if (input.repairQuoteNumberPrefix !== undefined) patch.repairQuoteNumberPrefix = input.repairQuoteNumberPrefix.toUpperCase();
      // Sage
      if (input.sageDefaultGlCode !== undefined) patch.sageDefaultGlCode = input.sageDefaultGlCode;
      if (input.sageDefaultDepartment !== undefined) patch.sageDefaultDepartment = input.sageDefaultDepartment;
      if (input.sageCustomerCodeDefault !== undefined) patch.sageCustomerCodeDefault = input.sageCustomerCodeDefault;
      if (input.sageTaxCodeDefault !== undefined) patch.sageTaxCodeDefault = input.sageTaxCodeDefault;
      // Reports
      if (input.reportFooterText !== undefined) patch.reportFooterText = input.reportFooterText;

      await db.upsertCompanySettings(ctx.user.companyId!, patch as any);
      void logActivity({ ctx, entityType: "company_settings", entityId: ctx.user.companyId!, eventType: "updated",
        title: "Company settings updated" });
      return db.getCompanySettings(ctx.user.companyId!);
    }),
});
