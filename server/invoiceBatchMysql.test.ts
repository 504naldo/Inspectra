import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { invoices } from "../drizzle/schema";
import * as db from "./db";
import { invoiceRouter } from "./routers/invoiceRouter";
import { lockInvoiceForCompany } from "./invoiceIntegrity";
import type { TrpcContext } from "./_core/context";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Prepared for the disposable, journal-migrated MySQL suite. No provider or
// storage calls are made; these cases require real row locks and COMMITs.
describe("Invoice batch concurrency and export rollback (MySQL)", () => {
  let ctx: TrpcContext;
  let caller: ReturnType<typeof invoiceRouter.createCaller>;
  beforeAll(async () => {
    const company = await db.createCompany({ name: "Invoice batch concurrency" });
    ctx = { user: { id: 1, role: "office", companyId: company.id, name: "Invoice tester" },
      req: { headers: {} }, res: {}, requestId: "invoice-batch-mysql" } as unknown as TrpcContext;
    caller = invoiceRouter.createCaller(ctx);
  });
  afterEach(() => vi.restoreAllMocks());

  async function fixture() {
    const invoice = await caller.create({ taxRate: 0 });
    const line = await caller.addLineItem({ invoiceId: invoice.id, description: `Batch work ${invoice.id}`, quantity: 1, unitPrice: 100, taxable: false });
    return { invoice, line };
  }

  it("exports the line edit committed while waiting for the final invoice lock", async () => {
    const first = await fixture(), second = await fixture();
    const prepared = deferred(), release = deferred();
    const editing = db.withAudit(ctx, "test.invoice.lineEdit", async tx => {
      await lockInvoiceForCompany(tx, second.invoice.id, ctx.user!.companyId!);
      await db.updateInvoiceLineItem(second.line.id, { unitPrice: "200.00", total: "200.00" }, second.invoice.id);
      await db.recalculateInvoiceTotals(second.invoice.id);
      prepared.resolve(); await release.promise;
    });
    await prepared.promise;
    const exporting = caller.exportSage({ ids: [second.invoice.id, first.invoice.id] });
    let early: unknown;
    try { early = await Promise.race([exporting, new Promise<null>(done => setTimeout(() => done(null), 100))]); }
    finally { release.resolve(); }
    await editing;
    expect(early).toBeNull();
    const result = await exporting;
    expect(result.csv).toContain(`Batch work ${second.invoice.id},1.00,200.00,200.00`);
    expect((await db.getInvoiceById(second.invoice.id))?.total).toBe("200.00");
  });

  it("exports a committed cumulative partial payment instead of its pre-lock snapshot", async () => {
    const { invoice } = await fixture();
    const prepared = deferred(), release = deferred();
    const originalAudit = db.withAudit;
    vi.spyOn(db, "withAudit").mockImplementation((context, procedure, write) => originalAudit(context, procedure, async tx => {
      const result = await write(tx);
      if (procedure === "invoice.markPaid") { prepared.resolve(); await release.promise; }
      return result;
    }));
    const paying = caller.markPaid({ id: invoice.id, requestId: crypto.randomUUID(), amountPaid: 25 });
    await prepared.promise;
    const exporting = caller.exportSage({ ids: [invoice.id] });
    let early: unknown;
    try { early = await Promise.race([exporting, new Promise<null>(done => setTimeout(() => done(null), 100))]); }
    finally { release.resolve(); }
    await paying;
    expect(early).toBeNull();
    expect((await exporting).csv).toContain(",partial");
    expect(await db.getInvoiceById(invoice.id)).toMatchObject({ amountPaid: "25.00", balanceDue: "75.00", sageExportStatus: "exported" });
  });

  it("rolls export flags back when its mandatory activity insert fails", async () => {
    const first = await fixture(), second = await fixture();
    // MySQL strict mode rejects the varchar(255) actorName. Failure occurs
    // after the export flag write, exercising a real transaction rollback.
    const invalidActor = invoiceRouter.createCaller({ ...ctx, user: { ...ctx.user!, name: "X".repeat(300) } });
    await expect(invalidActor.exportSage({ ids: [first.invoice.id, second.invoice.id] })).rejects.toThrow();
    const database = (await db.getDb())!;
    const [a] = await database.select().from(invoices).where(eq(invoices.id, first.invoice.id));
    const [b] = await database.select().from(invoices).where(eq(invoices.id, second.invoice.id));
    expect([a.sageExportStatus, b.sageExportStatus]).toEqual(["pending", "pending"]);
    expect([a.sageExportedAt, b.sageExportedAt]).toEqual([null, null]);
  });
});
