import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { INVOICE_STATUSES } from "../../drizzle/schema";

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `INV-${year}-${seq}`;
}

export const invoiceRouter = router({
  list: officeProcedure
    .input(z.object({
      status: z.string().optional(),
      sageExportStatus: z.enum(["pending", "exported", "error"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      let rows = await db.getInvoicesByCompany(ctx.user.companyId, input.status);
      if (input.sageExportStatus) {
        rows = rows.filter((r: any) => r.sageExportStatus === input.sageExportStatus);
      }
      const customerOrgs = await db.getCustomerOrgsByCompany(ctx.user.companyId);
      const orgMap = new Map(customerOrgs.map((o: any) => [o.id, o.name]));
      return rows.map((inv) => ({
        ...inv,
        customerOrgName: inv.customerOrgId ? orgMap.get(inv.customerOrgId) ?? null : null,
      }));
    }),

  get: officeProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const lineItems = await db.getLineItemsByInvoice(inv.id);
      const [customerOrg, site] = await Promise.all([
        inv.customerOrgId ? db.getCustomerOrgById(inv.customerOrgId) : null,
        inv.siteId ? db.getSiteById(inv.siteId) : null,
      ]);
      return { ...inv, lineItems, customerOrg, site };
    }),

  create: officeProcedure
    .input(z.object({
      customerOrgId: z.number().optional(),
      siteId: z.number().optional(),
      jobId: z.number().optional(),
      approvedWorkId: z.number().optional(),
      workOrderId: z.number().optional(),
      quoteId: z.number().optional(),
      billToName: z.string().optional(),
      billToAddress: z.string().optional(),
      billToCity: z.string().optional(),
      billToState: z.string().optional(),
      billToPostalCode: z.string().optional(),
      billToEmail: z.string().optional(),
      invoiceDate: z.string().optional(),
      dueDate: z.string().optional(),
      taxRate: z.number().min(0).max(1).optional(),
      internalNotes: z.string().optional(),
      clientNotes: z.string().optional(),
      sageCustomerCode: z.string().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.createInvoice({
        companyId: ctx.user.companyId,
        invoiceNumber: generateInvoiceNumber(),
        status: "draft",
        createdById: ctx.user.id,
        ...input,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        taxRate: input.taxRate !== undefined ? String(input.taxRate) as any : undefined,
      });
      return inv;
    }),

  update: officeProcedure
    .input(z.object({
      id: z.number(),
      billToName: z.string().optional(),
      billToAddress: z.string().optional(),
      billToCity: z.string().optional(),
      billToState: z.string().optional(),
      billToPostalCode: z.string().optional(),
      billToEmail: z.string().optional(),
      invoiceDate: z.string().optional(),
      dueDate: z.string().optional(),
      taxRate: z.number().min(0).max(1).optional(),
      internalNotes: z.string().optional(),
      clientNotes: z.string().optional(),
      sageCustomerCode: z.string().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
      customerOrgId: z.number().optional(),
      siteId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const inv = await db.getInvoiceById(id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a voided invoice" });
      await db.updateInvoice(id, {
        ...data,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        taxRate: data.taxRate !== undefined ? String(data.taxRate) as any : undefined,
      });
      await db.recalculateInvoiceTotals(id);
      return { success: true };
    }),

  addLineItem: officeProcedure
    .input(z.object({
      invoiceId: z.number(),
      description: z.string().min(1),
      quantity: z.number().min(0).default(1),
      unitPrice: z.number().min(0).default(0),
      taxable: z.boolean().default(true),
      sortOrder: z.number().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a voided invoice" });
      const lineTotal = input.quantity * input.unitPrice;
      const item = await db.createInvoiceLineItem({
        invoiceId: input.invoiceId,
        description: input.description,
        quantity: String(input.quantity) as any,
        unitPrice: String(input.unitPrice) as any,
        total: String(lineTotal) as any,
        taxable: input.taxable,
        sortOrder: input.sortOrder ?? 0,
        sageGlCode: input.sageGlCode,
        sageDepartment: input.sageDepartment,
      });
      await db.recalculateInvoiceTotals(input.invoiceId);
      return item;
    }),

  updateLineItem: officeProcedure
    .input(z.object({
      id: z.number(),
      invoiceId: z.number(),
      description: z.string().min(1).optional(),
      quantity: z.number().min(0).optional(),
      unitPrice: z.number().min(0).optional(),
      taxable: z.boolean().optional(),
      sortOrder: z.number().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, invoiceId, quantity, unitPrice, ...rest } = input;
      const inv = await db.getInvoiceById(invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a voided invoice" });
      const lineTotal =
        quantity !== undefined && unitPrice !== undefined ? quantity * unitPrice : undefined;
      await db.updateInvoiceLineItem(id, {
        ...rest,
        quantity: quantity !== undefined ? String(quantity) as any : undefined,
        unitPrice: unitPrice !== undefined ? String(unitPrice) as any : undefined,
        total: lineTotal !== undefined ? String(lineTotal) as any : undefined,
      });
      await db.recalculateInvoiceTotals(invoiceId);
      return { success: true };
    }),

  removeLineItem: officeProcedure
    .input(z.object({ id: z.number(), invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a voided invoice" });
      await db.deleteInvoiceLineItem(input.id);
      await db.recalculateInvoiceTotals(input.invoiceId);
      return { success: true };
    }),

  updateStatus: officeProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(INVOICE_STATUSES),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const updates: any = { status: input.status };
      if (input.status === "sent" && !inv.sentAt) updates.sentAt = new Date();
      await db.updateInvoice(input.id, updates);
      return { success: true };
    }),

  markPaid: officeProcedure
    .input(z.object({
      id: z.number(),
      amountPaid: z.number().min(0),
      paidAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const total = parseFloat(String(inv.total ?? "0"));
      const status = input.amountPaid >= total ? "paid" : "partial";
      const balanceDue = Math.max(0, total - input.amountPaid);
      await db.updateInvoice(input.id, {
        amountPaid: String(input.amountPaid) as any,
        balanceDue: String(balanceDue) as any,
        status,
        paidAt: input.amountPaid >= total
          ? (input.paidAt ? new Date(input.paidAt) : new Date())
          : undefined,
      });
      return { success: true };
    }),

  void: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.updateInvoice(input.id, { status: "void" });
      return { success: true };
    }),

  exportSage: officeProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const rows: string[] = [
        "Invoice Number,Customer Code,Invoice Date,Due Date,Total,Tax,GL Code,Department,Bill To Name,Site,Status",
      ];
      for (const id of input.ids) {
        const inv = await db.getInvoiceById(id);
        if (!inv || inv.companyId !== ctx.user.companyId) continue;
        rows.push([
          inv.invoiceNumber,
          inv.sageCustomerCode ?? "",
          inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
          inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
          inv.total ?? "0.00",
          inv.taxAmount ?? "0.00",
          inv.sageGlCode ?? "",
          inv.sageDepartment ?? "",
          `"${(inv.billToName ?? "").replace(/"/g, '""')}"`,
          inv.siteId?.toString() ?? "",
          inv.status,
        ].join(","));
        await db.updateInvoice(id, {
          sageExportStatus: "exported",
          sageExportedAt: new Date(),
        });
      }
      return { csv: rows.join("\n"), count: rows.length - 1 };
    }),

  markReadyForReview: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (!["sent", "viewed"].includes(inv.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be sent or viewed to mark as approved" });
      }
      await db.updateInvoice(input.id, { status: "approved" });
      return { success: true };
    }),

  markReadyForSageExport: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.updateInvoice(input.id, { sageExportStatus: "pending" });
      return { success: true };
    }),

  markExportedToSage: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.updateInvoice(input.id, { sageExportStatus: "exported", sageExportedAt: new Date() });
      return { success: true };
    }),
});
