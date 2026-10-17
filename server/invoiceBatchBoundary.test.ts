import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { activityEvents, emailOutbox, invoicePayments, invoices, type Invoice, type InvoiceLineItem } from "../drizzle/schema";
import * as db from "./db";
import { invoiceRouter } from "./routers/invoiceRouter";
import { generateInvoicePDF } from "./invoicePdfGenerator";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { calculateInvoiceTotals } from "./invoiceIntegrity";
import { logActivity } from "./activityLogger";

vi.mock("./db", () => ({
  withAudit: vi.fn(), getDb: vi.fn(), getInvoiceById: vi.fn(), getLineItemsByInvoice: vi.fn(),
  getInvoiceLineItemById: vi.fn(), updateInvoice: vi.fn(), getCompanySettings: vi.fn(),
  recalculateInvoiceTotals: vi.fn(), createInvoiceLineItem: vi.fn(), updateInvoiceLineItem: vi.fn(), deleteInvoiceLineItem: vi.fn(),
  getCompanyById: vi.fn(), getSiteById: vi.fn(), getCustomerOrgById: vi.fn(), getJobById: vi.fn(),
  getWorkOrderById: vi.fn(), getQuoteById: vi.fn(), getApprovedWorkById: vi.fn(),
}));
vi.mock("./invoicePdfGenerator", () => ({ generateInvoicePDF: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));

type OutboxRow = typeof emailOutbox.$inferSelect;
const dialect = new MySqlDialect();
const apiKey = ENV.resendApiKey;
let records: Map<number, Invoice>;
let lines: Map<number, InvoiceLineItem[]>;
let outbox: OutboxRow[];
let activities: Record<string, unknown>[];
let events: string[];
let activeTx: boolean;
let activityFailure: number | undefined;
let onLock: (id: number) => void;
let hasPaymentReceipt: boolean;
let database: ReturnType<typeof fixtureDatabase>;

function fixtureInvoice(id: number, companyId = 10, amount = "100.00") {
  const inv = { id, companyId, invoiceNumber: `INV-${id}`, status: "draft", sageExportStatus: "pending",
    invoiceDate: new Date("2026-10-16T12:00:00Z"), dueDate: new Date("2026-11-16T12:00:00Z"),
    taxRate: "0.0000", subtotal: amount, taxAmount: "0.00", total: amount, amountPaid: "0.00", balanceDue: amount,
    sageGlCode: "4000", sageDepartment: "HQ", sentAt: null, pdfUrl: null,
  } as Invoice;
  records.set(id, inv);
  lines.set(id, [{ id: id * 10, invoiceId: id, description: `Work ${id}`, quantity: "1.00", unitPrice: amount, total: amount, taxable: false } as InvoiceLineItem]);
  return inv;
}

function fixtureDatabase() {
  return {
    execute: vi.fn(async () => []),
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const params = dialect.sqlToQuery(condition).params;
      const rows = () => {
        if (table === invoices) return records.has(Number(params[0])) ? [{ ...records.get(Number(params[0]))! }] : [];
        if (table === invoicePayments) return hasPaymentReceipt ? [{ id: 1 }] : [];
        if (table === emailOutbox) {
          if (params.length === 1) return outbox.filter(row => row.requestId === params[0]).map(row => ({ ...row }));
          events.push("read:outbox");
          return outbox.filter(row => row.companyId === params[0] && row.entityType === params[1] && row.entityId === params[2] && params.slice(3).includes(row.status));
        }
        throw new Error("Unexpected table");
      };
      return {
        for: async (mode: string) => { expect(mode).toBe("update"); const id = Number(params[0]); events.push(`lock:${id}`); onLock(id); return rows(); },
        limit: async () => rows(),
        then: (resolve: (result: any[]) => unknown) => Promise.resolve(rows()).then(resolve),
      };
    } }) }),
    insert: (table: unknown) => ({ values: async (data: any) => {
      if (table === emailOutbox) {
        if (outbox.some(row => row.requestId === data.requestId)) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
        outbox.push({ ...data, id: outbox.length + 1, status: "sending", providerMessageId: null });
      } else if (table === activityEvents) {
        if (data.entityId === activityFailure) throw new Error("Activity insert failed");
        activities.push(data);
      } else if (table !== invoicePayments) throw new Error("Unexpected insert");
      return [{ insertId: 1 }];
    } }),
    update: (table: unknown) => ({ set: (values: any) => ({ where: async (condition: any) => {
      const params = dialect.sqlToQuery(condition).params;
      if (table === emailOutbox) Object.assign(outbox.find(row => row.id === params[0])!, values);
      else if (table === invoices) Object.assign(records.get(Number(params[0]))!, values);
      else throw new Error("Unexpected update");
      return [{ affectedRows: 1 }];
    } }) }),
  };
}

function caller(role = "office", companyId = 10) {
  return invoiceRouter.createCaller({ user: { id: 1, role, companyId, name: "Office" }, req: { headers: {} }, res: {} } as unknown as TrpcContext);
}

beforeEach(() => {
  vi.resetAllMocks();
  records = new Map(); lines = new Map(); outbox = []; activities = []; events = [];
  activeTx = false; activityFailure = undefined; onLock = () => {}; hasPaymentReceipt = false;
  database = fixtureDatabase();
  ENV.resendApiKey = "fixture-key";
  fixtureInvoice(1); fixtureInvoice(2);
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, fn) => {
    const savedRecords = structuredClone(records);
    const savedActivities = structuredClone(activities);
    activeTx = true;
    try { return await fn(database as any); }
    catch (error) { records = savedRecords; activities = savedActivities; throw error; }
    finally { activeTx = false; }
  });
  vi.mocked(db.getDb).mockResolvedValue(database as any);
  vi.mocked(db.getInvoiceById).mockImplementation(async id => { events.push(`read:invoice:${id}`); return records.has(id) ? { ...records.get(id)! } : undefined; });
  vi.mocked(db.getLineItemsByInvoice).mockImplementation(async id => { events.push(`read:lines:${id}`); return structuredClone(lines.get(id) ?? []); });
  vi.mocked(db.getInvoiceLineItemById).mockImplementation(async id => [...lines.values()].flat().find(row => row.id === id));
  vi.mocked(db.getCompanySettings).mockImplementation(async companyId => { events.push(`read:settings:${companyId}`); return { sageTaxCodeDefault: `TAX-${companyId}` } as any; });
  vi.mocked(db.getCompanyById).mockResolvedValue({ id: 10, name: "Fire & Safety" } as any);
  vi.mocked(db.updateInvoice).mockImplementation(async (id, values) => { expect(activeTx).toBe(true); Object.assign(records.get(id)!, Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))); });
  vi.mocked(db.recalculateInvoiceTotals).mockImplementation(async id => { Object.assign(records.get(id)!, calculateInvoiceTotals(records.get(id)!, lines.get(id)!)); });
  vi.mocked(generateInvoicePDF).mockResolvedValue(Buffer.from("fixture-pdf"));
  vi.mocked(storagePut).mockImplementation(async key => ({ key, url: `https://example.test/${key}` }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "provider-message" }) })));
});
afterEach(() => { ENV.resendApiKey = apiKey; vi.unstubAllGlobals(); });

describe("Sage whole-batch boundary", () => {
  it("locks every invoice in sorted order before settings or child reads, preserving requested CSV order", async () => {
    const result = await caller().exportSage({ ids: [2, 1] });
    expect(events.slice(0, 2)).toEqual(["lock:1", "lock:2"]);
    expect(result.count).toBe(2);
    expect(result.csv.split("\n").slice(1).map(row => row.split(",")[0])).toEqual(["INV-2", "INV-1"]);
    expect([...records.values()].every(row => row.sageExportStatus === "exported")).toBe(true);
    expect(activities).toHaveLength(2);
  });

  it("uses a payment/item change committed while waiting for the last lock", async () => {
    onLock = id => { if (id === 2) { Object.assign(records.get(2)!, { amountPaid: "25.00", balanceDue: "175.00", subtotal: "200.00", total: "200.00", status: "partial" }); Object.assign(lines.get(2)![0], { total: "200.00", unitPrice: "200.00" }); } };
    const result = await caller().exportSage({ ids: [1, 2] });
    expect(result.csv).toContain("Work 2,1.00,200.00,200.00");
    expect(result.csv).toContain(",partial");
    expect(records.get(2)).toMatchObject({ amountPaid: "25.00", balanceDue: "175.00" });
  });

  it.each(["missing", "foreign", "void", "inconsistent", "empty"])("fails the complete batch for a %s invoice", async problem => {
    if (problem === "missing") records.delete(2);
    if (problem === "foreign") records.get(2)!.companyId = 20;
    if (problem === "void") records.get(2)!.status = "void";
    if (problem === "inconsistent") records.get(2)!.total = "50.00";
    if (problem === "empty") lines.set(2, []);
    await expect(caller().exportSage({ ids: [1, 2] })).rejects.toThrow();
    expect(db.updateInvoice).not.toHaveBeenCalled();
    expect(records.get(1)!.sageExportStatus).toBe("pending");
    expect(activities).toEqual([]);
  });

  it.each([[], [1, 1], [0], [1.5]])("rejects an empty/duplicate/invalid selection %j", async ids => {
    await expect(caller().exportSage({ ids })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateInvoice).not.toHaveBeenCalled();
  });

  it("rolls all export flags and activity back if mandatory activity fails", async () => {
    activityFailure = 2;
    await expect(caller().exportSage({ ids: [1, 2] })).rejects.toThrow("Activity insert failed");
    expect(records.get(1)!.sageExportStatus).toBe("pending");
    expect(records.get(2)!.sageExportStatus).toBe("pending");
    expect(activities).toEqual([]);
  });

  it("keeps platform admin access and uses each invoice's real company tax settings and activity owner", async () => {
    records.get(2)!.companyId = 20;
    for (const line of [...lines.values()].flat()) line.taxable = true;
    const result = await caller("admin").exportSage({ ids: [1, 2] });
    expect(result.csv).toContain(",TAX-10,"); expect(result.csv).toContain(",TAX-20,");
    expect(activities.map(row => row.companyId)).toEqual([10, 20]);
  });

  it("re-downloads an existing export without changing its original date or duplicating activity", async () => {
    await caller().exportSage({ ids: [1] });
    const date = records.get(1)!.sageExportedAt;
    await caller().exportSage({ ids: [1] });
    expect(records.get(1)!.sageExportedAt).toEqual(date); expect(activities).toHaveLength(1);
  });

  it("uses line-specific Sage fields and neutralizes spreadsheet formulas", async () => {
    Object.assign(lines.get(1)![0], { description: "=formula, injected", sageGlCode: "4100", sageDepartment: "LINE" });
    const result = await caller().exportSage({ ids: [1] });
    expect(result.csv).toContain('"\'=formula, injected"'); expect(result.csv).toContain(",4100,,LINE,");
  });

  it("manual export has the same total validation and mandatory activity boundary", async () => {
    records.get(1)!.balanceDue = "99.00";
    await expect(caller().markExportedToSage({ id: 1 })).rejects.toThrow(/Reconcile/);
    expect(db.updateInvoice).not.toHaveBeenCalled();
    records.get(1)!.balanceDue = "100.00"; activityFailure = 1;
    await expect(caller().markExportedToSage({ id: 1 })).rejects.toThrow("Activity insert failed");
    expect(records.get(1)!.sageExportStatus).toBe("pending");
  });
});

describe("Invoice current locking reads", () => {
  const operations = [
    ["update", () => caller().update({ id: 1, clientNotes: "note" })],
    ["addLineItem", () => caller().addLineItem({ invoiceId: 1, description: "extra" })],
    ["updateLineItem", () => caller().updateLineItem({ invoiceId: 1, id: 10, description: "changed" })],
    ["removeLineItem", () => caller().removeLineItem({ invoiceId: 1, id: 10 })],
    ["updateStatus", () => caller().updateStatus({ id: 1, status: "void" })],
    ["void", () => caller().void({ id: 1 })],
    ["markReadyForReview", () => caller().markReadyForReview({ id: 1 })],
    ["markReadyForSageExport", () => caller().markReadyForSageExport({ id: 1 })],
    ["markExportedToSage", () => caller().markExportedToSage({ id: 1 })],
    ["markPaid", () => caller().markPaid({ id: 1, requestId: crypto.randomUUID(), amountPaid: 10 })],
  ] as const;

  it.each(operations)("%s locks before its first financial/child read", async (_name, operation) => {
    if (_name === "markReadyForReview") records.get(1)!.status = "sent";
    await operation();
    expect(events[0]).toBe("lock:1");
  });

  it.each(operations)("%s rejects current foreign ownership after the lock", async (_name, operation) => {
    onLock = () => { records.get(1)!.companyId = 20; };
    await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateInvoice).not.toHaveBeenCalled();
  });

  it("rejects stale metadata writes after an accounting export wins the lock", async () => {
    onLock = () => { records.get(1)!.sageExportStatus = "exported"; };
    await expect(caller().update({ id: 1, clientNotes: "late" })).rejects.toThrow(/locked/);
    expect(db.updateInvoice).not.toHaveBeenCalled();
  });

  it.each(["approved", "overdue"] as const)("cannot mark an unpaid %s invoice paid/partial through generic status", async status => {
    records.get(1)!.status = status;
    for (const next of ["paid", "partial"] as const) {
      await expect(caller().updateStatus({ id: 1, status: next })).rejects.toThrow(/payment workflow/);
    }
    expect(db.updateInvoice).not.toHaveBeenCalled();
    expect(records.get(1)).toMatchObject({ amountPaid: "0.00", balanceDue: "100.00", status });
  });

  it.each(["amount", "receipt"])("blocks direct and generic void if received payment %s exists", async evidence => {
    records.get(1)!.status = "partial";
    if (evidence === "amount") records.get(1)!.amountPaid = "25.00";
    else hasPaymentReceipt = true;
    await expect(caller().void({ id: 1 })).rejects.toThrow(/credit or refund/);
    await expect(caller().updateStatus({ id: 1, status: "void" })).rejects.toThrow(/credit or refund/);
    expect(db.updateInvoice).not.toHaveBeenCalled();
  });

  it("logs cross-company admin invoice activity only in the actual invoice company", async () => {
    await caller("admin", 20).void({ id: 1 });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ ctx: expect.objectContaining({ user: expect.objectContaining({ companyId: 10 }) }) }));
  });
});

describe("Invoice send snapshot and receipt recovery", () => {
  function send(requestId = crypto.randomUUID()) { return caller().send({ id: 1, to: ["customer@example.test"], requestId }); }

  it("prepares from locked financial data and reuses an accepted receipt without new PDF/provider work", async () => {
    const requestId = crypto.randomUUID();
    const first = await send(requestId);
    expect(first).toMatchObject({ acceptance: "accepted", messageId: "provider-message" });
    expect(records.get(1)!.status).toBe("sent");
    expect(await send(requestId)).toEqual(first);
    expect(generateInvoicePDF).toHaveBeenCalledTimes(1); expect(storagePut).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": requestId }) }));
  });

  it.each(["approved", "partial", "paid", "void"] as const)("accepted replay preserves a later %s state", async status => {
    const requestId = crypto.randomUUID(); await send(requestId);
    records.get(1)!.status = status;
    expect(await send(requestId)).toMatchObject({ acceptance: "accepted" });
    expect(records.get(1)!.status).toBe(status); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepted receipt recovery preserves an exported draft after the original final status update failed", async () => {
    const requestId = crypto.randomUUID();
    const original = vi.mocked(db.updateInvoice).getMockImplementation()!;
    vi.mocked(db.updateInvoice).mockImplementation(async (id, values) => { if (values.status === "sent") throw new Error("state write failed"); await original(id, values); });
    await expect(send(requestId)).rejects.toThrow("state write failed");
    expect(outbox[0].status).toBe("accepted"); expect(records.get(1)!.status).toBe("draft");
    await expect(caller().update({ id: 1, clientNotes: "change after receipt" })).rejects.toMatchObject({ code: "CONFLICT" });
    records.get(1)!.sageExportStatus = "exported";
    vi.mocked(db.updateInvoice).mockImplementation(original);
    expect(await send(requestId)).toMatchObject({ acceptance: "accepted" });
    expect(records.get(1)!.status).toBe("draft"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { id: "" }, { id: 42 }, null])("invalid acceptance %j locks content and never automatically resends", async body => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => body } as Response);
    const requestId = crypto.randomUUID();
    await expect(send(requestId)).rejects.toThrow(/reconciliation/);
    expect(outbox[0].status).toBe("unknown");
    await expect(caller().addLineItem({ invoiceId: 1, description: "late change" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(send(requestId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a positively rejected provider attempt permits content correction", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(send()).rejects.toThrow(/rejected/);
    expect(outbox[0].status).toBe("rejected");
    await expect(caller().update({ id: 1, clientNotes: "corrected" })).resolves.toEqual({ success: true });
  });

  it("a pending email freezes content while a legitimate partial payment proceeds and keeps its later status", async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      await expect(caller().update({ id: 1, clientNotes: "change during dispatch" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(caller().markPaid({ id: 1, amountPaid: 25, requestId: crypto.randomUUID() }))
        .resolves.toMatchObject({ status: "partial", amountPaid: 25, balanceDue: 75 });
      return { ok: true, json: async () => ({ id: "provider-message" }) } as Response;
    });
    expect(await send()).toMatchObject({ acceptance: "accepted" });
    expect(records.get(1)).toMatchObject({ status: "partial", amountPaid: "25.00", balanceDue: "75.00" });
  });

  it("rejects inconsistent payment balance before rendering or provider dispatch", async () => {
    records.get(1)!.balanceDue = "0.00";
    await expect(send()).rejects.toThrow(/Reconcile/);
    expect(generateInvoicePDF).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects changed recipients under an already accepted operation", async () => {
    const requestId = crypto.randomUUID(); await send(requestId);
    await expect(caller().send({ id: 1, to: ["different@example.test"], requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("missing configuration and foreign ownership never reserve or dispatch a delivery", async () => {
    ENV.resendApiKey = "";
    await expect(send()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    ENV.resendApiKey = "fixture-key"; records.get(1)!.companyId = 20;
    await expect(send()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(outbox).toEqual([]); expect(generateInvoicePDF).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("a concurrent preview never persists stale financial data or overwrites a delivery object", async () => {
    vi.mocked(generateInvoicePDF).mockImplementation(async () => { records.get(1)!.amountPaid = "25.00"; records.get(1)!.balanceDue = "75.00"; return Buffer.from("old-pdf"); });
    await expect(caller().generatePdf({ id: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateInvoice).not.toHaveBeenCalled();
    expect(vi.mocked(storagePut).mock.calls[0][0]).toMatch(/preview-[a-f0-9]{64}\.pdf$/);
  });
});
