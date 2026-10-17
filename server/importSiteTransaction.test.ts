import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { getTransactionDb, runWithDb } from "./db/client";
import { isRecoverableImportRowError, withLockedImportSite } from "./services/importSiteTransaction";

vi.mock("./db", () => ({ getDb: vi.fn() }));

const destination = { siteId: 10, companyId: 3, customerOrgId: 30 };
let site: Record<string, unknown> | undefined;
let database: any;
let tx: any;
let lock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  site = { id: 10, companyId: 3, customerOrgId: 30 };
  lock = vi.fn(async () => site ? [site] : []);
  tx = { select: vi.fn(() => ({ from: () => ({ where: () => ({ for: lock }) }) })) };
  database = { transaction: vi.fn(async operation => operation(tx)) };
  vi.mocked(getDb).mockResolvedValue(database);
});

describe("destination import serialization", () => {
  it("waits for the parent lock before invoking any import work", async () => {
    let release!: (rows: any[]) => void;
    let started!: () => void;
    const reachedLock = new Promise<void>(resolve => { started = resolve; });
    lock.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const operation = vi.fn(async actualTx => {
      expect(actualTx).toBe(tx);
      expect(getTransactionDb()).toBe(tx);
      return "imported";
    });
    const importing = withLockedImportSite(destination, operation);
    await reachedLock;
    expect(operation).not.toHaveBeenCalled();
    release([site]);
    expect(await importing).toBe("imported");
    expect(lock).toHaveBeenCalledWith("update");
    expect(getTransactionDb()).toBeUndefined();
  });

  it("joins an existing audited transaction without issuing a second BEGIN", async () => {
    await runWithDb(tx, () => withLockedImportSite(destination, async actualTx => {
      expect(actualTx).toBe(tx);
      return withLockedImportSite(destination, async nestedTx => expect(nestedTx).toBe(tx));
    }));
    expect(database.transaction).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing", undefined, "NOT_FOUND"],
    ["company changed", { id: 10, companyId: 4, customerOrgId: 30 }, "FORBIDDEN"],
    ["customer changed", { id: 10, companyId: 3, customerOrgId: 31 }, "FORBIDDEN"],
  ])("rejects a %s destination after obtaining the current lock", async (_name, current, code) => {
    site = current;
    const operation = vi.fn();
    await expect(withLockedImportSite(destination, operation)).rejects.toMatchObject({ code });
    expect(operation).not.toHaveBeenCalled();
  });

  it("propagates a failed import to the transaction owner and clears its context", async () => {
    await expect(withLockedImportSite(destination, async () => { throw new Error("Write failed"); })).rejects.toThrow("Write failed");
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(getTransactionDb()).toBeUndefined();
  });
});

describe("best-effort import row errors", () => {
  it.each(["ER_DATA_TOO_LONG", "ER_BAD_NULL_ERROR", "ER_TRUNCATED_WRONG_VALUE", "ER_DUP_ENTRY"])(
    "allows an isolated %s data error wrapped by Drizzle", code => {
      expect(isRecoverableImportRowError(new Error("Query failed", { cause: Object.assign(new Error("Bad row"), { code }) }))).toBe(true);
    },
  );
  it.each(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "PROTOCOL_CONNECTION_LOST", "ECONNRESET", undefined])(
    "aborts the import for %s instead of continuing an invalid transaction", code => {
      expect(isRecoverableImportRowError(Object.assign(new Error("Failed"), { code }))).toBe(false);
    },
  );
});
