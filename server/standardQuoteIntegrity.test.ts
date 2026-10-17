import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  emailOutbox,
  quotes,
  jobs,
  workOrders,
  approvedWork,
  type Quote,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { quoteRouter } from "./routers/quoteRouter";
import { generateBuildingQuotePDF } from "./quotePdfGenerator";
import { storagePut } from "./storage";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  withAudit: vi.fn(),
  getQuoteById: vi.fn(),
  getQuoteByToken: vi.fn(),
  getJobById: vi.fn(),
  getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getDeficiencyById: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  getCompanyById: vi.fn(),
  getApprovedWorkByQuote: vi.fn(),
  createApprovedWork: vi.fn(),
  getWorkOrderByJob: vi.fn(),
  createJob: vi.fn(),
  createWorkOrder: vi.fn(),
  getInvoiceByApprovedWork: vi.fn(),
}));
vi.mock("./emailService", () => ({ sendQuoteApprovedNotification: vi.fn() }));
vi.mock("./quotePdfGenerator", () => ({
  generateQuotePDF: vi.fn(),
  generateRepairQuotePDF: vi.fn(),
  generateBuildingQuotePDF: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

const dialect = new MySqlDialect();
let quote: Quote;
let executionJobs: Map<number, any>;
let executionOrders: any[];
let executionApprovals: any[];
let attempts: Array<{ status: string; providerMessageId?: unknown }>;
let writes: Array<Record<string, unknown>>;
let reads: string[];
let transaction: ReturnType<typeof vi.fn>;
let database: ReturnType<typeof fixtureDatabase>;
let pauseAfterLock: (() => Promise<void>) | undefined;

function fixtureDatabase() {
  let tail = Promise.resolve();
  const buildTx = (lock: () => Promise<void>) => ({
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: any) => {
          const params = dialect.sqlToQuery(condition).params;
          const rows = () => {
            reads.push(table === quotes ? "quote read" : "attempt read");
            if (table === quotes)
              return params[0] === quote.id ? [{ ...quote }] : [];
            if (table === jobs)
              return executionJobs.has(Number(params[0]))
                ? [{ ...executionJobs.get(Number(params[0])) }]
                : [];
            if (table === workOrders)
              return executionOrders
                .filter(order => order.quoteId === params[0])
                .map(order => ({ ...order }));
            if (table === approvedWork)
              return executionApprovals
                .filter(record => record.quoteId === params[0])
                .map(record => ({ ...record }));
            expect(table).toBe(emailOutbox);
            expect(params.slice(0, 3)).toEqual([
              "quote",
              quote.id,
              quote.companyId,
            ]);
            return attempts.filter(attempt =>
              params.slice(3).includes(attempt.status)
            );
          };
          return {
            for: async (mode: string) => {
              expect(mode).toBe("update");
              await lock();
              reads.push("quote lock");
              const current = rows();
              await pauseAfterLock?.();
              return current;
            },
            limit: async () => rows().slice(0, 1),
            then: (
              resolve: (value: unknown) => unknown,
              reject: (error: unknown) => unknown
            ) => Promise.resolve(rows()).then(resolve, reject),
          };
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: any) => {
          if (table === approvedWork) {
            const id = dialect.sqlToQuery(condition).params[0];
            Object.assign(
              executionApprovals.find(record => record.id === id),
              values
            );
            return [{ affectedRows: 1 }];
          }
          expect(table).toBe(quotes);
          expect(dialect.sqlToQuery(condition).params[0]).toBe(quote.id);
          writes.push(values);
          Object.assign(quote, values);
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  });
  const database = {
    ...buildTx(async () => {}),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      let snapshot:
        | {
            quote: Quote;
            executionJobs: Map<number, any>;
            executionOrders: any[];
            executionApprovals: any[];
            writes: number;
          }
        | undefined;
      const tx = buildTx(async () => {
        if (release) return;
        const previous = tail;
        tail = new Promise<void>(resolve => {
          release = resolve;
        });
        await previous;
        snapshot = {
          quote: structuredClone(quote),
          executionJobs: structuredClone(executionJobs),
          executionOrders: structuredClone(executionOrders),
          executionApprovals: structuredClone(executionApprovals),
          writes: writes.length,
        };
      });
      try {
        return await fn(tx);
      } catch (error) {
        if (snapshot) {
          quote = snapshot.quote;
          executionJobs = snapshot.executionJobs;
          executionOrders = snapshot.executionOrders;
          executionApprovals = snapshot.executionApprovals;
          writes.length = snapshot.writes;
        }
        throw error;
      } finally {
        release?.();
      }
    }),
  };
  transaction = database.transaction;
  return database;
}

function context(
  role = "office",
  customerOrgId: number | null = 3
): TrpcContext {
  return {
    user: { id: 1, role, companyId: 10, customerOrgId },
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext;
}
const caller = () => quoteRouter.createCaller(context());
const customer = (org = 3) =>
  quoteRouter.createCaller(context("customer", org));
const publicCaller = () =>
  quoteRouter.createCaller({
    req: { headers: {} },
    res: {},
    user: null,
  } as unknown as TrpcContext);

beforeEach(() => {
  vi.resetAllMocks();
  quote = {
    id: 25,
    jobId: 1,
    siteId: 2,
    customerOrgId: 3,
    companyId: 10,
    quoteType: "deficiency",
    status: "draft",
    finalizedAt: null,
    sentAt: null,
    acceptedAt: null,
    approvedAt: null,
    total: "100.00",
    discount: "0.00",
    lineItems: [
      {
        deficiencyId: null,
        description: "Original scope",
        unitPrice: 100,
        qty: 1,
      },
    ],
    acceptToken: "valid-token",
    acceptTokenExpiresAt: new Date(Date.now() + 60_000),
  } as Quote;
  executionJobs = new Map([
    [
      1,
      {
        id: 1,
        companyId: 10,
        siteId: 2,
        customerOrgId: 3,
        jobType: "annual",
        finalizedAt: new Date(),
        title: "Original inspection",
      },
    ],
  ]);
  executionOrders = [];
  executionApprovals = [];
  attempts = [];
  writes = [];
  reads = [];
  pauseAfterLock = undefined;
  database = fixtureDatabase();
  vi.mocked(db.getDb).mockResolvedValue(database as any);
  vi.mocked(db.withAudit).mockImplementation(
    async (_ctx, _name, fn) => database.transaction(fn as any) as any
  );
  vi.mocked(db.getQuoteById).mockImplementation(async () => ({ ...quote }));
  vi.mocked(db.getQuoteByToken).mockImplementation(async () => ({ ...quote }));
  vi.mocked(db.getSiteById).mockImplementation(
    async () => ({ id: 2, companyId: 10, customerOrgId: 3 }) as any
  );
  vi.mocked(db.getCustomerOrgById).mockImplementation(
    async () => ({ id: 3, companyId: 10 }) as any
  );
  vi.mocked(db.getApprovedWorkByQuote).mockResolvedValue(undefined);
  vi.mocked(db.getJobById).mockImplementation(async id =>
    executionJobs.get(id)
  );
  vi.mocked(db.createJob).mockImplementation(async data => {
    const created = { ...data, id: 60 + executionJobs.size };
    executionJobs.set(created.id, created);
    return created as any;
  });
  vi.mocked(db.createWorkOrder).mockImplementation(async data => {
    const created = { ...data, id: 70 + executionOrders.length };
    executionOrders.push(created);
    return created as any;
  });
  vi.mocked(db.createApprovedWork).mockImplementation(async data => {
    const created = { ...data, id: 90 + executionApprovals.length };
    executionApprovals.push(created);
    return created as any;
  });
  vi.mocked(generateBuildingQuotePDF).mockResolvedValue(
    Buffer.from("building quote fixture")
  );
  vi.mocked(storagePut).mockResolvedValue({
    key: "building.pdf",
    url: "https://example.test/building.pdf",
  });
});

describe("Standard quote content boundary", () => {
  it("revalidates the sealed parent after the authorization read", async () => {
    const stale = { ...quote };
    quote.finalizedAt = new Date();
    vi.mocked(db.getQuoteById).mockResolvedValue(stale);
    await expect(
      caller().update({ id: 25, notes: "changed after send" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
    expect(reads[0]).toBe("quote lock");
  });

  it.each(["sending", "unknown", "accepted"])(
    "legacy %s attempts protect a stale draft even without a seal",
    async status => {
      attempts.push({ status });
      await expect(
        caller().update({ id: 25, notes: "changed" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(writes).toEqual([]);
      expect(reads).toEqual(["quote lock", "quote read", "attempt read"]);
    }
  );

  it.each(["sentAt", "acceptedAt", "approvedAt"] as const)(
    "a draft status cannot erase legacy %s evidence",
    async field => {
      quote[field] = new Date();
      await expect(
        caller().update({ id: 25, notes: "changed" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(writes).toEqual([]);
    }
  );

  it("a rejected legacy attempt with no seal remains editable", async () => {
    attempts.push({ status: "rejected" });
    expect(await caller().update({ id: 25, notes: "corrected" })).toEqual({
      success: true,
    });
    expect(quote).toMatchObject({ notes: "corrected", total: "100" });
  });

  it("recalculates deficiency totals from the locked content and rejects another job's deficiency", async () => {
    vi.mocked(db.getDeficiencyById).mockResolvedValue({
      id: 81,
      jobId: 999,
    } as any);
    await expect(
      caller().update({
        id: 25,
        lineItems: [
          { deficiencyId: 81, description: "Foreign", unitPrice: 5, qty: 2 },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
    vi.mocked(db.getDeficiencyById).mockResolvedValue({
      id: 81,
      jobId: 1,
    } as any);
    await caller().update({
      id: 25,
      lineItems: [
        { deficiencyId: 81, description: "Own scope", unitPrice: 5, qty: 2 },
      ],
    });
    expect(quote.total).toBe("10");
  });

  it("the generic edit route cannot corrupt building line shapes/totals", async () => {
    quote.quoteType = "building";
    await expect(
      caller().update({ id: 25, notes: "changed" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it("a concurrent seal waits for the editor, then later editors reject the sealed content", async () => {
    let releaseEdit!: () => void;
    let editorLocked!: () => void;
    const started = new Promise<void>(resolve => {
      editorLocked = resolve;
    });
    pauseAfterLock = async () => {
      pauseAfterLock = undefined;
      editorLocked();
      await new Promise<void>(resolve => {
        releaseEdit = resolve;
      });
    };
    const editing = caller().update({ id: 25, notes: "last draft edit" });
    await started;
    const sealing = database.transaction(async (tx: any) => {
      const [current] = await tx
        .select()
        .from(quotes)
        .where(eqQuote())
        .for("update");
      expect(current.notes).toBe("last draft edit");
      await tx.update(quotes).set({ finalizedAt: new Date() }).where(eqQuote());
    });
    releaseEdit();
    await Promise.all([editing, sealing]);
    await expect(
      caller().update({ id: 25, notes: "late edit" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(quote.notes).toBe("last draft edit");
  });
});

function eqQuote() {
  return eq(quotes.id, quote.id);
}

describe("Building quote scope and transitions", () => {
  beforeEach(() => {
    quote.quoteType = "building";
    quote.lineItems = [
      {
        deficiencyId: null,
        description: "Service",
        unitPrice: 100,
        qty: 1,
        type: "service",
      },
      {
        deficiencyId: null,
        description: "Tech",
        unitPrice: 50,
        qty: 1,
        hours: 2,
        rate: 50,
        type: "labour",
      },
    ];
    quote.total = "200.00";
  });

  it("discount-only changes recalculate the saved total", async () => {
    await caller().updateBuilding({ id: 25, discount: 25 });
    expect(quote).toMatchObject({ total: "150.00", discount: "25.00" });
    expect(quote.lineItems).toHaveLength(2);
  });

  it("a single category edit preserves the other category and recalculates its total", async () => {
    await caller().updateBuilding({
      id: 25,
      labourLines: [{ labourType: "Fitter", hours: 3, rate: 50 }],
    });
    expect(quote).toMatchObject({ total: "250.00" });
    expect(quote.lineItems).toEqual([
      expect.objectContaining({ description: "Service", unitPrice: 100 }),
      expect.objectContaining({ description: "Fitter", hours: 3, rate: 50 }),
    ]);
  });

  it("rejects an empty replacement instead of preserving inconsistent draft totals", async () => {
    await expect(
      caller().updateBuilding({ id: 25, serviceLines: [], labourLines: [] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it.each(["other-company", "other-customer"])(
    "rejects a %s site before replacing links",
    async mismatch => {
      vi.mocked(db.getSiteById).mockResolvedValue({
        id: 98,
        companyId: mismatch === "other-company" ? 99 : 10,
        customerOrgId: 99,
      } as any);
      await expect(
        caller().updateBuilding({ id: 25, siteId: 98 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it("manual sent status seals the building scope and blocks any reset to draft", async () => {
    await caller().updateBuildingStatus({ id: 25, status: "sent" });
    expect(quote).toMatchObject({
      status: "sent",
      finalizedAt: expect.any(Date),
      sentAt: expect.any(Date),
    });
    await expect(
      caller().updateBuildingStatus({ id: 25, status: "draft" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().updateBuilding({ id: 25, comments: "changed" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("a sealed stale draft cannot be used to reopen editing", async () => {
    quote.finalizedAt = new Date();
    await expect(
      caller().updateBuildingStatus({ id: 25, status: "draft" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
  });

  it.each(["deficiency", "repair"])(
    "manual building status cannot advance/reset a %s quote",
    async quoteType => {
      quote.quoteType = quoteType;
      await expect(
        caller().updateBuildingStatus({ id: 25, status: "accepted" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it.each(["accepted", "declined"] as const)(
    "a %s decision cannot be changed or sent again",
    async status => {
      quote.status = status;
      await expect(
        caller().updateBuildingStatus({ id: 25, status: "sent" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller().updateBuildingStatus({
          id: 25,
          status: status === "accepted" ? "declined" : "accepted",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it("uses a new storage object for each PDF instead of overwriting a previously shared document", async () => {
    await caller().downloadBuildingPDF({ id: 25 });
    await caller().downloadBuildingPDF({ id: 25 });
    const keys = vi.mocked(storagePut).mock.calls.map(call => call[0]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(quote.pdfUrl).toBe("https://example.test/building.pdf");
  });

  it("a draft edit during PDF generation cannot attach that stale document to the new scope", async () => {
    vi.mocked(storagePut).mockImplementation(async () => {
      quote.lineItems = [
        {
          deficiencyId: null,
          description: "Revised scope",
          unitPrice: 300,
          qty: 1,
        },
      ];
      quote.total = "300.00";
      return { key: "stale.pdf", url: "https://example.test/stale.pdf" };
    });
    await expect(
      caller().downloadBuildingPDF({ id: 25 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(writes).toEqual([]);
    expect(quote.pdfUrl).not.toBe("https://example.test/stale.pdf");
  });
});

describe("Customer quote decision boundaries", () => {
  it("allows an emailed sealed draft with a durable accepted receipt after a final-state failure", async () => {
    quote.finalizedAt = new Date();
    attempts.push({
      status: "accepted",
      providerMessageId: "provider-message",
    });
    expect(await publicCaller().accept({ token: "valid-token" })).toEqual({
      success: true,
      alreadyAccepted: false,
    });
    expect(quote.status).toBe("accepted");
    expect(await publicCaller().accept({ token: "valid-token" })).toEqual({
      success: true,
      alreadyAccepted: true,
    });
    expect(writes).toHaveLength(1);
  });

  it.each(["sending", "unknown", "rejected"])(
    "a sealed draft with %s outcome is unavailable for approval",
    async status => {
      quote.finalizedAt = new Date();
      attempts.push({ status, providerMessageId: "maybe-message" });
      await expect(
        publicCaller().accept({ token: "valid-token" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it.each([null, "", "   ", 42])(
    "a malformed accepted receipt %j cannot advance a draft",
    async providerMessageId => {
      quote.finalizedAt = new Date();
      attempts.push({ status: "accepted", providerMessageId });
      await expect(
        publicCaller().accept({ token: "valid-token" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it("rechecks the public acceptance token after acquiring the lock", async () => {
    quote.status = "sent";
    vi.mocked(db.getQuoteByToken).mockImplementation(async () => {
      const old = { ...quote };
      quote.acceptToken = "replacement-token";
      return old;
    });
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(writes).toEqual([]);
  });

  it("an expired public token cannot accept a sent quote", async () => {
    quote.status = "sent";
    quote.acceptTokenExpiresAt = new Date(Date.now() - 1);
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it("portal decline checks the quote's actual customer instead of a different parent's customer", async () => {
    quote.status = "sent";
    vi.mocked(db.getJobById).mockResolvedValue({
      id: 1,
      customerOrgId: 99,
    } as any);
    await expect(
      customer(99).declineFromPortal({ quoteId: 25 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(writes).toEqual([]);
    expect(
      await customer(3).declineFromPortal({ quoteId: 25, reason: "No thanks" })
    ).toEqual({ success: true });
    expect(quote.status).toBe("declined");
  });

  it.each(["accepted", "draft", "cancelled", "expired"] as const)(
    "portal decline cannot overwrite a %s quote",
    async status => {
      quote.status = status;
      await expect(
        customer().declineFromPortal({ quoteId: 25 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(writes).toEqual([]);
    }
  );

  it("unsealed repair quotes cannot be approved or declined through the customer fallback", async () => {
    quote.quoteType = "repair";
    quote.status = "sent";
    await expect(
      customer().approveFromPortal({ id: 25 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      customer().declineFromPortal({ quoteId: 25 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(writes).toEqual([]);
  });

  it("simultaneous accept and decline preserve the first committed decision", async () => {
    quote.status = "sent";
    const outcomes = await Promise.allSettled([
      publicCaller().accept({ token: "valid-token" }),
      customer().declineFromPortal({ quoteId: 25 }),
    ]);
    expect(
      outcomes.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      outcomes.filter(result => result.status === "rejected")
    ).toHaveLength(1);
    expect(writes).toHaveLength(1);
    expect(["accepted", "declined"]).toContain(quote.status);
  });
});

describe("Atomic standard acceptance execution artifacts", () => {
  beforeEach(() => {
    quote.status = "sent";
    quote.finalizedAt = new Date();
  });
  it("accepts a finalized inspection without changing its job, original work order, or deficiencies", async () => {
    const source = structuredClone(executionJobs.get(1));
    executionOrders.push({
      id: 8,
      companyId: 10,
      siteId: 2,
      customerOrgId: 3,
      jobId: 1,
      quoteId: 25,
      workType: "inspection",
      finalizedAt: new Date(),
      total: "0",
      lineItems: [],
    });
    const originalOrder = structuredClone(executionOrders[0]);
    await publicCaller().accept({ token: "valid-token" });
    expect(executionJobs.get(1)).toEqual(source);
    expect(executionOrders[0]).toEqual(originalOrder);
    expect(
      Array.from(executionJobs.values()).filter(job => job.id !== 1)
    ).toMatchObject([
      {
        jobType: "repair",
        status: "pending",
        companyId: 10,
        siteId: 2,
        customerOrgId: 3,
      },
    ]);
    expect(executionOrders).toHaveLength(2);
    expect(executionApprovals).toHaveLength(1);
    const approval = executionApprovals[0],
      order = executionOrders[1];
    expect(approval).toMatchObject({
      quoteId: 25,
      jobId: order.jobId,
      workOrderId: order.id,
      approvedAmount: "100.00",
      approvedScope: "Quote #25",
    });
    expect(approval.jobId).not.toBe(1);
    expect(quote.status).toBe("accepted");
  });
  it("rolls back acceptance and every generated artifact if approval insertion fails, then safely retries", async () => {
    vi.mocked(db.createApprovedWork).mockRejectedValueOnce(
      new Error("approval insert failed")
    );
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toThrow("approval insert failed");
    expect(quote.status).toBe("sent");
    expect(executionJobs.size).toBe(1);
    expect(executionOrders).toEqual([]);
    expect(executionApprovals).toEqual([]);
    expect(await publicCaller().accept({ token: "valid-token" })).toEqual({
      success: true,
      alreadyAccepted: false,
    });
    expect(executionJobs.size).toBe(2);
    expect(executionOrders).toHaveLength(1);
    expect(executionApprovals).toHaveLength(1);
  });
  it("lost-response and simultaneous retries create one execution and one approval", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        publicCaller().accept({ token: "valid-token" })
      )
    );
    expect(results.filter(result => !result.alreadyAccepted)).toHaveLength(1);
    expect(executionJobs.size).toBe(2);
    expect(executionOrders).toHaveLength(1);
    expect(executionApprovals).toHaveLength(1);
    expect(await publicCaller().accept({ token: "valid-token" })).toMatchObject(
      { alreadyAccepted: true }
    );
    expect(executionJobs.size).toBe(2);
    expect(executionApprovals).toHaveLength(1);
  });
  it("recovers an accepted legacy decision with missing artifacts instead of silently returning success", async () => {
    quote.status = "accepted";
    quote.acceptedAt = new Date();
    expect(await customer().approveFromPortal({ id: 25 })).toEqual({
      success: true,
      alreadyAccepted: true,
    });
    expect(executionOrders).toHaveLength(1);
    expect(executionApprovals).toHaveLength(1);
    expect(executionApprovals[0]).toMatchObject({
      companyId: 10,
      jobId: executionOrders[0].jobId,
      workOrderId: executionOrders[0].id,
    });
  });
  it("relinks an untouched legacy aggregate while preserving its approval snapshot", async () => {
    quote.status = "accepted";
    executionApprovals.push({
      id: 90,
      companyId: 10,
      siteId: 2,
      customerOrgId: 3,
      jobId: 1,
      quoteId: 25,
      quoteItemId: null,
      workOrderId: null,
      status: "approved",
      approvedAmount: "100.00",
      approvedScope: "Quote #25",
      approvedByName: "Original signer",
      approvalSource: "email",
      approvedAt: new Date("2026-01-01"),
    });
    const original = structuredClone(executionApprovals[0]);
    await publicCaller().accept({ token: "valid-token" });
    const { jobId, workOrderId, ...current } = executionApprovals[0];
    const { jobId: _source, workOrderId: _old, ...snapshot } = original;
    expect(current).toEqual(snapshot);
    expect(jobId).not.toBe(1);
    expect(workOrderId).toBe(executionOrders[0].id);
  });
  it("an invoiced legacy aggregate cannot be silently relinked during retry", async () => {
    quote.status = "accepted";
    executionApprovals.push({
      id: 90,
      companyId: 10,
      siteId: 2,
      customerOrgId: 3,
      jobId: 1,
      quoteId: 25,
      quoteItemId: null,
      workOrderId: null,
      status: "approved",
      approvedAmount: "100.00",
      approvedScope: "Quote #25",
    });
    vi.mocked(db.getInvoiceByApprovedWork).mockResolvedValue({ id: 91 } as any);
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(executionJobs.size).toBe(1);
    expect(executionOrders).toEqual([]);
    expect(executionApprovals[0].jobId).toBe(1);
  });
  it("accepts a valid standalone building quote into a separate annual inspection scope", async () => {
    quote.quoteType = "building";
    quote.jobId = 0;
    executionJobs.clear();
    expect(await customer().approveFromPortal({ id: 25 })).toEqual({
      success: true,
      alreadyAccepted: false,
    });
    expect(Array.from(executionJobs.values())).toMatchObject([
      {
        jobType: "annual",
        status: "pending",
        companyId: 10,
        siteId: 2,
        customerOrgId: 3,
      },
    ]);
    expect(executionOrders).toMatchObject([
      { workType: "inspection", quoteId: 25 },
    ]);
    expect(executionApprovals).toMatchObject([
      {
        type: "job_order",
        quoteId: 25,
        jobId: executionOrders[0].jobId,
        workOrderId: executionOrders[0].id,
      },
    ]);
    expect(quote.jobId).toBe(0);
  });
  it.each(["site", "customer", "company"])(
    "refuses building acceptance with unresolved %s links before deciding",
    async mismatch => {
      quote.quoteType = "building";
      quote.jobId = 0;
      if (mismatch === "site") quote.siteId = 0;
      else if (mismatch === "customer") quote.customerOrgId = 0;
      else
        vi.mocked(db.getSiteById).mockResolvedValue({
          id: 2,
          companyId: 99,
          customerOrgId: 3,
        } as any);
      await expect(
        publicCaller().accept({ token: "valid-token" })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(quote.status).toBe("sent");
      expect(executionApprovals).toEqual([]);
      expect(executionOrders).toEqual([]);
    }
  );
  it("manual building acceptance uses the same atomic artifact workflow", async () => {
    quote.quoteType = "building";
    quote.jobId = 0;
    expect(
      await caller().updateBuildingStatus({ id: 25, status: "accepted" })
    ).toEqual({ success: true });
    expect(executionApprovals).toHaveLength(1);
    expect(executionOrders).toHaveLength(1);
  });
  it("finalized exact retries ignore native JSON key ordering and do not mutate execution", async () => {
    await publicCaller().accept({ token: "valid-token" });
    executionJobs.get(executionOrders[0].jobId).finalizedAt = new Date();
    executionOrders[0].finalizedAt = new Date();
    executionOrders[0].lineItems = executionOrders[0].lineItems.map(
      (item: any) => ({
        qty: item.qty,
        description: item.description,
        unitPrice: item.unitPrice,
        deficiencyId: item.deficiencyId,
      })
    );
    const before = structuredClone({
      jobs: executionJobs,
      orders: executionOrders,
      approvals: executionApprovals,
    });
    expect(await publicCaller().accept({ token: "valid-token" })).toMatchObject(
      { alreadyAccepted: true }
    );
    expect({
      jobs: executionJobs,
      orders: executionOrders,
      approvals: executionApprovals,
    }).toEqual(before);
  });
  it("legacy inconsistent financial scope is rejected before creating execution", async () => {
    quote.total = "1.00";
    await expect(
      publicCaller().accept({ token: "valid-token" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(quote.status).toBe("sent");
    expect(executionOrders).toEqual([]);
    expect(executionApprovals).toEqual([]);
  });
});
it("an exact accepted token recovers its receipt after expiry without inventing another decision", async () => {
  quote.status = "accepted";
  quote.finalizedAt = new Date();
  quote.acceptTokenExpiresAt = new Date(Date.now() - 1000);
  expect(await publicCaller().accept({ token: "valid-token" })).toEqual({
    success: true,
    alreadyAccepted: true,
  });
  expect(executionApprovals).toHaveLength(1);
  expect(executionOrders).toHaveLength(1);
  expect(quote.acceptedAt).toBeNull();
});
it("rejects a legacy aggregate direct deficiency before relinking it to execution", async () => {
  quote.status = "accepted";
  executionApprovals.push({
    id: 90,
    companyId: 10,
    siteId: 2,
    customerOrgId: 3,
    jobId: 1,
    quoteId: 25,
    quoteItemId: null,
    deficiencyId: 80,
    workOrderId: null,
    status: "approved",
    approvedAmount: "100.00",
    approvedScope: "Quote #25",
  });
  await expect(
    publicCaller().accept({ token: "valid-token" })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(executionOrders).toEqual([]);
  expect(executionApprovals[0]).toMatchObject({ jobId: 1, deficiencyId: 80 });
});
it("revalidates legacy source deficiency links before generating accepted artifacts", async () => {
  quote.status = "sent";
  quote.lineItems = [
    {
      deficiencyId: 80,
      description: "Legacy foreign source",
      unitPrice: 100,
      qty: 1,
    },
  ];
  vi.mocked(db.getDeficiencyById).mockResolvedValue({
    id: 80,
    jobId: 99,
  } as any);
  await expect(
    publicCaller().accept({ token: "valid-token" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(quote.status).toBe("sent");
  expect(executionOrders).toEqual([]);
  expect(executionApprovals).toEqual([]);
});
it("recovery through another customer entry preserves the existing decision provenance and unknown approval time", async () => {
  quote.status = "accepted";
  quote.approvalSource = "phone";
  quote.approvedByName = "Original approver";
  quote.approvedByEmail = "original@example.test";
  quote.approvedAt = null;
  quote.acceptedAt = null;
  await customer().approveFromPortal({ id: 25 });
  expect(executionApprovals[0]).toMatchObject({
    approvalSource: "phone",
    approvedByName: "Original approver",
    approvedByEmail: "original@example.test",
    approvedAt: null,
  });
  expect(quote.approvedAt).toBeNull();
  expect(quote.acceptedAt).toBeNull();
});
