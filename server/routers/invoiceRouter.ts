import { sendEmailOnce, EmailProviderRejected } from "../emailOutbox";
import { createHash } from "node:crypto";
import { toCustomerSafeInvoice } from "../customerDto";
import { invoices, invoicePayments } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
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
import { generateInvoiceNumber } from "../invoiceNumber.js";
import { assertInvoiceLinks } from "../invoiceLinks";
import { assertInvoiceContentEditable, assertInvoiceVoidable, assertSageInvoiceTotals, calculateInvoiceLineTotal, lockInvoiceBatchForCompany, lockInvoiceForCompany, recordInvoiceExport } from "../invoiceIntegrity";
import type { Db } from "../db/client";
import type { TrpcContext } from "../_core/context";

// ── Status transition table ───────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft:    ["sent", "void"],
  sent:     ["viewed", "approved", "void", "overdue"],
  viewed:   ["approved", "void", "overdue"],
  approved: ["void"],
  partial:  ["void"],
  overdue:  ["void"],
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

async function loadInvoiceDocument(tx: Db, ctx: TrpcContext, id: number) {
  const inv = await lockInvoiceForCompany(tx, id, ctx.user!.companyId!);
  await assertInvoiceLinks(inv, inv.companyId);
  const [lineItems, site, customer, company] = await Promise.all([
    db.getLineItemsByInvoice(id),
    inv.siteId ? db.getSiteById(inv.siteId) : undefined,
    inv.customerOrgId ? db.getCustomerOrgById(inv.customerOrgId) : undefined,
    db.getCompanyById(inv.companyId),
  ]);
  const toNum = (value: unknown) => Number(value ?? 0);
  const pdfData = buildCustomerSafeInvoiceData({
    invoiceId: inv.id, invoiceNumber: inv.invoiceNumber,
    companyName: company?.name ?? "EWF", companyPhone: company?.phone ?? "",
    companyEmail: company?.email ?? "", companyAddress: company?.address ?? "",
    billToName: inv.billToName ?? customer?.name ?? "", billToAddress: inv.billToAddress ?? "",
    billToCity: inv.billToCity ?? "", billToState: inv.billToState ?? "", billToPostalCode: inv.billToPostalCode ?? "",
    siteName: site?.name, siteAddress: site?.address ?? undefined,
    invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : null,
    dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
    lineItems: lineItems.map(li => ({ description: li.description, quantity: toNum(li.quantity),
      unitPrice: toNum(li.unitPrice), total: toNum(li.total), taxable: Boolean(li.taxable) })),
    subtotal: toNum(inv.subtotal), taxRate: toNum(inv.taxRate), taxAmount: toNum(inv.taxAmount),
    total: toNum(inv.total), amountPaid: toNum(inv.amountPaid), balanceDue: toNum(inv.balanceDue),
    clientNotes: inv.clientNotes,
  });
  return { inv, lineItems, site, customer, company, pdfData,
    fingerprint: createHash("sha256").update(JSON.stringify(pdfData)).digest("hex") };
}

function htmlText(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
}

export const invoiceRouter = router({
  listByCustomerOrg: customerProcedure.query(async ({ ctx }) => {
    const orgId = ctx.user.customerOrgId;
    if (!orgId) return [];
    const rows = await db.getInvoicesByCustomerOrg(orgId);
    const lineItemsByInvoice = await Promise.all(rows.map(inv => db.getLineItemsByInvoice(inv.id)));
    return rows.map((inv, i) => ({ ...toCustomerSafeInvoice(inv), lineItems: lineItemsByInvoice[i].map(
        ({ sageGlCode, sageDepartment, ...item }) => item
      ), }));
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
      return rows.map(inv => ({
        ...inv,
        customerOrgName: inv.customerOrgId ? ( orgMap.get(inv.customerOrgId) ?? null) : null,
      }));
    }),

  get: officeProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const inv = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      await assertInvoiceLinks(inv, inv.companyId);
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
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.create", async tx => {
        if (input.approvedWorkId != null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Create the invoice through its approved work record so approval billing cannot be duplicated." });
        }
        await assertInvoiceLinks(input, ctx.user.companyId!);
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
        taxRate: input.taxRate !== undefined ? ( String(input.taxRate) as any) : ( settings.gstRate as any),
        sageGlCode: input.sageGlCode ?? settings.sageDefaultGlCode ?? undefined,
        sageDepartment: input.sageDepartment ?? settings.sageDefaultDepartment ?? undefined,
        sageCustomerCode: input.sageCustomerCode ?? settings.sageCustomerCodeDefault ?? undefined,
      });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: inv.id, eventType: "created",
        title: `Invoice created: ${inv.invoiceNumber}`, });
      return inv;
    })),

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
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.update", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      const { id, ...data } = input;
        await assertInvoiceLinks({ ...inv, ...data }, inv.companyId);
      await assertInvoiceContentEditable(tx, inv);
      await db.updateInvoice(id, {
        ...data,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        taxRate: data.taxRate !== undefined ? ( String(data.taxRate) as any) : undefined,
      });
      await db.recalculateInvoiceTotals(id);
      return { success: true };
    })),

  addLineItem: officeProcedure
    .input(z.object({
      invoiceId: z.number(),
      description: z.string().min(1),
      quantity: z.number().min(0).multipleOf(0.01).default(1),
      unitPrice: z.number().min(0).multipleOf(0.01).default(0),
      taxable: z.boolean().default(true),
      sortOrder: z.number().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.addLineItem", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.invoiceId, ctx.user.companyId!);
      await assertInvoiceContentEditable(tx, inv);
      const lineTotal = calculateInvoiceLineTotal(input.quantity, input.unitPrice);
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
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: input.invoiceId, eventType: "updated",
        title: `Line item added: ${input.description}`,
        newValue: `$${lineTotal}`, });
      return item;
    })),

  updateLineItem: officeProcedure
    .input(z.object({
      id: z.number(),
      invoiceId: z.number(),
      description: z.string().min(1).optional(),
      quantity: z.number().min(0).multipleOf(0.01).optional(),
      unitPrice: z.number().min(0).multipleOf(0.01).optional(),
      taxable: z.boolean().optional(),
      sortOrder: z.number().optional(),
      sageGlCode: z.string().optional(),
      sageDepartment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.updateLineItem", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.invoiceId, ctx.user.companyId!);
      const { id, invoiceId, quantity, unitPrice, ...rest } = input;
        const item = await db.getInvoiceLineItemById(id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.invoiceId !== invoiceId)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Line does not belong to this invoice",
          });
      await assertInvoiceContentEditable(tx, inv);
      const lineTotal = calculateInvoiceLineTotal(quantity ?? item.quantity, unitPrice ?? item.unitPrice);
      await db.updateInvoiceLineItem(id, {
        ...rest,
        quantity: quantity !== undefined ? ( String(quantity) as any) : undefined,
        unitPrice: unitPrice !== undefined ? ( String(unitPrice) as any) : undefined,
        total: lineTotal !== undefined ? ( String(lineTotal) as any) : undefined,
      },
          invoiceId);
      await db.recalculateInvoiceTotals(invoiceId);
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: invoiceId, eventType: "updated",
        title: `Line item updated`, });
      return { success: true };
    })),

  removeLineItem: officeProcedure
    .input(z.object({ id: z.number(), invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.removeLineItem", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.invoiceId, ctx.user.companyId!);
        const item = await db.getInvoiceLineItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.invoiceId !== input.invoiceId)
          throw new TRPCError({ code: "FORBIDDEN" });
      await assertInvoiceContentEditable(tx, inv);
      await db.deleteInvoiceLineItem(input.id, input.invoiceId);
      await db.recalculateInvoiceTotals(input.invoiceId);
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: input.invoiceId, eventType: "updated",
        title: `Line item removed`, });
      return { success: true };
    })),

  updateStatus: officeProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(INVOICE_STATUSES),
    }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.updateStatus", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      if (input.status === "paid" || input.status === "partial") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Record a payment through the payment workflow to change payment status" });
      }
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice has been exported to Sage and is locked" });
      const allowed = ALLOWED_TRANSITIONS[inv.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition invoice from "${inv.status}" to "${input.status}"`,
        });
      }
      if (input.status === "void") await assertInvoiceVoidable(tx, inv);
      const updates: any = { status: input.status };
      if (input.status === "sent" && !inv.sentAt) updates.sentAt = new Date();
      await db.updateInvoice(input.id, updates);
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: input.id, eventType: "status_changed",
        title: `Invoice status changed to ${input.status}`,
        oldValue: inv.status, newValue: input.status, });
      return { success: true };
    })),

  paymentReceipt: officeProcedure
    .input(z.object({ id: z.number().int().positive(), requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getInvoiceForCompany(input.id, ctx.user.companyId!);
      const database = await db.getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [receipt] = await database.select().from(invoicePayments).where(and(
        eq(invoicePayments.invoiceId, input.id), eq(invoicePayments.requestId, input.requestId)));
      return receipt?.result ?? null;
    }),

  markPaid: officeProcedure
    .input(z.object({
      id: z.number(),
      amountPaid: z.number().positive()
          .refine(
            value =>
              Number.isSafeInteger(Math.round(value * 100)) &&
              Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
            "Use a whole number of cents"
          ),
        requestId: z.string().uuid(),
      paidAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return db.withAudit(ctx, "invoice.markPaid", async tx => {
        await tx.execute(sql`SET @inspectra_payment_protocol = 2`);
        try {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
        const [receipt] = await tx
          .select()
          .from(invoicePayments)
          .where(
            and(
              eq(invoicePayments.invoiceId, input.id),
              eq(invoicePayments.requestId, input.requestId)
            )
          );
        if (receipt) {
          if (
            Math.round(Number(receipt.amount) * 100) !==
            Math.round(input.amountPaid * 100) ||
            ((receipt.result as any).operationPaidAt ?? null) !== (input.paidAt ?? null)
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Payment request ID was already used for a different amount",
            });
          return receipt.result as {
            success: boolean;
            status: string;
            total: number;
            amountPaid: number;
            balanceDue: number;
          };
        }
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot record payment on a voided invoice", });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already fully paid", });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a Sage-exported invoice", });
      await db.recalculateInvoiceTotals(input.id);
      const fresh = await db.getInvoiceById(input.id);
      if (!fresh) throw new TRPCError({ code: "NOT_FOUND" });
      const totalCents = Math.round(Number(fresh.total ?? 0) * 100);
        const paidCents =
          Math.round(Number(fresh.amountPaid ?? 0) * 100) +
          Math.round(input.amountPaid * 100);
      const fullyPaid = paidCents >= totalCents;
      const response = {
          success: true, operationPaidAt: input.paidAt ?? null, status: fullyPaid ? "paid" : "partial",
          total: totalCents / 100,
          amountPaid: paidCents / 100, balanceDue: Math.max(0, totalCents - paidCents) / 100,
        };
        await tx
          .insert (invoicePayments)
          .values({
            invoiceId: input.id,
            requestId: input.requestId,
            amount:input.amountPaid.toFixed(2),
            result : response,
            recordedById: ctx.user.id, });
        await tx.update(invoices).set( {
        amountPaid: response.amountPaid.toFixed(2),
        balanceDue: response.balanceDue.toFixed(2),
        status: response.status as "paid" | "partial",
        paidAt: fullyPaid ?input.paidAt ? new Date(input.paidAt) : new Date() : null,
      })
          .where(eq(invoices.id, input.id));
      return response;
        } finally { await tx.execute(sql`SET @inspectra_payment_protocol = NULL`); }
      });
    }),

  void: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.void", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already voided", });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot void a paid invoice. Use a credit note workflow instead.", });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot void an invoice that has been exported to Sage. Contact your accountant to reverse it there first.", });
      await assertInvoiceVoidable(tx, inv);
      await db.updateInvoice(input.id, { status: "void" });
        await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: input.id, eventType: "voided",
        title: "Invoice voided", });
      return { success: true };
    })),

  exportSage: officeProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.exportSage", async tx => {
        // Lock the complete batch before any consistent reads. Otherwise an
        // earlier invoice/settings read can pin stale line/payment snapshots
        // while this transaction waits for the next invoice lock.
        const locked = await lockInvoiceBatchForCompany(tx, input.ids, ctx.user.companyId!);
        const validated = [];
        const taxCodes = new Map<number, string>();
        for (const inv of locked) {
          await assertInvoiceLinks(inv, inv.companyId);
          if (inv.status === "void") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Invoice ${inv.invoiceNumber} is voided and cannot be exported` });
          }
          const lineItems = await db.getLineItemsByInvoice(inv.id);
          assertSageInvoiceTotals(inv, lineItems);
          if (!taxCodes.has(inv.companyId)) {
            const settings = await db.getCompanySettings(inv.companyId);
            taxCodes.set(inv.companyId, settings.sageTaxCodeDefault ?? "");
          }
          validated.push({ inv, lineItems });
        }

        // Sage 50 Canada transaction-detail layout: one row per recorded line.
        // Missing or inconsistent detail must be reconciled, never synthesized.
        const rows = [
          "Invoice Number,Invoice Date,Due Date,Customer Code,Customer Name,Item Description,Quantity,Unit Price,Amount,G/L Account,Tax Code,Department,Status",
        ];
        for (const { inv, lineItems } of validated) {
          for (const li of lineItems) {
            rows.push([
              csvCell(inv.invoiceNumber), fmtSageDate(inv.invoiceDate), fmtSageDate(inv.dueDate),
              csvCell(inv.sageCustomerCode), csvCell(inv.billToName), csvCell(li.description),
              csvCell(li.quantity), csvCell(li.unitPrice), csvCell(li.total),
              csvCell(li.sageGlCode ?? inv.sageGlCode), csvCell(li.taxable ? taxCodes.get(inv.companyId) : ""),
              csvCell(li.sageDepartment ?? inv.sageDepartment), csvCell(inv.status),
            ].join(","));
          }
        }
        const exportedAt = new Date();
        for (const { inv } of validated) {
          if (inv.sageExportStatus === "exported") continue;
          await db.updateInvoice(inv.id, { sageExportStatus: "exported", sageExportedAt: exportedAt });
          await recordInvoiceExport(tx, ctx, inv, `Invoice exported to Sage: ${inv.invoiceNumber}`);
        }
        return { csv: rows.join("\n"), count: validated.length };
      })),

  markReadyForReview: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.markReadyForReview", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice has been exported to Sage and is locked" });
      if (!["sent", "viewed"].includes(inv.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice must be sent or viewed to mark as approved", });
      }
      await db.updateInvoice(input.id, { status: "approved" });
      return { success: true };
    })),

  markReadyForSageExport: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.markReadyForSageExport", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reset Sage export status on a voided invoice", });
      if (inv.sageExportStatus === "exported") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice has already been exported to Sage. Reverse the export in Sage before re-opening it here.", });
      await db.updateInvoice(input.id, { sageExportStatus: "pending" });
      return { success: true };
    })),

  markExportedToSage: officeProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) =>
      db.withAudit(ctx, "invoice.markExportedToSage", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot mark a voided invoice as exported", });
      await assertInvoiceLinks(inv, inv.companyId);
      assertSageInvoiceTotals(inv, await db.getLineItemsByInvoice(inv.id));
      if (inv.sageExportStatus !== "exported") {
        await db.updateInvoice(input.id, { sageExportStatus: "exported", sageExportedAt: new Date() });
        await recordInvoiceExport(tx, ctx, inv, "Invoice manually marked as exported to Sage");
      }
      return { success: true };
    })),

  // Capture the complete document on the invoice connection. A concurrent
  // payment/edit invalidates persistence of an older preview, not its source.
  generatePdf: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const snapshot = await db.withAudit(ctx, "invoice.generatePdf.snapshot", tx => loadInvoiceDocument(tx, ctx, input.id));
      const pdfBuffer = await generateInvoicePDF(snapshot.pdfData);
      const pdfKey = `invoices/${snapshot.inv.companyId}/${snapshot.inv.id}/preview-${snapshot.fingerprint}.pdf`;
      const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await db.withAudit(ctx, "invoice.generatePdf", async tx => {
        const current = await loadInvoiceDocument(tx, ctx, input.id);
        if (current.fingerprint !== snapshot.fingerprint) {
          throw new TRPCError({ code: "CONFLICT", message: "Invoice changed while preparing its PDF. Generate it again." });
        }
        await db.updateInvoice(input.id, { pdfUrl });
      });
      return { pdfUrl };
    }),

  send: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      to: z.array(z.string().email()).min(1),
      requestId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const authorized = await getInvoiceForCompany(input.id, ctx.user.companyId!);
      if (!ENV.resendApiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email delivery is not configured" });
      }
      let pdfUrl = authorized.pdfUrl;
      // Reservation precedes the lock/snapshot. All content edits take the same
      // parent lock and check this durable attempt, including ambiguous sends.
      const result = await sendEmailOnce({
        requestId: input.requestId, companyId: authorized.companyId, userId: ctx.user.id,
        entityType: "invoice", entityId: authorized.id, provider: "resend", payload: input,
        send: async () => {
          const snapshot = await db.withAudit(ctx, "invoice.send.snapshot", async tx => {
            const current = await loadInvoiceDocument(tx, ctx, input.id);
            if (current.inv.status === "void" || current.inv.status === "paid") {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a voided or paid invoice." });
            }
            assertSageInvoiceTotals(current.inv, current.lineItems);
            return current;
          });
          const { inv, site, customer, company, pdfData } = snapshot;
          const pdfBuffer = await generateInvoicePDF(pdfData);
          const pdfKey = `invoices/${inv.companyId}/${inv.id}/delivery-${input.requestId}.pdf`;
          ({ url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf"));
          // Persist the prepared artifact before provider dispatch so acceptance
          // recovery needs neither another PDF nor another storage operation.
          await db.withAudit(ctx, "invoice.send.prepare", async tx => {
            const current = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
            if (current.status === "void" || current.status === "paid") {
              throw new TRPCError({ code: "CONFLICT", message: "Invoice changed before sending. Review its current state." });
            }
            await db.updateInvoice(input.id, { pdfUrl });
          });
          const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
          const dueDate = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-CA") : "—";
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#1f2937">
<h1>Invoice ${htmlText(inv.invoiceNumber)}</h1><p>Hello ${htmlText(inv.billToName ?? customer?.name)},</p>
<p>Please find your invoice attached${site?.name ? ` for services at ${htmlText(site.name)}` : ""}.</p>
<p>Due: ${htmlText(dueDate)}<br/>Amount due: <strong>${htmlText(currency.format(Number(inv.balanceDue ?? inv.total ?? 0)))}</strong></p>
<p>Please reply to this email with any questions.</p><p>Sent by ${htmlText(company?.name)}.</p></div>`;
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENV.resendApiKey}`, "Idempotency-Key": input.requestId },
            body: JSON.stringify({
              from: `${company?.name ?? "Inspectra"} <noreply@inspectrafire.ca>`, to: input.to,
              subject: `Invoice ${inv.invoiceNumber}${site?.name ? ` — ${site.name}` : ""}`,
              html, attachments: [{ filename: `invoice-${inv.invoiceNumber}.pdf`, content: pdfBuffer.toString("base64") }],
            }),
          });
          if (!response.ok) {
            if ([401, 403, 429].includes(response.status)) throw new EmailProviderRejected(`Provider rejected the invoice (${response.status})`);
            throw new Error(`Invoice delivery outcome needs reconciliation (${response.status})`);
          }
          const receipt = await response.json() as { id?: unknown };
          if (typeof receipt?.id !== "string" || !receipt.id.trim()) {
            throw new Error("Invoice delivery outcome needs reconciliation: provider returned no message ID");
          }
          return { id: receipt.id };
        },
      });
      await db.withAudit(ctx, "invoice.send.accepted", async tx => {
        const inv = await lockInvoiceForCompany(tx, input.id, ctx.user.companyId!);
        // An accepted operation may be replayed after a payment, void, approval,
        // or export. The receipt is returned without downgrading later state.
        if (inv.status === "draft" && inv.sageExportStatus !== "exported") {
          await db.updateInvoice(input.id, { status: "sent", sentAt: inv.sentAt ?? new Date() });
          await logActivity({ ctx: { user: { ...ctx.user, companyId: inv.companyId } }, entityType: "invoice", entityId: inv.id, eventType: "invoice.sent",
            title: `Invoice emailed to ${input.to.join(", ")}`, oldValue: inv.status, newValue: "sent" });
        }
      });
      return { pdfUrl, acceptance: result.acceptance, messageId: result.id };
    }),
});
