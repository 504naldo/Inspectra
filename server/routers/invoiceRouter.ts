import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, customerProcedure } from "../_core/trpc";
import * as db from "../db";
import { getInvoiceForCompany } from "../tenantGuards";
import { INVOICE_STATUSES } from "../../drizzle/schema";
import { logActivity } from "../activityLogger";
import { ENV } from "../_core/env.js";
import { storagePut } from "../storage.js";
import { generateInvoicePDF } from "../invoicePdfGenerator.js";
import { buildCustomerSafeInvoiceData } from "../customerSafeReport.js";

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
// Wrap a value in double-quotes if it contains commas, quotes, or newlines, and
// neutralize spreadsheet formula injection by prefixing a single quote when the
// value begins with =, +, -, or @ (Excel/Sage would otherwise evaluate it as a
// formula). Always safe to call; passes through clean values unchanged.
function csvCell(v: string | number | null | undefined): string {
  let s = (v ?? "").toString().trim();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Format a date for Sage 50 Canada import. Defaults to MM/DD/YYYY (the common
// Sage 50 CA short-date format). If your company file is set to ISO, change the
// return to `${dt.getFullYear()}-${mm}-${dd}`.
function fmtSageDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${dt.getFullYear()}`;
}

export const invoiceRouter = router({
  listByCustomerOrg: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) return [];
    const rows = await db.getInvoicesByCustomerOrg(orgId);
    const lineItemsByInvoice = await Promise.all(rows.map((inv) => db.getLineItemsByInvoice(inv.id)));
    return rows.map((inv, i) => ({ ...inv, lineItems: lineItemsByInvoice[i] }));
  }),

  list: officeProcedure
    .input(z.object({
      status: z.string().optional(),
      sageExportStatus: z.enum(["pending", "exported", "error"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      let rows = await db.getInvoicesByCompany(ctx.user.companyId!, input.status);
      if (input.sageExportStatus) {
        rows = rows.filter((r: any) => r.sageExportStatus === input.sageExportStatus);
      }
      const customerOrgs = await db.getCustomerOrgsByCompany(ctx.user.companyId!);
      const orgMap = new Map(customerOrgs.map((o: any) => [o.id, o.name]));
      return rows.map((inv) => ({
        ...inv,
        customerOrgName: inv.customerOrgId ? orgMap.get(inv.customerOrgId) ?? null : null,
      }));
    }),

  get: officeProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
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
      const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
      let dueDate: Date | undefined;
      if (input.dueDate) {
        dueDate = new Date(input.dueDate);
      } else {
        dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + (settings.invoiceDueDays ?? 30));
      }
      const inv = await db.createInvoice({
        companyId: ctx.user.companyId!,
        invoiceNumber: generateInvoiceNumber(settings.invoiceNumberPrefix ?? "INV"),
        status: "draft",
        createdById: ctx.user.id,
        ...input,
        invoiceDate,
        dueDate,
        taxRate: input.taxRate !== undefined ? String(input.taxRate) as any : settings.gstRate as any,
        sageGlCode: input.sageGlCode ?? settings.sageDefaultGlCode ?? undefined,
        sageDepartment: input.sageDepartment ?? settings.sageDefaultDepartment ?? undefined,
        sageCustomerCode: input.sageCustomerCode ?? settings.sageCustomerCodeDefault ?? undefined,
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
      const inv = await getInvoiceForCompany(id, ctx.user.companyId!);
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
      const inv = await getInvoiceForCompany(input.invoiceId, ctx.user.companyId!);
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
      void logActivity({ ctx, entityType: "invoice", entityId: input.invoiceId, eventType: "updated",
        title: `Line item added: ${input.description}`,
        newValue: `$${lineTotal.toFixed(2)}` });
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
      const inv = await getInvoiceForCompany(invoiceId, ctx.user.companyId!);
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
      void logActivity({ ctx, entityType: "invoice", entityId: invoiceId, eventType: "updated",
        title: `Line item updated` });
      return { success: true };
    }),

  removeLineItem: officeProcedure
    .input(z.object({ id: z.number(), invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.invoiceId, ctx.user.companyId!);
      if (isInvoiceLocked(inv)) throw new TRPCError({ code: "BAD_REQUEST", message: lockMessage(inv) });
      await db.deleteInvoiceLineItem(input.id);
      await db.recalculateInvoiceTotals(input.invoiceId);
      void logActivity({ ctx, entityType: "invoice", entityId: input.invoiceId, eventType: "updated",
        title: `Line item removed` });
      return { success: true };
    }),

  updateStatus: officeProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(INVOICE_STATUSES),
    }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
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
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot record payment on a voided invoice" });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already fully paid" });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a Sage-exported invoice" });

      // Recompute totals from the authoritative line items so a payment is never
      // accepted against a stale stored total, then read the fresh total back.
      await db.recalculateInvoiceTotals(input.id);
      const fresh = await db.getInvoiceById(input.id);
      if (!fresh) throw new TRPCError({ code: "NOT_FOUND" });
      const total = parseFloat(String(fresh.total ?? "0"));
      const fullyPaid = input.amountPaid >= total;
      const status = fullyPaid ? "paid" : "partial";
      const balanceDue = Math.max(0, total - input.amountPaid);

      // Atomic, eligibility-guarded write: prevents a double-apply race (two
      // concurrent mark-paid requests) and re-checks paid/void/exported in the
      // WHERE clause. A false result means another action already transitioned it.
      const applied = await db.markInvoicePaidIfEligible(input.id, ctx.user.companyId!, {
        amountPaid: String(input.amountPaid),
        balanceDue: String(balanceDue),
        status,
        paidAt: fullyPaid ? (input.paidAt ? new Date(input.paidAt) : new Date()) : null,
      });
      if (!applied) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This invoice was already updated (paid, voided, exported, or changed by another action). Reload and try again.",
        });
      }

      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "paid",
        title: fullyPaid ? `Invoice paid in full: $${input.amountPaid.toFixed(2)}` : `Partial payment recorded: $${input.amountPaid.toFixed(2)}`,
        newValue: `total $${total.toFixed(2)}, paid $${input.amountPaid.toFixed(2)}, balance $${balanceDue.toFixed(2)}` });
      return { success: true, status, total, amountPaid: input.amountPaid, balanceDue };
    }),

  void: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
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
      const settings = await db.getCompanySettings(ctx.user.companyId!);
      const sageTaxCode = settings.sageTaxCodeDefault ?? "";
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

      // Sage 50 Canada–oriented, line-item (transaction-detail) layout: one row
      // per invoice line, all sharing the invoice number so a Sage 50 import
      // (or an add-on importer such as Zed Axis / XLGL) groups them into a
      // single sales invoice. Dates are MM/DD/YYYY (Sage 50 CA default — see
      // fmtSageDate). "Tax Code" is the company's Sage tax code applied to
      // taxable lines (blank on non-taxable; invoices sourced from approved
      // work carry tax-inclusive lines flagged non-taxable). "G/L Account" and
      // "Department" come from the invoice's Sage fields. Every string field is
      // escaped + formula-injection-safe via csvCell().
      const rows: string[] = [
        "Invoice Number,Invoice Date,Due Date,Customer Code,Customer Name,Item Description,Quantity,Unit Price,Amount,G/L Account,Tax Code,Department,Status",
      ];
      for (const { inv, lineItems } of validated) {
        const invDate = fmtSageDate(inv.invoiceDate);
        const dueDate = fmtSageDate(inv.dueDate);
        // Fall back to a single summary line if an invoice has no line items.
        const summaryAmount = inv.subtotal ?? inv.total ?? "0";
        const lines = lineItems.length > 0
          ? lineItems
          : [{
              description: `Invoice ${inv.invoiceNumber}`,
              quantity: "1",
              unitPrice: summaryAmount,
              total: summaryAmount,
              taxable: parseFloat(String(inv.taxAmount ?? "0")) > 0,
            }];
        for (const li of lines) {
          rows.push([
            csvCell(inv.invoiceNumber),
            invDate,
            dueDate,
            csvCell(inv.sageCustomerCode),
            csvCell(inv.billToName),
            csvCell(li.description),
            csvCell(String(li.quantity ?? "1")),
            csvCell(String(li.unitPrice ?? "0")),
            csvCell(String(li.total ?? "0")),
            csvCell(inv.sageGlCode),
            csvCell(li.taxable ? sageTaxCode : ""),
            csvCell(inv.sageDepartment),
            csvCell(inv.status),
          ].join(","));
        }
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
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (!["sent", "viewed"].includes(inv.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be sent or viewed to mark as approved" });
      }
      await db.updateInvoice(input.id, { status: "approved" });
      return { success: true };
    }),

  markReadyForSageExport: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset Sage export status on a voided invoice" });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice has already been exported to Sage. Reverse the export in Sage before re-opening it here." });
      await db.updateInvoice(input.id, { sageExportStatus: "pending" });
      return { success: true };
    }),

  markExportedToSage: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot mark a voided invoice as exported" });
      await db.updateInvoice(input.id, { sageExportStatus: "exported", sageExportedAt: new Date() });
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "exported",
        title: "Invoice manually marked as exported to Sage" });
      return { success: true };
    }),

  // Generate (or regenerate) the invoice PDF and store it — without sending email.
  // Returns the S3/R2 URL so the admin can preview or download.
  generatePdf: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);

      const [lineItems, site, customer, company] = await Promise.all([
        db.getLineItemsByInvoice(input.id),
        inv.siteId ? db.getSiteById(inv.siteId) : Promise.resolve(undefined),
        inv.customerOrgId ? db.getCustomerOrgById(inv.customerOrgId) : Promise.resolve(undefined),
        db.getCompanyById(inv.companyId),
      ]);

      const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

      const pdfBuffer = await generateInvoicePDF(buildCustomerSafeInvoiceData({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        companyName: company?.name ?? "EWF",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
        companyAddress: company?.address ?? "",
        billToName: inv.billToName ?? customer?.name ?? "",
        billToAddress: inv.billToAddress ?? "",
        billToCity: inv.billToCity ?? "",
        billToState: inv.billToState ?? "",
        billToPostalCode: inv.billToPostalCode ?? "",
        siteName: site?.name,
        siteAddress: site?.address ?? undefined,
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
        dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
        lineItems: lineItems.map((li) => ({
          description: li.description ?? "",
          quantity: toNum(li.quantity),
          unitPrice: toNum(li.unitPrice),
          total: toNum(li.total),
          taxable: Boolean(li.taxable),
        })),
        subtotal: toNum(inv.subtotal),
        taxRate: toNum(inv.taxRate),
        taxAmount: toNum(inv.taxAmount),
        total: toNum(inv.total),
        amountPaid: toNum(inv.amountPaid),
        balanceDue: toNum(inv.balanceDue),
        clientNotes: inv.clientNotes,
      }));

      const pdfKey = `invoices/${inv.companyId}/${inv.id}/invoice-${inv.id}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

      await db.updateInvoice(input.id, { pdfUrl } as any);
      return { pdfUrl };
    }),

  send: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      to: z.array(z.string().email()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (inv.status === "void" || inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a voided or paid invoice." });
      }

      const [lineItems, site, customer, company] = await Promise.all([
        db.getLineItemsByInvoice(input.id),
        inv.siteId ? db.getSiteById(inv.siteId) : Promise.resolve(undefined),
        inv.customerOrgId ? db.getCustomerOrgById(inv.customerOrgId) : Promise.resolve(undefined),
        db.getCompanyById(inv.companyId),
      ]);

      const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

      const pdfBuffer = await generateInvoicePDF(buildCustomerSafeInvoiceData({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        companyName: company?.name ?? "EWF",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
        companyAddress: company?.address ?? "",
        billToName: inv.billToName ?? customer?.name ?? "",
        billToAddress: inv.billToAddress ?? "",
        billToCity: inv.billToCity ?? "",
        billToState: inv.billToState ?? "",
        billToPostalCode: inv.billToPostalCode ?? "",
        siteName: site?.name,
        siteAddress: site?.address ?? undefined,
        invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
        dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
        lineItems: lineItems.map((li) => ({
          description: li.description ?? "",
          quantity: toNum(li.quantity),
          unitPrice: toNum(li.unitPrice),
          total: toNum(li.total),
          taxable: Boolean(li.taxable),
        })),
        subtotal: toNum(inv.subtotal),
        taxRate: toNum(inv.taxRate),
        taxAmount: toNum(inv.taxAmount),
        total: toNum(inv.total),
        amountPaid: toNum(inv.amountPaid),
        balanceDue: toNum(inv.balanceDue),
        clientNotes: inv.clientNotes,
      }));

      const pdfKey = `invoices/${inv.companyId}/${inv.id}/invoice-${inv.id}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");

      if (ENV.resendApiKey) {
        const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
        const fmtDate = (d: Date | string | null | undefined) =>
          d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#1e3a8a;padding:20px 24px;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Invoice ${inv.invoiceNumber}</h1>
  </div>
  <div style="padding:24px;">
    <p>Hello ${inv.billToName ?? customer?.name ?? ""},</p>
    <p>Please find your invoice attached${site?.name ? ` for services at <strong>${site.name}</strong>` : ""}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:6px 0;color:#6b7280;">Invoice #</td><td style="padding:6px 0;font-weight:bold;">${inv.invoiceNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;">${fmtDate(inv.invoiceDate)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Due</td><td style="padding:6px 0;">${fmtDate(inv.dueDate)}</td></tr>
      <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 0;font-weight:bold;">Amount Due</td><td style="padding:8px 0;font-weight:bold;font-size:16px;">${CAD.format(toNum(inv.balanceDue || inv.total))}</td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;">The full invoice is attached as a PDF. Please reply to this email with any questions.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="color:#9ca3af;font-size:12px;margin:0;">Sent by ${company?.name ?? ""}.</p>
  </div>
</body></html>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENV.resendApiKey}` },
          body: JSON.stringify({
            from: `${company?.name ?? "Inspectra"} <noreply@inspectrafire.ca>`,
            to: input.to,
            subject: `Invoice ${inv.invoiceNumber}${site?.name ? ` — ${site.name}` : ""}`,
            html,
            attachments: [{ filename: `invoice-${inv.invoiceNumber}.pdf`, content: pdfBuffer.toString("base64") }],
          }),
        });
      }

      const updates: Record<string, unknown> = { pdfUrl, status: "sent" };
      if (!inv.sentAt) updates.sentAt = new Date();
      await db.updateInvoice(input.id, updates as any);
      void logActivity({ ctx, entityType: "invoice", entityId: input.id, eventType: "quote.sent",
        title: `Invoice emailed to ${input.to.join(", ")}`, oldValue: inv.status, newValue: "sent" });

      return { pdfUrl };
    }),
});
