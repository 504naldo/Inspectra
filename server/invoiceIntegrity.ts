import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { activityEvents, emailOutbox, invoicePayments, invoices, type Invoice, type InvoiceLineItem } from "../drizzle/schema";
import { callerIsPlatformOperator } from "./_core/actorContext";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";

/** The first reads in a financial transaction must be current, locking reads. */
export async function lockInvoiceForCompany(tx: Db, id: number, companyId: number): Promise<Invoice> {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
  if (invoice.companyId !== companyId && !callerIsPlatformOperator()) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return invoice;
}

/** Lock every parent before starting a REPEATABLE READ snapshot for any child. */
export async function lockInvoiceBatchForCompany(tx: Db, ids: number[], companyId: number): Promise<Invoice[]> {
  if (new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Select each invoice only once" });
  }
  const locked = new Map<number, Invoice>();
  for (const id of [...ids].sort((a, b) => a - b)) {
    locked.set(id, await lockInvoiceForCompany(tx, id, companyId));
  }
  return ids.map(id => locked.get(id)!);
}

/** A draft may already have reached a customer if saving its sent state failed. */
export async function assertInvoiceContentEditable(tx: Db, invoice: Invoice): Promise<void> {
  if (invoice.status === "paid" || invoice.status === "void" || invoice.sageExportStatus === "exported") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice is locked for accounting integrity" });
  }
  const [attempt] = await tx.select({ id: emailOutbox.id }).from(emailOutbox).where(and(
    eq(emailOutbox.companyId, invoice.companyId), eq(emailOutbox.entityType, "invoice"),
    eq(emailOutbox.entityId, invoice.id), inArray(emailOutbox.status, ["sending", "unknown", "accepted"]),
  )).limit(1);
  if (attempt) {
    throw new TRPCError({ code: "CONFLICT", message: "This invoice has a pending or accepted email and its contents are locked. Resolve the delivery or create a new invoice to change its contents." });
  }
}

export async function assertInvoiceVoidable(tx: Db, invoice: Invoice): Promise<void> {
  const paid = Number(invoice.amountPaid ?? 0);
  const [receipt] = await tx.select({ id: invoicePayments.id }).from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoice.id)).limit(1);
  if (!Number.isFinite(paid) || paid < 0 || paid > 0 || receipt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An invoice with received payments cannot be voided. Use a credit or refund workflow." });
  }
}

function scaled(value: string | number | null, scale: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? ""));
  if (!match || (match[2]?.length ?? 0) > scale) throw new Error("Invalid decimal");
  return BigInt(match[1]) * BigInt("1".padEnd(scale + 1, "0")) + BigInt((match[2] ?? "").padEnd(scale, "0") || "0");
}

function money(cents: bigint): string {
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

export function calculateInvoiceLineTotal(quantity: string | number | null, unitPrice: string | number | null): string {
  return money((scaled(quantity, 2) * scaled(unitPrice, 2) + BigInt(50)) / BigInt(100));
}

export function calculateInvoiceTotals(invoice: Pick<Invoice, "taxRate" | "amountPaid">, lines: Pick<InvoiceLineItem, "total" | "taxable">[]) {
  let subtotal = BigInt(0);
  let taxableSubtotal = BigInt(0);
  for (const line of lines) {
    const amount = scaled(line.total, 2);
    subtotal += amount;
    if (line.taxable) taxableSubtotal += amount;
  }
  const taxRate = scaled(invoice.taxRate, 4);
  if (taxRate > BigInt(10000)) throw new Error("Invalid tax rate");
  const tax = (taxableSubtotal * taxRate + BigInt(5000)) / BigInt(10000);
  const total = subtotal + tax;
  const paid = scaled(invoice.amountPaid, 2);
  return {
    subtotal: money(subtotal), taxAmount: money(tax), total: money(total),
    balanceDue: money(total > paid ? total - paid : BigInt(0)),
  };
}

/** Validate recorded accounting evidence; exporting must never silently repair it. */
export function assertSageInvoiceTotals(invoice: Invoice, lines: InvoiceLineItem[]): void {
  try {
    if (!lines.length) throw new Error("No line items");
    for (const line of lines) {
      if (scaled(calculateInvoiceLineTotal(line.quantity, line.unitPrice), 2) !== scaled(line.total, 2)) {
        throw new Error("Line total mismatch");
      }
    }
    const expected = calculateInvoiceTotals(invoice, lines);
    for (const key of ["subtotal", "taxAmount", "total", "balanceDue"] as const) {
      if (scaled(invoice[key], 2) !== scaled(expected[key], 2)) throw new Error("Invoice total mismatch");
    }
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Invoice ${invoice.invoiceNumber} has missing or inconsistent line items, totals, or payment balance. Reconcile it before issuing or exporting.` });
  }
}

/** Export evidence is part of the transaction and must fail with its flags. */
export async function recordInvoiceExport(tx: Db, ctx: TrpcContext, invoice: Invoice, title: string): Promise<void> {
  await tx.insert(activityEvents).values({
    companyId: invoice.companyId,
    actorUserId: ctx.user!.id,
    actorName: ctx.user!.name ?? null,
    actorRole: ctx.user!.role,
    entityType: "invoice", entityId: invoice.id, eventType: "exported", title,
  });
}
