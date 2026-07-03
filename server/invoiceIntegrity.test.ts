/**
 * invoiceIntegrity.test.ts — invoice paid/terminal-state hardening (Part 9).
 *
 * Verifies markPaid recomputes from authoritative line items (no stale totals),
 * the atomic eligibility guard, and that terminal states block further mutation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctxFor(role: string, companyId: number): TrpcContext {
  return { user: { id: 1, openId: "o", email: "o@e.com", name: "O", role, companyId, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} }, requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

describe("Invoice integrity — markPaid + terminal states", () => {
  let companyId: number, otherCompanyId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let otherCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    companyId = (await db.createCompany({ name: "Inv Co", email: "i@e.com" })).id;
    otherCompanyId = (await db.createCompany({ name: "Other Co", email: "o2@e.com" })).id;
    caller = appRouter.createCaller(ctxFor("office", companyId));
    // void + Sage export are admin-only (PR-10); use an admin caller to set those states.
    adminCaller = appRouter.createCaller(ctxFor("admin", companyId));
    otherCaller = appRouter.createCaller(ctxFor("office", otherCompanyId));
  });

  // Create a draft invoice with one non-taxable line item of `lineTotal`.
  async function makeInvoice(lineTotal: number): Promise<number> {
    const inv = await caller.invoice.create({ taxRate: 0 });
    await caller.invoice.addLineItem({ invoiceId: inv.id, description: "Work", quantity: 1, unitPrice: lineTotal, taxable: false });
    return inv.id;
  }

  it("marks paid in full using freshly recalculated totals", async () => {
    const id = await makeInvoice(100);
    const res = await caller.invoice.markPaid({ id, amountPaid: 100 });
    expect(res.status).toBe("paid");
    expect(res.total).toBe(100);
    expect(res.balanceDue).toBe(0);
    const inv = await db.getInvoiceById(id);
    expect(inv?.status).toBe("paid");
    expect(inv?.paidAt).toBeTruthy();
  });

  it("recalculates from line items (a stale total cannot be used to mark paid)", async () => {
    const id = await makeInvoice(100);
    // Total grows to 150 after another line item; paying 100 must be partial, not paid.
    await caller.invoice.addLineItem({ invoiceId: id, description: "Extra", quantity: 1, unitPrice: 50, taxable: false });
    const res = await caller.invoice.markPaid({ id, amountPaid: 100 });
    expect(res.total).toBe(150);
    expect(res.status).toBe("partial");
    expect(res.balanceDue).toBe(50);
  });

  it("records a partial payment", async () => {
    const id = await makeInvoice(200);
    const res = await caller.invoice.markPaid({ id, amountPaid: 50 });
    expect(res.status).toBe("partial");
    expect(res.balanceDue).toBe(150);
  });

  it("rejects paying an already-paid invoice", async () => {
    const id = await makeInvoice(100);
    await caller.invoice.markPaid({ id, amountPaid: 100 });
    await expect(caller.invoice.markPaid({ id, amountPaid: 100 })).rejects.toThrow(/already fully paid/i);
  });

  it("blocks line-item edits once paid (terminal lock)", async () => {
    const id = await makeInvoice(100);
    await caller.invoice.markPaid({ id, amountPaid: 100 });
    await expect(caller.invoice.addLineItem({ invoiceId: id, description: "late", quantity: 1, unitPrice: 5, taxable: false })).rejects.toThrow();
  });

  it("rejects paying a voided invoice", async () => {
    const id = await makeInvoice(100);
    await adminCaller.invoice.void({ id });
    await expect(caller.invoice.markPaid({ id, amountPaid: 100 })).rejects.toThrow(/voided/i);
  });

  it("rejects paying a Sage-exported invoice", async () => {
    const id = await makeInvoice(100);
    await adminCaller.invoice.exportSage({ ids: [id] });
    await expect(caller.invoice.markPaid({ id, amountPaid: 100 })).rejects.toThrow(/exported/i);
  });

  it("forbids marking another company's invoice paid", async () => {
    const id = await makeInvoice(100);
    await expect(otherCaller.invoice.markPaid({ id, amountPaid: 100 })).rejects.toThrow();
  });

  it("atomic guard prevents a double-apply race (db.markInvoicePaidIfEligible)", async () => {
    const id = await makeInvoice(100);
    const first = await db.markInvoicePaidIfEligible(id, companyId, { amountPaid: "100", balanceDue: "0", status: "paid", paidAt: new Date() });
    const second = await db.markInvoicePaidIfEligible(id, companyId, { amountPaid: "100", balanceDue: "0", status: "paid", paidAt: new Date() });
    expect(first).toBe(true);
    expect(second).toBe(false); // already paid → zero rows matched
  });
});
