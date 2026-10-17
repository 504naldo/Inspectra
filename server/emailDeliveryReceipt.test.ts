import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { emailOutbox } from "../drizzle/schema";
import { getDb } from "./db";
import { emailDeliveryRouter } from "./routers/emailDeliveryRouter";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const requestId = "80bff1a5-8a2b-46b4-b1b6-1c7fde58300a";
const dialect = new MySqlDialect();
let row: Record<string, unknown> | undefined;
let query: { sql: string; params: unknown[] };
let fields: Record<string, unknown>;

function caller(role = "office", companyId: number | null = 10, userId = 7) {
  return emailDeliveryRouter.createCaller({
    user: { id: userId, role, companyId }, req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}

beforeEach(() => {
  vi.resetAllMocks();
  row = { requestId, status: "accepted", providerMessageId: "provider-123" };
  fields = {};
  query = { sql: "", params: [] };
  vi.mocked(getDb).mockResolvedValue({
    select: (projection: Record<string, unknown>) => {
      fields = projection;
      return { from: (table: unknown) => {
        expect(table).toBe(emailOutbox);
        return { where: (condition: any) => {
          query = dialect.sqlToQuery(condition);
          return { limit: async () => row ? [row] : [] };
        } };
      } };
    },
  } as any);
});

describe("Owned email delivery receipts", () => {
  it("office lookup constrains request, sender and tenant and selects no email content", async () => {
    expect(await caller().lookup({ requestId })).toEqual(row);
    expect(query.params).toEqual([requestId, 7, 10]);
    for (const column of ["requestId", "userId", "companyId"]) expect(query.sql).toContain(`\`${column}\` = ?`);
    expect(Object.keys(fields).sort()).toEqual(["providerMessageId", "requestId", "status"]);
  });

  it("platform lookup still requires the actual sender while permitting their foreign-company sends", async () => {
    await caller("admin").lookup({ requestId });
    expect(query.params).toEqual([requestId, 7]);
    expect(query.sql).toContain("`userId` = ?");
    expect(query.sql).not.toContain("`companyId`");
  });

  it("does not allow missing tenant identity to remove the office scope", async () => {
    await caller("office", null).lookup({ requestId });
    expect(query.params).toEqual([requestId, 7, -1]);
  });

  it("does not reveal whether an unknown or non-owned operation exists", async () => {
    row = undefined;
    expect(await caller().lookup({ requestId })).toBeNull();
  });

  it.each(["technician", "customer"])("denies %s before accessing tracking", async role => {
    await expect(caller(role).lookup({ requestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects malformed operation IDs before querying", async () => {
    await expect(caller().lookup({ requestId: "not-an-operation" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("a database failure is an error rather than a missing receipt", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(caller().lookup({ requestId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("does not present acceptance without a provider receipt", async () => {
    row = { requestId, status: "accepted", providerMessageId: null };
    expect(await caller().lookup({ requestId })).toEqual({ requestId, status: "unknown", providerMessageId: null });
  });

  it("returns an allowlisted receipt even if a driver returns extra fields", async () => {
    row = { requestId, status: "unknown", providerMessageId: null, payloadHash: "internal", userId: 12 };
    expect(await caller().lookup({ requestId })).toEqual({ requestId, status: "unknown", providerMessageId: null });
  });
});
