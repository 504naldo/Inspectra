import { beforeAll, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { invoices } from "../drizzle/schema";
import * as db from "./db";
import { invoiceRouter } from "./routers/invoiceRouter";
import type { TrpcContext } from "./_core/context";
let caller: ReturnType<typeof invoiceRouter.createCaller>;
let companyId: number;
let context: TrpcContext;
beforeAll(async () => {
  companyId = (await db.createCompany({ name: "Payment state guard fixture" })).id;
  context = { user: { id: 1, role: "office", companyId }, req: { headers: {} }, res: {}, requestId: "payment-state-mysql" } as unknown as TrpcContext;
  caller = invoiceRouter.createCaller(context);
});
async function fixture() {
  const invoice = await caller.create({ taxRate: 0 });
  await caller.addLineItem({ invoiceId: invoice.id, description: "Recorded work", quantity: 1, unitPrice: 100, taxable: false });
  return invoice;
}
it.each(["paid", "partial"] as const)("rejects a raw unpaid-to-%s transition even with no receipt rows", async status => {
  const invoice = await fixture();
  await expect((await db.getDb())!.update(invoices).set({ status }).where(eq(invoices.id, invoice.id))).rejects.toThrow();
  expect(await db.getInvoiceById(invoice.id)).toMatchObject({ status: "draft", amountPaid: "0.00", balanceDue: "100.00" });
});
it("rejects a raw payment date on an unpaid invoice", async () => {
  const invoice = await fixture();
  await expect((await db.getDb())!.update(invoices).set({ paidAt: new Date() }).where(eq(invoices.id, invoice.id))).rejects.toThrow();
});
it.each(["paid", "partial"] as const)("rejects direct invoice insertion with %s status", async status => {
  await expect(db.createInvoice({ companyId, invoiceNumber: `UNSAFE-${crypto.randomUUID()}`, status, total: "100.00", amountPaid: "0.00", balanceDue: "100.00" })).rejects.toThrow();
});
it("preserves real cumulative payments and rejects voiding their invoice at the database boundary", async () => {
  const invoice = await fixture();
  await caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid: 25 });
  await expect((await db.getDb())!.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoice.id))).rejects.toThrow();
  await caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid: 75 });
  expect(await db.getInvoiceById(invoice.id)).toMatchObject({ status: "paid", amountPaid: "100.00", balanceDue: "0.00" });
});
it.each(["draft", "sent", "approved", "overdue"] as const)("rejects a raw partial-payment downgrade to %s", async status => {
  const invoice = await fixture();
  await caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid: 25 });
  await expect((await db.getDb())!.update(invoices).set({ status }).where(eq(invoices.id, invoice.id))).rejects.toThrow();
  expect(await db.getInvoiceById(invoice.id)).toMatchObject({ status: "partial", amountPaid: "25.00", balanceDue: "75.00" });
});
it("does not let an older writer reopen a fully paid invoice", async () => {
  const invoice = await fixture();
  await caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid: 100 });
  await expect((await db.getDb())!.update(invoices).set({ status: "approved" }).where(eq(invoices.id, invoice.id))).rejects.toThrow();
  expect(await db.getInvoiceById(invoice.id)).toMatchObject({ status: "paid", amountPaid: "100.00", balanceDue: "0.00" });
});
it.each([[25, "paid"], [100, "partial"]] as const)("rejects an inconsistent %s-dollar payment classification as %s even with the protocol marker", async (amountPaid, status) => {
  const invoice = await fixture();
  await caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid });
  await expect(db.withAudit(context, "test.invalidInvoicePaymentState", async tx => {
    await tx.execute(sql`SET @inspectra_payment_protocol = 2`);
    try { await tx.update(invoices).set({ status }).where(eq(invoices.id, invoice.id)); }
    finally { await tx.execute(sql`SET @inspectra_payment_protocol = NULL`); }
  })).rejects.toThrow();
  expect((await db.getInvoiceById(invoice.id))?.status).toBe(amountPaid === 100 ? "paid" : "partial");
});
it("still permits an unpaid invoice to be voided", async () => {
  const invoice = await fixture();
  await caller.void({ id: invoice.id });
  expect(await db.getInvoiceById(invoice.id)).toMatchObject({ status: "void", amountPaid: "0.00" });
});
