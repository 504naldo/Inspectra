import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { approvedWork, jobs, quotes, repairQuoteItems, workOrders, type ApprovedWork, type Job, type Quote, type RepairQuoteItem, type WorkOrder } from "../drizzle/schema";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { repairQuoteRouter, approveRepairQuoteFromCustomer } from "./routers/repairQuoteRouter";

vi.mock("./db", () => ({
  getDb: vi.fn(), withAudit: vi.fn(), getQuoteById: vi.fn(), updateQuote: vi.fn(),
  getRepairQuoteItemsByQuote: vi.fn(), getRepairQuoteItemById: vi.fn(),
  getApprovedWorkByQuoteItem: vi.fn(), createApprovedWork: vi.fn(),
  createJob: vi.fn(), updateJob: vi.fn(), createWorkOrder: vi.fn(), getDeficiencyById: vi.fn(),
  hasUndismissedNotification: vi.fn(), createNotification: vi.fn(), updateDeficiency: vi.fn(),
}));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));
const dialect = new MySqlDialect();
let quote: Quote;
let jobRows: Job[];
let orders: WorkOrder[];
let items: RepairQuoteItem[];
let work: ApprovedWork[];
let sequence: string[];
let inside: boolean;
let database: any;
let failWork: boolean;

function context(role = "office", companyId = 10): TrpcContext {
  return { user: { id: 1, role, companyId }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
}
const caller = (role = "office", companyId = 10) => repairQuoteRouter.createCaller(context(role, companyId));

beforeEach(() => {
  vi.resetAllMocks();
  quote = {
    id: 25, companyId: 10, siteId: 2, customerOrgId: 3, jobId: 1,
    quoteType: "repair", status: "sent", finalizedAt: new Date("2026-01-01"),
    total: "150.00", subtotal: "150.00", gst: "0.00", pst: "0.00", quoteNumber: "RQ-25", acceptToken: "token", acceptTokenExpiresAt: new Date(Date.now() + 60_000),
  } as Quote;
  jobRows = [{ id: 1, companyId: 10, siteId: 2, customerOrgId: 3, jobType: "annual", finalizedAt: new Date("2026-01-01"), title: "Sealed inspection" } as Job];
  orders = [];
  items = [
    { id: 30, quoteId: 25, description: "Repair A", total: "100.00", approvalStatus: "pending", deficiencyId: null, partId: null },
    { id: 31, quoteId: 25, description: "Repair B", total: "50.00", approvalStatus: "pending", deficiencyId: null, partId: null },
  ].map(item => ({ ...item, partTotal: item.total, labourTotal: "0", fuelCharge: "0", backflowReportFee: "0", gst: "0", pst: "0" })) as RepairQuoteItem[];
  work = [];
  inside = false;
  sequence = [];
  failWork = false;
  let tail = Promise.resolve();
  const transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const saved = structuredClone({ quote, jobRows, orders, items, work });
    inside = true;
    sequence.push("begin");
    try { const result = await fn(database); sequence.push("commit"); return result; }
    catch (error) { ({ quote, jobRows, orders, items, work } = saved); sequence.push("rollback"); throw error; }
    finally { inside = false; release(); }
  };
  database = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const params = dialect.sqlToQuery(condition).params;
      const rows = () => {
        if (table === jobs) return jobRows.filter(job => job.id === params[0]);
        if (table === quotes) return quote.id === params[0] ? [quote] : [];
        if (table === workOrders) return orders.filter(order => order.quoteId === params[0]);
        if (table === approvedWork) return work.filter(record => record.quoteId === params[0]);
        throw new Error("unexpected table");
      };
      return {
        for: async (mode: string) => {
          expect(inside).toBe(true); expect(mode).toBe("update");
          sequence.push(table === jobs ? `job lock ${params[0]}` : table === quotes ? "quote lock" : "work order lock");
          return structuredClone(rows());
        },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(structuredClone(rows())).then(resolve, reject),
      };
    } }) }),
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: any) => {
      expect(inside).toBe(true);
      const params = dialect.sqlToQuery(condition).params;
      if (table === repairQuoteItems) {
        expect(params[1]).toBe(quote.id);
        Object.assign(items.find(item => item.id === params[0] && item.quoteId === params[1])!, patch);
      } else if (table === quotes) Object.assign(quote, patch);
      else if (table === workOrders) {
        expect(params[1]).toBe(quote.id);
        Object.assign(orders.find(order => order.id === params[0] && order.quoteId === params[1])!, patch);
      } else throw new Error("unexpected mutation");
    } }) }),
    transaction,
  };
  vi.mocked(db.getDb).mockResolvedValue(database);
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, fn) => transaction(fn) as any);
  vi.mocked(db.getQuoteById).mockImplementation(async () => structuredClone(quote));
  vi.mocked(db.updateQuote).mockImplementation(async (_id, patch) => { expect(inside).toBe(true); Object.assign(quote, patch); });
  vi.mocked(db.getRepairQuoteItemsByQuote).mockImplementation(async () => structuredClone(items));
  vi.mocked(db.getRepairQuoteItemById).mockImplementation(async id => structuredClone(items.find(item => item.id === id)));
  vi.mocked(db.getApprovedWorkByQuoteItem).mockImplementation(async id => structuredClone(work.find(record => record.quoteItemId === id)));
  vi.mocked(db.createJob).mockImplementation(async value => {
    expect(inside).toBe(true);
    const created = { finalizedAt: null, ...value, id: 100 + jobRows.length } as Job;
    jobRows.push(created); return created;
  });
  vi.mocked(db.createWorkOrder).mockImplementation(async value => {
    expect(inside).toBe(true);
    const created = { finalizedAt: null, ...value, id: 200 + orders.length } as WorkOrder;
    orders.push(created); return created;
  });
  vi.mocked(db.updateJob).mockImplementation(async (id, patch) => {
    expect(inside).toBe(true);
    Object.assign(jobRows.find(job => job.id === id)!, patch);
  });
  vi.mocked(db.createApprovedWork).mockImplementation(async value => {
    expect(inside).toBe(true);
    if (failWork && work.length) throw new Error("approved work persistence failed");
    const created = { ...value, id: 300 + work.length } as ApprovedWork;
    work.push(created); return created;
  });
});

describe("Repair quote lifecycle locking and boundaries", () => {
  it("locks historical source then quote before a delivery transition", async () => {
    quote.status = "draft";
    await caller().markSent({ id: 25 });
    expect(quote.status).toBe("sent");
    expect(sequence).toEqual(["begin", "job lock 1", "quote lock", "work order lock", "commit"]);
  });

  it("rechecks status after locking instead of downgrading an accepted quote from a stale read", async () => {
    const stale = { ...quote };
    quote.status = "accepted";
    vi.mocked(db.getQuoteById).mockResolvedValue(stale);
    await expect(caller().markSent({ id: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(quote.status).toBe("accepted");
  });

  it("rejects mixed owned/foreign selected IDs before changing any decision", async () => {
    await expect(caller().approveSelectedItems({ id: 25, itemIds: [30, 999] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(items.map(item => item.approvalStatus)).toEqual(["pending", "pending"]);
  });

  it("a converted item cannot be reset or declined", async () => {
    items[0].approvalStatus = "converted_to_approved_work";
    await expect(caller().updateItemApprovalStatus({ quoteId: 25, itemId: 30, approvalStatus: "pending" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller().declineSelectedItems({ id: 25, itemIds: [30] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(items[0].approvalStatus).toBe("converted_to_approved_work");
  });

  it("closed quotes cannot be reopened through approval or delivery routes", async () => {
    quote.status = "cancelled";
    await expect(caller().approveAllItems({ id: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller().markSent({ id: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("invalid approval timestamps do not replace recorded evidence", async () => {
    await expect(caller().recordApproval({ id: 25, approvalSource: "email", approvedAt: "not-a-date" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateQuote).not.toHaveBeenCalled();
  });
});

describe("Repair artifacts preserve the original inspection and exact approved scope", () => {
  it("keeps item, sealed header, work order and approved amount identical for fractional-cent labour", async () => {
    quote.status = "draft"; quote.finalizedAt = null;
    items = [items[0]];
    await caller().updateItem({ quoteId: 25, id: 30, quantity: 1, partUnitPrice: 0.05,
      techHours: 0.01, techLabourRate: 0.05, fitterHours: 0, fitterLabourRate: 0,
      fuelCharge: 0, backflowReportFee: 0 });
    expect(items[0]).toMatchObject({ partTotal: "0.05", labourTotal: "0", gst: "0", pst: "0", total: "0.05" });
    expect(quote.total).toBe("0.05");
    await caller().finalizeQuote({ id: 25 });
    await caller().markSent({ id: 25 });
    await approveRepairQuoteFromCustomer(structuredClone(quote), { token: "token" });
    expect(quote.total).toBe("0.05");
    expect(orders[0].total).toBe("0.05");
    expect(work[0].approvedAmount).toBe("0.05");
  });

  it("creates a distinct pending repair job/WO and item snapshots from a sealed inspection", async () => {
    quote.status = "partially_approved";
    items[0].approvalStatus = "approved";
    items[1].approvalStatus = "declined";
    const originalSource = structuredClone(jobRows[0]);
    const result = await caller().convertApprovedItemsToApprovedWork({ id: 25 });
    expect(result).toMatchObject({ created: 1, skipped: 0 });
    expect(jobRows[0]).toEqual(originalSource);
    expect(jobRows[1]).toMatchObject({ jobType: "repair", status: "pending", siteId: 2, customerOrgId: 3, scopeOfWork: "Repair A" });
    expect(orders[0]).toMatchObject({ jobId: jobRows[1].id, quoteId: 25, total: "100.00" });
    expect(work).toEqual([expect.objectContaining({ jobId: jobRows[1].id, workOrderId: orders[0].id, quoteId: 25, quoteItemId: 30, approvedAmount: "100", approvedScope: "Repair A" })]);
    expect(db.updateDeficiency).not.toHaveBeenCalled();
    expect(items.map(item => item.approvalStatus)).toEqual(["converted_to_approved_work", "declined"]);
    expect(quote.status).toBe("converted_to_approved_work");
  });

  it("exact retries reuse the repair job, work order and immutable approved snapshots", async () => {
    await caller().approveAllItems({ id: 25 });
    expect(await caller().convertApprovedItemsToApprovedWork({ id: 25 })).toMatchObject({ created: 2, skipped: 0 });
    expect(await caller().convertApprovedItemsToApprovedWork({ id: 25 })).toMatchObject({ created: 0, skipped: 2 });
    expect(jobRows).toHaveLength(2); expect(orders).toHaveLength(1); expect(work).toHaveLength(2);
  });

  it("a finalized execution scope still permits exact artifact receipt retries with canonical JSON key order", async () => {
    await caller().approveAllItems({ id: 25 });
    await caller().convertApprovedItemsToApprovedWork({ id: 25 });
    jobRows[1].finalizedAt = new Date(); orders[0].finalizedAt = new Date();
    orders[0].lineItems = orders[0].lineItems!.map(item => ({ unitPrice: item.unitPrice, qty: item.qty, description: item.description, deficiencyId: item.deficiencyId }));
    vi.mocked(db.updateJob).mockClear();
    expect(await caller().convertApprovedItemsToApprovedWork({ id: 25 })).toMatchObject({ created: 0, skipped: 2 });
    expect(db.updateJob).not.toHaveBeenCalled();
  });

  it("expanding an open partial approval updates only the repair execution scope and creates only the new snapshot", async () => {
    await caller().approveSelectedItems({ id: 25, itemIds: [30] });
    await caller().convertApprovedItemsToApprovedWork({ id: 25 });
    expect(orders[0].total).toBe("100.00");
    await caller().approveSelectedItems({ id: 25, itemIds: [31] });
    expect(await caller().convertApprovedItemsToApprovedWork({ id: 25 })).toMatchObject({ created: 1, skipped: 1 });
    expect(orders[0].total).toBe("150.00");
    expect(jobRows[1].scopeOfWork).toBe("Repair A\nRepair B");
    expect(jobRows[0].title).toBe("Sealed inspection");
  });

  it("a finalized execution job blocks expansion of the approved scope", async () => {
    await caller().approveSelectedItems({ id: 25, itemIds: [30] });
    await caller().convertApprovedItemsToApprovedWork({ id: 25 });
    jobRows[1].finalizedAt = new Date();
    await expect(caller().approveSelectedItems({ id: 25, itemIds: [31] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(items[1].approvalStatus).toBe("pending"); expect(work).toHaveLength(1);
  });

  it("a legacy work order linked to the source inspection fails closed instead of changing its historical scope", async () => {
    quote.status = "approved"; items[0].approvalStatus = "approved";
    orders.push({ id: 98, jobId: 1, quoteId: 25, companyId: 10, siteId: 2, customerOrgId: 3, total: "999.00", finalizedAt: new Date() } as WorkOrder);
    await expect(caller().convertApprovedItemsToApprovedWork({ id: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(orders[0].total).toBe("999.00"); expect(jobRows).toHaveLength(1); expect(work).toHaveLength(0);
  });

  it("a concurrent first conversion detects newly discovered repair ancestors and safely retries", async () => {
    await caller().approveAllItems({ id: 25 });
    const outcomes = await Promise.allSettled([
      caller().convertApprovedItemsToApprovedWork({ id: 25 }), caller().convertApprovedItemsToApprovedWork({ id: 25 }),
    ]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    expect(await caller().convertApprovedItemsToApprovedWork({ id: 25 })).toMatchObject({ created: 0, skipped: 2 });
    expect(jobRows).toHaveLength(2); expect(orders).toHaveLength(1); expect(work).toHaveLength(2);
  });

  it("an artifact failure rolls back the approval, new job, WO and earlier snapshots together", async () => {
    failWork = true;
    await expect(caller().updateStatus({ id: 25, status: "accepted" })).rejects.toThrow("approved work persistence failed");
    expect(quote.status).toBe("sent"); expect(items.map(item => item.approvalStatus)).toEqual(["pending", "pending"]);
    expect(jobRows).toHaveLength(1); expect(orders).toHaveLength(0); expect(work).toHaveLength(0);
  });

  it("cross-company platform operation uses the quote's real company for every artifact", async () => {
    await caller("admin", 99).updateStatus({ id: 25, status: "accepted" });
    expect(jobRows[1].companyId).toBe(10); expect(orders[0].companyId).toBe(10);
    expect(work.map(record => record.companyId)).toEqual([10, 10]);
  });

  it("does not duplicate a legacy aggregate approval with item snapshots", async () => {
    quote.status = "approved";
    items[0].approvalStatus = "approved";
    work.push({ id: 80, quoteId: 25, quoteItemId: null } as ApprovedWork);
    await expect(caller().convertApprovedItemsToApprovedWork({ id: 25 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(jobRows).toHaveLength(1); expect(orders).toHaveLength(0); expect(work).toHaveLength(1);
  });

  it("public customer acceptance atomically creates repair artifacts and repeats safely", async () => {
    const candidate = structuredClone(quote);
    expect(await approveRepairQuoteFromCustomer(candidate, { token: "token" })).toEqual({ success: true, alreadyAccepted: false });
    expect(quote.status).toBe("converted_to_approved_work");
    expect(await approveRepairQuoteFromCustomer(structuredClone(quote), { token: "token" })).toEqual({ success: true, alreadyAccepted: true });
    expect(jobRows).toHaveLength(2); expect(orders).toHaveLength(1); expect(work).toHaveLength(2);
  });

  it("an accepted retry from another approval entry preserves the original approval provenance", async () => {
    await approveRepairQuoteFromCustomer(structuredClone(quote), { token: "token" });
    const acceptedAt = quote.acceptedAt, approvedAt = quote.approvedAt;
    await approveRepairQuoteFromCustomer(structuredClone(quote), { customerOrgId: 3, name: "Later portal user", email: "later@example.test" }, context("customer"));
    expect(quote).toMatchObject({ approvalSource: "email", acceptedAt, approvedAt });
    expect(quote.approvedByName).not.toBe("Later portal user");
  });

  it("customer approval failure never commits an accepted quote without the required artifacts", async () => {
    failWork = true;
    await expect(approveRepairQuoteFromCustomer(structuredClone(quote), { customerOrgId: 3, name: "Customer", email: "customer@example.test" }, context("customer")))
      .rejects.toThrow("approved work persistence failed");
    expect(quote.status).toBe("sent"); expect(jobRows).toHaveLength(1); expect(orders).toHaveLength(0); expect(work).toHaveLength(0);
  });
});
