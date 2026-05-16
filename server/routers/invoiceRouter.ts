import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { INVOICE_STATUSES } from "../../drizzle/schema";
import { logActivity } from "../activityLogger";

function generateInvoiceNumber(prefix = "INV"): string {
  const now = new Date();
  const year = now.getFullYear();
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${year}-${seq}`;
}

// ── Edit-lock rules ───────────────────────────────────────────────────────────
// An invoice is locked (immutable for accounting) when:
//   - status is "paid"   → payment is final
//   - status is "void"   → voided invoices cannot be changed
//   - sageExportStatus is "exported" → already sent to Sage; changes would desync

function isInvoiceLocked(inv: { status: string; sageExportStatus: string | null }): boolean {
  return (
    inv.status === "paid" ||
    inv.status === "void" ||
    inv.sageExportStatus === "exported"
  );
}

function lockMessage(inv: { status: string; sageExportStatus: string | null }): string {
  if (inv.status === "void") return "This invoice has been voided and cannot be edited";
  if (inv.status === "paid") return "This invoice has been paid and is locked for accounting integrity";
  if (inv.sageExportStatus === "exported") return "This invoice has been exported to Sage and is locked";
  return "This invoice is locked";
}

// ── Status transition table ───────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:    ["sent", "void"],
  sent:     ["viewed", "approved", "void", "overdue"],
  viewed:   ["approved", "void", "overdue"],
  approved: ["paid", "partial", "void"],
  partial:  ["paid", "void"],
  overdue:  ["paid", "partial", "void"],
  paid:     [],   // terminal
  void:     [],   // terminal
};

// ── CSV helpers ───────────────────────────────────────────────────────────────
// Wrap a value in double-quotes if it contains commas, quotes, or newlines.
// Always safe to call; passes through clean values unchanged.
function csvCell(v: string | number | null | undefined): string {
  const s = (v ?? "").toString().trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
      const settings = await db.getCompanySettings(ctx.user.companyId!);
      const inv = await db.createInvoice({
        companyId: ctx.user.companyId,
        invoiceNumber: generateInvoiceNumber(settings.invoiceNumberPrefix ?? "INV"),
        status: "draft",
        createdById: ctx.user.id,
        ...input,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        taxRate: input.taxRate !== undefined ? String(input.taxRate) as any : undefined,
      });
      void logActivity({ ctx, entityType: "invoice", entityId: inv.id, eventType: "created",
        title: `Invoice created: ${inv.invoiceNumber}` });
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
      if (isInvoiceLocked(inv)) throw new TRPCError({ code: "BAD_REQUEST", message: lockMessage(inv) });
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
      if (isInvoiceLocked(inv)) throw new TRPCError({ code: "BAD_REQUEST", message: lockMessage(inv) });
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
      if (isInvoiceLocked(inv)) throw new TRPCError({ code: "BAD_REQUEST", message: lockMessage(inv) });
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
      if (isInvoiceLocked(inv)) throw new TRPCError({ code: "BAD_REQUEST", message: lockMessage(inv) });
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
      const allowed = ALLOWED_TRANSITIONS[inv.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition invoice from "${inv.status}" to "${input.status}"`,
        });
      }
      const updates: any = { status: input.status };
      if (input.status === "sent" && !inv.sentAt) updates.sentAt = new Date();
      await db.updateInvoice(input.id, updates);
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "status_changed",
        title: `Invoice status changed to ${input.status}`,
        oldValue: inv.status, newValue: input.status });
      return { success: true };
    }),

  markPaid: officeProcedure
    .input(z.object({
      id: z.number(),
      amountPaid: z.number().positive(),
      paidAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot record payment on a voided invoice" });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already fully paid" });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a Sage-exported invoice" });
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
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "paid",
        title: status === "paid" ? `Invoice paid in full: $${input.amountPaid.toFixed(2)}` : `Partial payment recorded: $${input.amountPaid.toFixed(2)}` });
      return { success: true };
    }),

  void: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already voided" });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot void a paid invoice. Use a credit note workflow instead." });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot void an invoice that has been exported to Sage. Contact your accountant to reverse it there first." });
      await db.updateInvoice(input.id, { status: "void" });
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "voided",
        title: "Invoice voided" });
      return { success: true };
    }),

  exportSage: officeProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      // Validate all invoices first, then generate CSV, then mark exported.
      // This prevents partial exports where some rows are marked and CSV is incomplete.
      const validated: any[] = [];
      for (const id of input.ids) {
        const inv = await db.getInvoiceById(id);
        if (!inv || inv.companyId !== ctx.user.companyId) continue;
        if (inv.status === "void") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} is voided and cannot be exported` });
        }
        const total = parseFloat(String(inv.total ?? "0"));
        const lineItems = await db.getLineItemsByInvoice(id);
        if (total === 0 && lineItems.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} has no line items and a zero total — add at least one line item before exporting` });
        }
        validated.push({ inv, lineItems });
      }

      // Build CSV rows with full escaping on every string field
      const rows: string[] = [
        "Invoice Number,Customer Code,Invoice Date,Due Date,Total,Tax,GL Code,Department,Bill To Name,Bill To Email,Bill To Address,Site ID,Status",
      ];
      for (const { inv } of validated) {
        rows.push([
          csvCell(inv.invoiceNumber),
          csvCell(inv.sageCustomerCode),
          inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "",
          inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "",
          csvCell(inv.total ?? "0.00"),
          csvCell(inv.taxAmount ?? "0.00"),
          csvCell(inv.sageGlCode),
          csvCell(inv.sageDepartment),
          csvCell(inv.billToName),
          csvCell(inv.billToEmail),
          csvCell(inv.billToAddress),
          csvCell(inv.siteId?.toString()),
          csvCell(inv.status),
        ].join(","));
      }

      // Mark exported only after all rows are built
      for (const { inv } of validated) {
        await db.updateInvoice(inv.id, {
          sageExportStatus: "exported",
          sageExportedAt: new Date(),
        });
        void logActivity({ ctx, entityType: "invoice", entityId: inv.id, eventType: "exported",
          title: `Invoice exported to Sage: ${inv.invoiceNumber}` });
      }

      return { csv: rows.join("\n"), count: validated.length };
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
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset Sage export status on a voided invoice" });
      await db.updateInvoice(input.id, { sageExportStatus: "pending" });
      return { success: true };
    }),

  markExportedToSage: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await db.getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot mark a voided invoice as exported" });
      await db.updateInvoice(input.id, { sageExportStatus: "exported", sageExportedAt: new Date() });
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "exported",
        title: "Invoice manually marked as exported to Sage" });
      return { success: true };
    }),
});
