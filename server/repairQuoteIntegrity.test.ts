import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(companyId: number, role = "office"): TrpcContext {
  return {
    user: { id: 1, role, companyId, name: "Quote integrity fixture" },
    req: { headers: {} }, res: { setHeader() {}, clearCookie() {} },
    requestId: "repair-quote-integrity", ipAddress: "127.0.0.1", userAgent: "vitest",
  } as unknown as TrpcContext;
}

async function tenant(label: string) {
  const company = await db.createCompany({ name: `Repair integrity ${label}` });
  const org = await db.createCustomerOrg({ companyId: company.id, name: label });
  const site = await db.createSite({ companyId: company.id, customerOrgId: org.id, name: label });
  const job = await db.createJob({
    companyId: company.id, customerOrgId: org.id, siteId: site.id,
    jobNumber: `RQI-${company.id}-${label}`, title: label,
  });
  return { company, org, site, job };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Repair quotes — parent authorization and atomic sealing (MySQL)", () => {
  let A: Awaited<ReturnType<typeof tenant>>, B: typeof A;
  let staff: ReturnType<typeof appRouter.createCaller>, admin: typeof staff;
  beforeAll(async () => {
    A = await tenant("alpha");
    B = await tenant("beta");
    staff = appRouter.createCaller(context(A.company.id));
    admin = appRouter.createCaller(context(A.company.id, "admin"));
  });
  afterEach(() => vi.restoreAllMocks());

  async function makeQuote(owner = A, withItem = true) {
    const quote = await db.createQuote({
      companyId: owner.company.id, customerOrgId: owner.org.id, siteId: owner.site.id,
      jobId: owner.job.id, quoteType: "repair", lineItems: [], total: "0", status: "draft",
    });
    const caller = appRouter.createCaller(context(owner.company.id));
    const item = withItem ? await caller.repairQuote.addItem({ quoteId: quote.id, description: "Original", partUnitPrice: 100 }) : undefined;
    return { quote, item: item!, caller };
  }

  it("checks the actual child parent for update, delete and approval", async () => {
    const first = await makeQuote(), second = await makeQuote();
    await expect(staff.repairQuote.updateItem({ id: first.item.id, quoteId: second.quote.id, description: "Corrupted" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(staff.repairQuote.removeItem({ id: first.item.id, quoteId: second.quote.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await staff.repairQuote.finalizeQuote({ id: second.quote.id });
    await expect(staff.repairQuote.updateItemApprovalStatus({ itemId: first.item.id, quoteId: second.quote.id, approvalStatus: "approved" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.getRepairQuoteItemById(first.item.id)).toMatchObject({ quoteId: first.quote.id, description: "Original", approvalStatus: "pending" });
    expect((await db.getQuoteById(second.quote.id))?.total).toBe("112.00");
  });

  it("denies foreign quote writes before child changes", async () => {
    const { quote, item } = await makeQuote(B);
    for (const action of [
      () => staff.repairQuote.addItem({ quoteId: quote.id, description: "Foreign" }),
      () => staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, quantity: 9 }),
      () => staff.repairQuote.removeItem({ quoteId: quote.id, id: item.id }),
      () => staff.repairQuote.updateRepairQuote({ id: quote.id, notes: "Foreign" }),
      () => staff.repairQuote.finalizeQuote({ id: quote.id }),
    ]) await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({ quantity: 1 });
    expect((await db.getQuoteById(quote.id))?.finalizedAt).toBeNull();
  });

  it("locks finalized pricing and notes for office and platform admin", async () => {
    const { quote, item } = await makeQuote();
    await staff.repairQuote.finalizeQuote({ id: quote.id });
    for (const caller of [staff, admin]) {
      for (const action of [
        () => caller.repairQuote.addItem({ quoteId: quote.id, description: "Late" }),
        () => caller.repairQuote.updateItem({ quoteId: quote.id, id: item.id, quantity: 9 }),
        () => caller.repairQuote.removeItem({ quoteId: quote.id, id: item.id }),
        () => caller.repairQuote.updateRepairQuote({ id: quote.id, notes: "Late" }),
      ]) await expect(action()).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({ description: "Original", quantity: 1 });
    expect((await db.getQuoteById(quote.id))?.total).toBe("112.00");
  });

  it("blocks the generic and building quote edit bypass while a repair quote remains draft", async () => {
    const { quote } = await makeQuote();
    for (const finalized of [false, true]) {
      if (finalized) await staff.repairQuote.finalizeQuote({ id: quote.id });
      await expect(staff.quote.update({ id: quote.id, lineItems: [], notes: "Bypass" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(staff.quote.updateBuilding({ id: quote.id, comments: "Bypass", siteId: B.site.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(await db.getQuoteById(quote.id)).toMatchObject({ status: "draft", total: "112.00", notes: null, siteId: A.site.id });
  });

  it("rejects deficiencies from another job before insert or update", async () => {
    const { quote, item } = await makeQuote();
    const siblingJob = await db.createJob({
      companyId: A.company.id, siteId: A.site.id, customerOrgId: A.org.id,
      jobNumber: `RQI-${A.company.id}-sibling`, title: "Sibling",
    });
    for (const job of [B.job, siblingJob]) {
      const deficiency = await db.createDeficiency({ jobId: job.id, reportedById: 1, title: "Unrelated" });
      await expect(staff.repairQuote.addItem({ quoteId: quote.id, description: "Foreign deficiency", deficiencyId: deficiency.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, deficiencyId: deficiency.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    const own = await db.createDeficiency({ jobId: A.job.id, reportedById: 1, title: "Own" });
    await staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, deficiencyId: own.id });
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({ deficiencyId: own.id });
    expect(await db.getRepairQuoteItemsByQuote(quote.id)).toHaveLength(1);
  });

  it("preserves pricing, quantity and ordering when updating only item metadata", async () => {
    const { quote } = await makeQuote(A, false);
    const item = await staff.repairQuote.addItem({
      quoteId: quote.id, description: "Priced scope", quantity: 3, partUnitPrice: 120,
      techHours: 2, fitterHours: 1, techLabourRate: 75, fitterLabourRate: 65,
      fuelCharge: 15, backflowReportFee: 40, sortOrder: 7,
    });
    const { updatedAt: _updatedAt, ...original } = (await db.getRepairQuoteItemById(item.id))!;
    await staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, description: "Reworded scope" });
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({ ...original, description: "Reworded scope" });
    const deficiency = await db.createDeficiency({ jobId: A.job.id, reportedById: 1, title: "Linked scope" });
    await staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, deficiencyId: deficiency.id });
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({ ...original, description: "Reworded scope", deficiencyId: deficiency.id });
    expect((await db.getQuoteById(quote.id))?.total).toBe("685.95");
  });

  it("applies an explicit zero fee without clearing omitted item pricing", async () => {
    const { quote } = await makeQuote(A, false);
    const item = await staff.repairQuote.addItem({
      quoteId: quote.id, description: "Priced scope", quantity: 2, partUnitPrice: 100,
      fuelCharge: 10, sortOrder: 9,
    });
    await staff.repairQuote.updateItem({ quoteId: quote.id, id: item.id, fuelCharge: 0 });
    expect(await db.getRepairQuoteItemById(item.id)).toMatchObject({
      quantity: 2, partUnitPrice: "100.00", fuelCharge: "0.00", sortOrder: 9, total: "224.00",
    });
    expect((await db.getQuoteById(quote.id))?.total).toBe("224.00");
  });

  it("derives part ownership from the quote even for cross-company platform operations", async () => {
    const { quote, item } = await makeQuote(B);
    const part = await db.createPartsCatalogItem({ companyId: B.company.id, category: "Test", productName: "Target-company part", unitPrice: "50" });
    const wrongPart = await db.createPartsCatalogItem({ companyId: A.company.id, category: "Test", productName: "Wrong-company part", unitPrice: "40" });
    await expect(admin.repairQuote.addItem({ quoteId: quote.id, description: "Target part", partId: part.id })).resolves.toMatchObject({ partId: part.id, partUnitPrice: "50" });
    await expect(admin.repairQuote.updateItem({ quoteId: quote.id, id: item.id, partId: wrongPart.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.repairQuote.addItem({ quoteId: quote.id, description: "Wrong part", partId: wrongPart.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await db.getRepairQuoteItemsByQuote(quote.id))).toHaveLength(2);
  });

  it("recomputes stored totals from authoritative items before sealing", async () => {
    const { quote } = await makeQuote();
    await db.updateQuote(quote.id, { total: "999", subtotal: "999", gst: "999", pst: "999" });
    await staff.repairQuote.finalizeQuote({ id: quote.id });
    expect(await db.getQuoteById(quote.id)).toMatchObject({ total: "112.00", subtotal: "100.00", gst: "5.00", pst: "7.00", finalizedAt: expect.any(Date) });
  });

  it("rolls back a child insert when saving the parent total fails", async () => {
    const { quote } = await makeQuote(A, false);
    const original = db.updateQuote;
    vi.spyOn(db, "updateQuote").mockImplementation(async (id, changes) => {
      if (id === quote.id && changes.total !== undefined) throw new Error("Injected total failure");
      return original(id, changes);
    });
    await expect(staff.repairQuote.addItem({ quoteId: quote.id, description: "Rolled back", partUnitPrice: 100 })).rejects.toThrow("Injected total failure");
    expect(await db.getRepairQuoteItemsByQuote(quote.id)).toEqual([]);
    expect((await db.getQuoteById(quote.id))?.total).toBe("0.00");
  });

  it("rolls back creation when deficiency pre-population fails", async () => {
    const deficiency = await db.createDeficiency({ jobId: A.job.id, reportedById: 1, title: "Create rollback" });
    const previousIds = (await db.getQuotesByJob(A.job.id)).map(quote => quote.id);
    vi.spyOn(db, "createRepairQuoteItem").mockRejectedValueOnce(new Error("Injected pre-population failure"));
    await expect(staff.repairQuote.createRepairQuote({ jobId: A.job.id, deficiencyIds: [deficiency.id] })).rejects.toThrow("Injected pre-population failure");
    expect((await db.getQuotesByJob(A.job.id)).map(quote => quote.id)).toEqual(previousIds);
  });

  it("does not expose the new quote to a finalizer while children are being pre-populated", async () => {
    const deficiencies = await Promise.all(["First", "Second"].map(title => db.createDeficiency({ jobId: A.job.id, reportedById: 1, title })));
    const inserted = deferred(), release = deferred();
    const original = db.createRepairQuoteItem;
    let pendingId = 0;
    vi.spyOn(db, "createRepairQuoteItem").mockImplementation(async values => {
      const item = await original(values);
      if (!pendingId) {
        pendingId = values.quoteId;
        inserted.resolve();
        await release.promise;
      }
      return item;
    });
    const creating = staff.repairQuote.createRepairQuote({ jobId: A.job.id, deficiencyIds: deficiencies.map(deficiency => deficiency.id) });
    await inserted.promise;
    let visible;
    try { visible = await db.getQuoteById(pendingId); }
    finally { release.resolve(); }
    const created = await creating;
    expect(visible).toBeUndefined();
    expect(await db.getRepairQuoteItemsByQuote(created.quoteId)).toHaveLength(2);
  });

  it("serializes concurrent additions so parent totals include every committed child", async () => {
    const { quote } = await makeQuote(A, false);
    await Promise.all(Array.from({ length: 8 }, (_, index) => staff.repairQuote.addItem({ quoteId: quote.id, description: `Concurrent ${index}`, partUnitPrice: 25 * (index + 1) })));
    const items = await db.getRepairQuoteItemsByQuote(quote.id);
    expect(items).toHaveLength(8);
    expect((await db.getQuoteById(quote.id))?.total).toBe("1008.00");
  });

  it("holds the parent lock between finalization validation and sealing, blocking last-item deletion", async () => {
    const { quote, item } = await makeQuote();
    const inspected = deferred(), release = deferred();
    const original = db.getRepairQuoteItemsByQuote;
    let paused = false;
    vi.spyOn(db, "getRepairQuoteItemsByQuote").mockImplementation(async id => {
      const items = await original(id);
      if (id === quote.id && !paused) {
        paused = true;
        inspected.resolve();
        await release.promise;
      }
      return items;
    });
    const finalize = staff.repairQuote.finalizeQuote({ id: quote.id });
    await inspected.promise;
    const removal = staff.repairQuote.removeItem({ quoteId: quote.id, id: item.id })
      .then(() => "removed", error => error.code as string);
    let early: string | null;
    try {
      early = await Promise.race([removal, new Promise<null>(done => setTimeout(() => done(null), 100))]);
    } finally { release.resolve(); }
    await finalize;
    expect(await removal).toBe("CONFLICT");
    expect(early).toBeNull();
    expect(await db.getRepairQuoteItemById(item.id)).toBeDefined();
    expect((await db.getQuoteById(quote.id))?.finalizedAt).toBeTruthy();
  });

  it("a finalizer waiting behind deletion observes the committed empty quote", async () => {
    const { quote, item } = await makeQuote();
    const recalculating = deferred(), release = deferred();
    const original = db.getRepairQuoteItemsByQuote;
    let paused = false;
    vi.spyOn(db, "getRepairQuoteItemsByQuote").mockImplementation(async id => {
      const items = await original(id);
      if (id === quote.id && !paused) {
        paused = true;
        recalculating.resolve();
        await release.promise;
      }
      return items;
    });
    const removal = staff.repairQuote.removeItem({ quoteId: quote.id, id: item.id });
    await recalculating.promise;
    const finalize = staff.repairQuote.finalizeQuote({ id: quote.id })
      .then(() => "finalized", error => error.code as string);
    let early: string | null;
    try {
      early = await Promise.race([finalize, new Promise<null>(done => setTimeout(() => done(null), 100))]);
    } finally { release.resolve(); }
    await removal;
    expect(await finalize).toBe("BAD_REQUEST");
    expect(early).toBeNull();
    expect(await db.getRepairQuoteItemsByQuote(quote.id)).toEqual([]);
    expect(await db.getQuoteById(quote.id)).toMatchObject({ finalizedAt: null, total: "0.00" });
  });
});
