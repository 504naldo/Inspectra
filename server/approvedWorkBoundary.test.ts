import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { approvedWork, jobs, quotes, workOrders, type ApprovedWork, type Invoice, type InvoiceLineItem, type Job, type Quote, type RepairQuoteItem, type WorkOrder } from "../drizzle/schema";
import * as db from "./db";
import { approvedWorkRouter } from "./routers/approvedWorkRouter";
import type { TrpcContext } from "./_core/context";
import { logActivity } from "./activityLogger";

vi.mock("./db", () => ({
  withAudit: vi.fn(), getApprovedWorkById: vi.fn(), getApprovedWorkByQuoteItem: vi.fn(), getApprovedWorkByCompany: vi.fn(),
  getJobById: vi.fn(), getQuoteById: vi.fn(), getWorkOrderById: vi.fn(), getWorkOrderByJob: vi.fn(),
  getRepairQuoteItemById: vi.fn(), getRepairQuoteItemsByQuote: vi.fn(), getDeficiencyById: vi.fn(),
  getSiteById: vi.fn(), getCustomerOrgById: vi.fn(), getUserById: vi.fn(), getCompanySettings: vi.fn(),
  getInvoiceByApprovedWork: vi.fn(), createInvoice: vi.fn(), createInvoiceLineItem: vi.fn(), recalculateInvoiceTotals: vi.fn(),
  createApprovedWork: vi.fn(), updateApprovedWork: vi.fn(), createWorkOrder: vi.fn(),
}));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));

const dialect = new MySqlDialect();
let records: Map<number, ApprovedWork>;
let jobRecords: Map<number, Job>;
let quoteRecords: Map<number, Quote>;
let orderRecords: Map<number, WorkOrder>;
let itemRecords: Map<number, RepairQuoteItem>;
let invoiceRecords: Invoice[];
let lineRecords: InvoiceLineItem[];
let transactionEvents: string[];
let inTransaction: boolean;
let transactionTail: Promise<void>;
let onLock: (table: unknown, id: number) => void;
let conversionFailure: boolean;

function context(role = "office", companyId = 10) {
  return { user: { id: 1, role, companyId }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
}
const caller = (role = "office", companyId = 10) => approvedWorkRouter.createCaller(context(role, companyId));
function row<T>(map: Map<number, T>, id: number) { if (inTransaction) transactionEvents.push(`read:${id}`); return map.has(id) ? { ...map.get(id)! } : undefined; }

function linkQuote() {
  Object.assign(records.get(1)!, { jobId: 40, quoteId: 50, quoteItemId: 60 });
}

beforeEach(() => {
  vi.resetAllMocks();
  inTransaction = false; transactionTail = Promise.resolve(); transactionEvents = []; onLock = () => {}; conversionFailure = false;
  records = new Map([[1, { id: 1, companyId: 10, type: "repair_order", status: "approved", customerOrgId: 30, siteId: 20,
    jobId: null, quoteId: null, quoteItemId: null, workOrderId: null, deficiencyId: null, approvedAmount: "125.00",
    approvedScope: "Original approved scope", invoiceNumber: null, assignedTechnicianIds: [] } as ApprovedWork]]);
  jobRecords = new Map([[40, { id: 40, companyId: 10, siteId: 20, customerOrgId: 30, finalizedAt: null, jobType: "inspection" } as Job]]);
  quoteRecords = new Map([[50, { id: 50, companyId: 10, siteId: 20, customerOrgId: 30, jobId: 40, quoteType: "repair",
    status: "approved", finalizedAt: new Date(), total: "999.00" } as Quote]]);
  itemRecords = new Map([[60, { id: 60, quoteId: 50, description: "Item approved once", total: "125.00", approvalStatus: "approved", deficiencyId: null } as RepairQuoteItem]]);
  orderRecords = new Map(); invoiceRecords = []; lineRecords = [];
  const transaction = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => ({
      for: async (mode: string) => {
        expect(mode).toBe("update");
        const id = Number(dialect.sqlToQuery(condition).params[0]);
        const maps = [[jobs, jobRecords, "job"], [quotes, quoteRecords, "quote"], [workOrders, orderRecords, "order"], [approvedWork, records, "approvedWork"]] as const;
        const entry = maps.find(entry => entry[0] === table)!;
        transactionEvents.push(`lock:${entry[2]}:${id}`); onLock(table, id);
        const record = entry[1].get(id); return record ? [{ ...record }] : [];
      },
      then: (resolve: (rows: any[]) => unknown) => {
        expect(table).toBe(approvedWork);
        const quoteId = Number(dialect.sqlToQuery(condition).params[0]);
        return Promise.resolve([...records.values()].filter(record => record.quoteId === quoteId).map(record => ({ ...record }))).then(resolve);
      },
    }) }) }),
    update: () => ({ set: (data: any) => ({ where: async (condition: any) => {
      if (conversionFailure) throw new Error("item conversion failed");
      const [id, quoteId] = dialect.sqlToQuery(condition).params;
      const item = itemRecords.get(Number(id));
      if (item?.quoteId === quoteId) Object.assign(item, data);
      return [{ affectedRows: item ? 1 : 0 }];
    } }) }),
  };
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, write) => {
    const previous = transactionTail; let release!: () => void;
    transactionTail = new Promise(resolve => { release = resolve; }); await previous;
    const saved = structuredClone({ records, orderRecords, itemRecords, invoiceRecords, lineRecords });
    inTransaction = true;
    try { return await write(transaction as any); }
    catch (error) { ({ records, orderRecords, itemRecords, invoiceRecords, lineRecords } = saved); throw error; }
    finally { inTransaction = false; release(); }
  });
  vi.mocked(db.getApprovedWorkById).mockImplementation(async id => row(records, id));
  vi.mocked(db.getJobById).mockImplementation(async id => row(jobRecords, id));
  vi.mocked(db.getQuoteById).mockImplementation(async id => row(quoteRecords, id));
  vi.mocked(db.getWorkOrderById).mockImplementation(async id => row(orderRecords, id));
  vi.mocked(db.getWorkOrderByJob).mockImplementation(async id => [...orderRecords.values()].find(order => order.jobId === id));
  vi.mocked(db.getRepairQuoteItemById).mockImplementation(async id => row(itemRecords, id));
  vi.mocked(db.getApprovedWorkByQuoteItem).mockImplementation(async id => [...records.values()].find(record => record.quoteItemId === id));
  vi.mocked(db.getApprovedWorkByCompany).mockImplementation(async companyId => [...records.values()].filter(record => record.companyId === companyId));
  vi.mocked(db.getSiteById).mockResolvedValue({ id: 20, companyId: 10, customerOrgId: 30, name: "Site" } as any);
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 30, companyId: 10, name: "Customer" } as any);
  vi.mocked(db.getCompanySettings).mockResolvedValue({ invoiceDueDays: 30, invoiceNumberPrefix: "INV", gstRate: "0.0500" } as any);
  vi.mocked(db.getInvoiceByApprovedWork).mockImplementation(async id => invoiceRecords.find(invoice => invoice.approvedWorkId === id));
  vi.mocked(db.createInvoice).mockImplementation(async data => { expect(inTransaction).toBe(true); const invoice = { ...data, id: invoiceRecords.length + 100 } as Invoice; invoiceRecords.push(invoice); return invoice; });
  vi.mocked(db.createInvoiceLineItem).mockImplementation(async data => { expect(inTransaction).toBe(true); const item = { ...data, id: lineRecords.length + 100 } as InvoiceLineItem; lineRecords.push(item); return item; });
  vi.mocked(db.createWorkOrder).mockImplementation(async data => { expect(inTransaction).toBe(true); const order = { ...data, id: orderRecords.size + 70 } as WorkOrder; orderRecords.set(order.id, order); return order; });
  vi.mocked(db.createApprovedWork).mockImplementation(async data => { expect(inTransaction).toBe(true); const record = { ...data, id: records.size + 1 } as ApprovedWork; records.set(record.id, record); return record; });
  vi.mocked(db.updateApprovedWork).mockImplementation(async (id, data) => { expect(inTransaction).toBe(true); Object.assign(records.get(id)!, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); });
});

describe("Approved work financial snapshot", () => {
  it("invoices only the selected approval snapshot, even if its quote contains other or changed items", async () => {
    linkQuote();
    itemRecords.get(60)!.total = "250.00";
    const result = await caller().createInvoice({ id: 1 });
    expect(result.invoiceId).toBe(100);
    expect(lineRecords).toHaveLength(1);
    expect(lineRecords[0]).toMatchObject({ description: "Original approved scope", unitPrice: "125.00", total: "125.00", taxable: false });
    expect(db.getRepairQuoteItemsByQuote).not.toHaveBeenCalled();
    expect(transactionEvents.slice(0, 3)).toEqual(["lock:job:40", "lock:quote:50", "lock:approvedWork:1"]);
    expect(records.get(1)).toMatchObject({ status: "invoiced", invoiceStatus: "draft" });
  });

  it("serializes two attempts into exactly one invoice", async () => {
    const outcomes = await Promise.allSettled([caller().createInvoice({ id: 1 }), caller().createInvoice({ id: 1 })]);
    expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(outcomes).toEqual([expect.objectContaining({ value: expect.objectContaining({ invoiceId: 100 }) }), expect.objectContaining({ value: expect.objectContaining({ invoiceId: 100 }) })]);
    expect(invoiceRecords).toHaveLength(1); expect(lineRecords).toHaveLength(1);
  });

  it("rolls back invoice header and approval tracking if its snapshot insert fails", async () => {
    vi.mocked(db.createInvoiceLineItem).mockRejectedValue(new Error("line insert failed"));
    await expect(caller().createInvoice({ id: 1 })).rejects.toThrow("line insert failed");
    expect(invoiceRecords).toEqual([]); expect(records.get(1)!.invoiceNumber).toBeNull(); expect(records.get(1)!.status).toBe("approved");
  });

  it.each([null, "NaN", "-1.00", "1.001"])("requires recorded approved cents rather than inventing amount %s", async approvedAmount => {
    records.get(1)!.approvedAmount = approvedAmount;
    await expect(caller().createInvoice({ id: 1 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.createInvoice).not.toHaveBeenCalled();
  });

  it("freezes invoiced approval amounts and source quotation snapshots", async () => {
    await caller().createInvoice({ id: 1 });
    await expect(caller().update({ id: 1, approvedAmount: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    records.get(1)!.invoiceNumber = null; invoiceRecords = []; linkQuote();
    await expect(caller().update({ id: 1, approvedScope: "replace approval" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not allow generic metadata patches to replace invoice tracking", async () => {
    await expect(caller().update({ id: 1, invoiceNumber: "FAKE" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().updateStatus({ id: 1, status: "invoiced" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });
});

describe("Approved work source binding and authorization", () => {
  it("validates the actual quote item parent even for platform admins", async () => {
    itemRecords.get(60)!.quoteId = 999;
    for (const role of ["office", "admin"]) {
      await expect(caller(role).createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(db.createApprovedWork).not.toHaveBeenCalled();
  });

  it.each(["pending", "declined"])("does not turn a %s quote item into approved work", async approvalStatus => {
    itemRecords.get(60)!.approvalStatus = approvalStatus as any;
    await expect(caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createApprovedWork).not.toHaveBeenCalled();
  });

  it("creates an approval with real parent job/scope/amount under the source quote lock", async () => {
    const record = await caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 });
    expect(record).toMatchObject({ jobId: 40, quoteId: 50, quoteItemId: 60, companyId: 10, approvedScope: "Item approved once", approvedAmount: "125.00" });
    expect(transactionEvents.slice(0, 2)).toEqual(["lock:job:40", "lock:quote:50"]);
    expect(itemRecords.get(60)!.approvalStatus).toBe("converted_to_approved_work");
    await expect(caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not mix aggregate and per-item approvals for the same quote", async () => {
    records.get(1)!.quoteId = 50; records.get(1)!.jobId = 40;
    await expect(caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toMatchObject({ code: "CONFLICT" });
    records.get(1)!.quoteItemId = 60;
    await expect(caller().create({ companyId: 10, quoteId: 50, type: "repair_order" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.createApprovedWork).not.toHaveBeenCalled();
  });

  it("rolls approval creation and item conversion back together", async () => {
    conversionFailure = true;
    await expect(caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toThrow("item conversion failed");
    expect(records.size).toBe(1); expect(itemRecords.get(60)!.approvalStatus).toBe("approved");
  });

  it("does not link a different job's work order even when company/site/customer all match", async () => {
    records.get(1)!.jobId = 40;
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41 });
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 41, siteId: 20, customerOrgId: 30 } as WorkOrder);
    await expect(caller("admin").linkWorkOrder({ id: 1, workOrderId: 70 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("rejects inactive and foreign technicians before assignment", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 99, companyId: 10, role: "technician", isActive: 0 } as any);
    await expect(caller().update({ id: 1, assignedTechnicianIds: [99] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.mocked(db.getUserById).mockResolvedValue({ id: 99, companyId: 20, role: "technician", isActive: 1 } as any);
    await expect(caller("admin").update({ id: 1, assignedTechnicianIds: [99] })).rejects.toThrow();
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("rejects a source item's foreign deficiency before writing an approval", async () => {
    itemRecords.get(60)!.deficiencyId = 90;
    vi.mocked(db.getDeficiencyById).mockResolvedValue({ id: 90, jobId: 41 } as any);
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41, companyId: 20 });
    await expect(caller().createFromQuoteItem({ quoteId: 50, quoteItemId: 60 })).rejects.toThrow();
    expect(db.createApprovedWork).not.toHaveBeenCalled();
  });

  it("rejects cross-company destination links for manual creation and update, including admin", async () => {
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 20, companyId: 20, customerOrgId: 30 } as any);
    await expect(caller("admin").create({ companyId: 10, siteId: 20, type: "repair_order" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("admin").update({ id: 1, siteId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createApprovedWork).not.toHaveBeenCalled(); expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("retains platform admin ownership access but denies ordinary cross-company access", async () => {
    await expect(caller("office", 20).createInvoice({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await caller("admin", 20).createInvoice({ id: 1 })).toMatchObject({ invoiceId: 100 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ ctx: expect.objectContaining({ user: expect.objectContaining({ companyId: 10 }) }) }));
  });

  it("customers cannot read staff-only approval details", async () => {
    await expect(caller("customer").get({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getApprovedWorkById).not.toHaveBeenCalled();
  });
});

describe("Approved work seal and downstream atomicity", () => {
  const writes = [
    ["update", () => caller().update({ id: 1, officeNotes: "late" })],
    ["status", () => caller().updateStatus({ id: 1, status: "completed" })],
    ["createWorkOrder", () => caller().createWorkOrder({ id: 1, title: "Repair" })],
  ] as const;

  it.each(writes)("%s fails when finalization wins the first parent lock", async (_name, write) => {
    records.get(1)!.jobId = 40;
    onLock = table => { if (table === jobs) jobRecords.get(40)!.finalizedAt = new Date(); };
    await expect(write()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transactionEvents[0]).toBe("lock:job:40"); expect(db.updateApprovedWork).not.toHaveBeenCalled(); expect(db.createInvoice).not.toHaveBeenCalled();
  });

  it("rejects parent drift rather than locking an undeclared job after a snapshot read", async () => {
    records.get(1)!.jobId = 40;
    onLock = table => { if (table === approvedWork) records.get(1)!.jobId = 41; };
    await expect(caller().update({ id: 1, officeNotes: "stale" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("creates and links a work order together, preventing a simultaneous duplicate", async () => {
    records.get(1)!.jobId = 40;
    const results = await Promise.allSettled([caller().createWorkOrder({ id: 1, title: "Repair" }), caller().createWorkOrder({ id: 1, title: "Repair" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(orderRecords.size).toBe(1); expect(records.get(1)!.workOrderId).toBe(70);
  });

  it("reuses the job's existing work order without duplicating its execution record", async () => {
    records.get(1)!.jobId = 40;
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 40, siteId: 20, customerOrgId: 30 } as WorkOrder);
    expect(await caller().createWorkOrder({ id: 1, title: "Repair" })).toMatchObject({ id: 70 });
    expect(db.createWorkOrder).not.toHaveBeenCalled(); expect(records.get(1)!.workOrderId).toBe(70);
  });

  it("does not add new execution links to an already finalized work order", async () => {
    records.get(1)!.jobId = 40;
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 40, siteId: 20, customerOrgId: 30, finalizedAt: new Date() } as WorkOrder);
    await expect(caller().createWorkOrder({ id: 1, title: "Repair" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("keeps a sealed inspection as provenance while a real linked repair job owns execution", async () => {
    linkQuote(); jobRecords.get(40)!.finalizedAt = new Date();
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41, finalizedAt: null, jobType: "repair" });
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 41, siteId: 20, customerOrgId: 30, quoteId: 50 } as WorkOrder);
    Object.assign(records.get(1)!, { jobId: 41, workOrderId: 70 });
    expect(await caller().createInvoice({ id: 1 })).toMatchObject({ invoiceId: 100 });
    expect(transactionEvents.slice(0, 2)).toEqual(["lock:job:40", "lock:job:41"]);
    expect(invoiceRecords[0]).toMatchObject({ jobId: 41, workOrderId: 70, quoteId: 50 });
  });

  it("denies unrelated provenance and keeps sealed execution scope immutable", async () => {
    linkQuote(); jobRecords.get(40)!.finalizedAt = new Date();
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41, finalizedAt: null, jobType: "inspection" });
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 41, siteId: 20, customerOrgId: 30, quoteId: 50 } as WorkOrder);
    Object.assign(records.get(1)!, { jobId: 41, workOrderId: 70 });
    await expect(caller().createInvoice({ id: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    jobRecords.get(41)!.jobType = "repair"; jobRecords.get(41)!.finalizedAt = new Date();
    await expect(caller().update({ id: 1, approvedScope: "late change" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateApprovedWork).not.toHaveBeenCalled();
  });

  it("bills, tracks, closes and replays one exact approval after execution is sealed without changing execution evidence", async () => {
    records.get(1)!.jobId = 40; records.get(1)!.workOrderId = 70;
    jobRecords.get(40)!.finalizedAt = new Date();
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 40, siteId: 20, customerOrgId: 30, finalizedAt: new Date() } as WorkOrder);
    const executionBefore = structuredClone({ job: jobRecords.get(40), order: orderRecords.get(70) });
    const created = await caller().createInvoice({ id: 1 });
    await expect(caller().markInvoiced({ id: 1, invoiceNumber: created.invoiceNumber })).resolves.toEqual({ success: true });
    await expect(caller().close({ id: 1 })).resolves.toEqual({ success: true });
    await expect(caller().close({ id: 1 })).resolves.toEqual({ success: true });
    expect(await caller().createInvoice({ id: 1 })).toEqual(created);
    expect(invoiceRecords).toHaveLength(1); expect(lineRecords).toHaveLength(1);
    expect(records.get(1)).toMatchObject({ approvedScope: "Original approved scope", approvedAmount: "125.00", status: "closed" });
    expect({ job: jobRecords.get(40), order: orderRecords.get(70) }).toEqual(executionBefore);
    await expect(caller().update({ id: 1, approvedAmount: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts a building quote's explicit origin sentinel only through a proven annual job/work order chain", async () => {
    Object.assign(quoteRecords.get(50)!, { quoteType: "building", jobId: 0 });
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41, finalizedAt: null, jobType: "annual" });
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 41, siteId: 20, customerOrgId: 30, quoteId: 50 } as WorkOrder);
    Object.assign(records.get(1)!, { jobId: 41, workOrderId: 70, quoteId: 50 });
    expect(await caller().createInvoice({ id: 1 })).toMatchObject({ invoiceId: 100 });
    expect(transactionEvents[0]).toBe("lock:job:41");
    expect(transactionEvents).not.toContain("lock:job:0");
  });

  it("never treats a missing non-building source job as an authorized origin sentinel", async () => {
    Object.assign(quoteRecords.get(50)!, { quoteType: "deficiency", jobId: 0 });
    jobRecords.set(41, { ...jobRecords.get(40)!, id: 41, finalizedAt: null, jobType: "repair" });
    orderRecords.set(70, { id: 70, companyId: 10, jobId: 41, siteId: 20, customerOrgId: 30, quoteId: 50 } as WorkOrder);
    Object.assign(records.get(1)!, { jobId: 41, workOrderId: 70, quoteId: 50 });
    await expect(caller().createInvoice({ id: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.createInvoice).not.toHaveBeenCalled();
  });
});
