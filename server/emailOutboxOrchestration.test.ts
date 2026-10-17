import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { emailOutbox } from "../drizzle/schema";
import { getDb } from "./db";
import { EmailProviderRejected, sendEmailOnce } from "./emailOutbox";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const dialect = new MySqlDialect();
let rows: Array<Record<string, any>>;
let failReservation: boolean, failAcceptance: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  failReservation = false;
  failAcceptance = false;
  vi.mocked(getDb).mockResolvedValue({
    insert: (table: unknown) => ({ values: async (data: Record<string, unknown>) => {
      expect(table).toBe(emailOutbox);
      if (failReservation) throw new Error("tracking unavailable");
      if (rows.some(row => row.requestId === data.requestId)) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      rows.push({ ...data, id: rows.length + 1, status: "sending", providerMessageId: null });
    } }),
    select: () => ({ from: () => ({ where: (condition: any) => ({ limit: async () => {
      const [requestId] = dialect.sqlToQuery(condition).params;
      return rows.filter(row => row.requestId === requestId).map(row => ({ ...row }));
    } }) }) }),
    update: () => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: any) => {
      if (changes.status === "accepted" && failAcceptance) throw new Error("tracking update failed");
      const [id] = dialect.sqlToQuery(condition).params;
      Object.assign(rows.find(row => row.id === id)!, changes);
    } }) }),
  } as any);
});

function operation(send = vi.fn(async () => ({ id: "provider-message" }))) {
  return { requestId: crypto.randomUUID(), companyId: 2, userId: 7, entityType: "repair_quote", entityId: 10,
    provider: "resend", payload: { to: ["customer@example.test"] }, send };
}

describe("Email outbox dispatch orchestration (mocked persistence)", () => {
  it("reserves a durable operation before calling the provider", async () => {
    const op = operation(vi.fn(async () => {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "sending", entityId: 10 });
      return { id: "provider-message" };
    }));
    expect(await sendEmailOnce(op)).toEqual({ id: "provider-message", acceptance: "accepted" });
    expect(rows[0]).toMatchObject({ status: "accepted", providerMessageId: "provider-message" });
  });

  it("does not call the provider when reservation fails", async () => {
    failReservation = true;
    const op = operation();
    await expect(sendEmailOnce(op)).rejects.toThrow("tracking unavailable");
    expect(op.send).not.toHaveBeenCalled();
  });

  it("reuses accepted receipts without repeating provider work after application-state failure", async () => {
    const op = operation();
    await expect((async () => { await sendEmailOnce(op); throw new Error("quote status save failed"); })())
      .rejects.toThrow("quote status save failed");
    expect(await sendEmailOnce(op)).toEqual({ id: "provider-message", acceptance: "accepted" });
    expect(op.send).toHaveBeenCalledTimes(1);
  });

  it("preserves an unknown outcome after an acceptance-recording failure and never dispatches again", async () => {
    failAcceptance = true;
    const op = operation();
    await expect(sendEmailOnce(op)).rejects.toThrow("tracking update failed");
    expect(rows[0].status).toBe("unknown");
    await expect(sendEmailOnce(op)).rejects.toThrow(/reconciliation/);
    expect(op.send).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a malformed historical acceptance receipt or send it again", async () => {
    const op = operation();
    await sendEmailOnce(op);
    rows[0].providerMessageId = "   ";
    await expect(sendEmailOnce(op)).rejects.toThrow(/reconciliation/);
    expect(op.send).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, "", "   ", 23])("rejects malformed provider message ID %s without reporting success", async id => {
    const op = operation(vi.fn(async () => ({ id } as any)));
    await expect(sendEmailOnce(op)).rejects.toThrow(/no message ID/);
    expect(rows[0].status).toBe("unknown");
    await expect(sendEmailOnce(op)).rejects.toThrow(/reconciliation/);
    expect(op.send).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("tracks provider outcome certainty (rejected=%s) without replay", async rejected => {
    const op = operation(vi.fn(async () => {
      throw rejected ? new EmailProviderRejected("HTTP 401") : new Error("response disconnected");
    }));
    await expect(sendEmailOnce(op)).rejects.toThrow();
    expect(rows[0].status).toBe(rejected ? "rejected" : "unknown");
    await expect(sendEmailOnce(op)).rejects.toThrow();
    expect(op.send).toHaveBeenCalledTimes(1);
  });

  it("does not expose another account's accepted receipt or reuse an ID for changed input", async () => {
    const op = operation();
    await sendEmailOnce(op);
    for (const change of [{ userId: 8 }, { companyId: 3 }, { entityType: "quote" }, { payload: { to: ["someone@example.test"] } }]) {
      await expect(sendEmailOnce({ ...op, ...change })).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(op.send).toHaveBeenCalledTimes(1);
  });
});
