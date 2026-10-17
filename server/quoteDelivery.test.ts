import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { emailOutbox, quotes, type Quote } from "../drizzle/schema";
import * as db from "./db";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { quoteRouter } from "./routers/quoteRouter";
import { repairQuoteRouter } from "./routers/repairQuoteRouter";
import { generateQuotePDF, generateRepairQuotePDF } from "./quotePdfGenerator";
import { storagePut } from "./storage";

vi.mock("./db", () => ({
  getDb: vi.fn(), withAudit: vi.fn(), getQuoteById: vi.fn(), updateQuote: vi.fn(),
  getJobById: vi.fn(), getSiteById: vi.fn(), getCustomerOrgById: vi.fn(),
  getCompanyById: vi.fn(), getDeficiencyById: vi.fn(), getRepairQuoteItemsByQuote: vi.fn(),
}));
vi.mock("./quotePdfGenerator", () => ({
  generateQuotePDF: vi.fn(), generateRepairQuotePDF: vi.fn(), generateBuildingQuotePDF: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));

type OutboxRow = typeof emailOutbox.$inferSelect;
const dialect = new MySqlDialect();
let quote: Quote;
let outbox: OutboxRow[];
let failSentUpdate: boolean;
let lockingReads: ReturnType<typeof vi.fn>;
let transaction: ReturnType<typeof vi.fn>;
const originalApiKey = ENV.resendApiKey;
const originalAppUrl = ENV.appUrl;

function fixtureDatabase() {
  const database = {
    insert: (table: unknown) => ({ values: async (values: OutboxRow) => {
      expect(table).toBe(emailOutbox);
      if (outbox.some(row => row.requestId === values.requestId)) {
        throw Object.assign(new Error("duplicate operation"), { code: "ER_DUP_ENTRY" });
      }
      outbox.push({ ...values, id: outbox.length + 1, status: "sending", providerMessageId: null });
    } }),
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const params = dialect.sqlToQuery(condition).params;
      const rows = table === quotes
        ? (params[0] === quote.id && (params[1] === undefined || params[1] === quote.companyId) ? [{ ...quote }] : [])
        : outbox.filter(row => row.requestId === params[0]).map(row => ({ ...row }));
      return {
        limit: async () => rows,
        for: async (lock: string) => { lockingReads(lock); return rows; },
      };
    } }) }),
    update: (table: unknown) => ({ set: (values: Record<string, any>) => ({ where: async (condition: any) => {
      const params = dialect.sqlToQuery(condition).params;
      if (table === emailOutbox) {
        Object.assign(outbox.find(row => row.id === params[0])!, values);
        return [{ affectedRows: 1 }];
      }
      expect(table).toBe(quotes);
      if (values.status === "sent") {
        if (failSentUpdate) { failSentUpdate = false; throw new Error("final sent state update failed"); }
        if (params[0] !== quote.id || params[1] !== quote.companyId || !params.slice(2).includes(quote.status)) {
          return [{ affectedRows: 0 }];
        }
        // Exercise the actual SQL guard and sent-at expression emitted by the route.
        expect(dialect.sqlToQuery(values.sentAt).sql).toBe("COALESCE(`quotes`.`sentAt`, NOW())");
        quote.status = "sent";
        quote.sentAt ??= new Date();
      } else {
        Object.assign(quote, values);
      }
      return [{ affectedRows: 1 }];
    } }) }),
    transaction: undefined as unknown as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
  };
  transaction = vi.fn(async fn => fn(database));
  database.transaction = transaction;
  return database;
}

function context(companyId = 10) {
  return { user: { id: 1, role: "office", companyId }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
}
const workflows = [
  {
    name: "repair quote", quoteType: "repair",
    send: (requestId: string, companyId = 10) => repairQuoteRouter.createCaller(context(companyId)).send({
      id: 25, to: ["customer@example.test"], requestId,
    }),
    pdf: generateRepairQuotePDF,
  },
  {
    name: "generic quote", quoteType: "deficiency",
    send: (requestId: string, companyId = 10) => quoteRouter.createCaller(context(companyId)).send({
      id: 25, customerEmail: "customer@example.test", requestId,
    }),
    pdf: generateQuotePDF,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  ENV.resendApiKey = "fixture-key";
  ENV.appUrl = "https://example.test";
  quote = {
    id: 25, companyId: 10, jobId: 1, siteId: 2, customerOrgId: 3,
    status: "draft", quoteType: "repair", finalizedAt: new Date("2026-01-01"),
    lineItems: [], total: "112.00", subtotal: "100.00", gst: "5.00", pst: "7.00", createdAt: new Date("2026-01-01"),
    pdfUrl: null, acceptToken: null, acceptTokenExpiresAt: null, sentAt: null,
  } as Quote;
  outbox = [];
  failSentUpdate = false;
  lockingReads = vi.fn();
  vi.mocked(db.getDb).mockResolvedValue(fixtureDatabase() as any);
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, fn) => {
    const database = (await db.getDb())!;
    return database.transaction(fn as any) as any;
  });
  vi.mocked(db.getQuoteById).mockImplementation(async () => ({ ...quote }));
  vi.mocked(db.updateQuote).mockImplementation(async (_id, values) => { Object.assign(quote, values); });
  vi.mocked(db.getRepairQuoteItemsByQuote).mockResolvedValue([{
    id: 30, quoteId: 25, description: "Sealed item", partTotal: "100.00", labourTotal: "0.00",
    fuelCharge: "0.00", backflowReportFee: "0.00", gst: "5.00", pst: "7.00", total: "112.00",
  } as any]);
  vi.mocked(generateQuotePDF).mockResolvedValue(Buffer.from("generic quote fixture"));
  vi.mocked(generateRepairQuotePDF).mockResolvedValue(Buffer.from("repair quote fixture"));
  vi.mocked(storagePut).mockResolvedValue({ key: "quote.pdf", url: "https://example.test/quote.pdf" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "provider-message" }) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  ENV.resendApiKey = originalApiKey;
  ENV.appUrl = originalAppUrl;
});

describe.each(workflows)("$name explicit delivery", workflow => {
  beforeEach(() => {
    quote.quoteType = workflow.quoteType;
    if (workflow.quoteType !== "repair") quote.finalizedAt = null;
  });

  it("rejects missing provider configuration before PDF, storage, reservation, or status changes", async () => {
    ENV.resendApiKey = "";
    await expect(workflow.send(crypto.randomUUID())).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(workflow.pdf).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(db.updateQuote).not.toHaveBeenCalled();
    expect(outbox).toEqual([]);
    expect(quote.status).toBe("draft");
  });

  it.each([401, 403, 429, 500])("HTTP %s never marks sent and cannot automatically resend", async status => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status } as Response);
    const requestId = crypto.randomUUID();
    await expect(workflow.send(requestId)).rejects.toThrow();
    expect(quote.status).toBe("draft");
    expect(quote.sentAt).toBeNull();
    expect(outbox[0].status).toBe(status === 500 ? "unknown" : "rejected");
    await expect(workflow.send(requestId)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(workflow.pdf).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { id: "" }, { id: "   " }, { id: 42 }, { id: { unexpected: true } }, null])(
    "a successful HTTP response with invalid message ID %j needs reconciliation", async body => {
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => body } as Response);
      const requestId = crypto.randomUUID();
      await expect(workflow.send(requestId)).rejects.toThrow(/reconciliation/);
      expect(quote.status).toBe("draft");
      expect(outbox[0].status).toBe("unknown");
      await expect(workflow.send(requestId)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it("network ambiguity prevents status success and provider replay", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network disconnected"));
    const requestId = crypto.randomUUID();
    await expect(workflow.send(requestId)).rejects.toThrow("network disconnected");
    await expect(workflow.send(requestId)).rejects.toThrow(/reconciliation/);
    expect(outbox[0].status).toBe("unknown");
    expect(quote.status).toBe("draft");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends one provider request with its stable operation ID and reuses the accepted receipt", async () => {
    const requestId = crypto.randomUUID();
    const result = await workflow.send(requestId);
    expect(result).toMatchObject({ acceptance: "accepted", messageId: "provider-message", pdfUrl: "https://example.test/quote.pdf" });
    expect(quote.status).toBe("sent");
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      headers: expect.objectContaining({ "Idempotency-Key": requestId }),
    }));
    expect(await workflow.send(requestId)).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(workflow.pdf).toHaveBeenCalledTimes(1);
    expect(storagePut).toHaveBeenCalledTimes(1);
  });

  it("recovers application-state failure after provider acceptance without new email, PDF, or token", async () => {
    failSentUpdate = true;
    const requestId = crypto.randomUUID();
    await expect(workflow.send(requestId)).rejects.toThrow("final sent state update failed");
    const token = quote.acceptToken;
    expect(outbox[0].status).toBe("accepted");
    expect(quote.status).toBe("draft");
    expect(await workflow.send(requestId)).toMatchObject({ acceptance: "accepted", messageId: "provider-message" });
    expect(quote.status).toBe("sent");
    expect(quote.acceptToken).toBe(token);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(workflow.pdf).toHaveBeenCalledTimes(1);
    expect(storagePut).toHaveBeenCalledTimes(1);
  });

  it("an accepted retry preserves a later customer decision", async () => {
    const requestId = crypto.randomUUID();
    await workflow.send(requestId);
    quote.status = "accepted";
    expect(await workflow.send(requestId)).toMatchObject({ acceptance: "accepted" });
    expect(quote.status).toBe("accepted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cannot return another tenant's accepted receipt", async () => {
    const requestId = crypto.randomUUID();
    await workflow.send(requestId);
    await expect(workflow.send(requestId, 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("generic delivery seals draft content before provider work and through a failed final status update", async () => {
  quote.quoteType = "deficiency";
  quote.finalizedAt = null;
  failSentUpdate = true;
  vi.mocked(fetch).mockImplementation(async () => {
    expect(quote.finalizedAt).toBeInstanceOf(Date);
    await expect(quoteRouter.createCaller(context()).update({ id: 25, notes: "edit during send" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    return { ok: true, json: async () => ({ id: "provider-message" }) } as Response;
  });
  const requestId = crypto.randomUUID();
  await expect(workflows[1].send(requestId)).rejects.toThrow("final sent state update failed");
  expect(quote.status).toBe("draft");
  expect(outbox[0].status).toBe("accepted");
  await expect(quoteRouter.createCaller(context()).update({ id: 25, notes: "edit after acceptance" }))
    .rejects.toMatchObject({ code: "CONFLICT" });
  expect(await workflows[1].send(requestId)).toMatchObject({ acceptance: "accepted" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("generic quote reuses its live acceptance token for a new explicit send", async () => {
  quote.quoteType = "deficiency";
  quote.status = "sent";
  quote.acceptToken = "existing-acceptance-token";
  quote.acceptTokenExpiresAt = new Date(Date.now() + 60_000);
  await workflows[1].send(crypto.randomUUID());
  expect(quote.acceptToken).toBe("existing-acceptance-token");
  expect(lockingReads).toHaveBeenCalledWith("update");
  expect(transaction).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(body.html).toContain("existing-acceptance-token");
});

it("repair delivery rejects a non-repair quote before recording any delivery attempt", async () => {
  quote.quoteType = "building";
  await expect(workflows[0].send(crypto.randomUUID())).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(outbox).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
