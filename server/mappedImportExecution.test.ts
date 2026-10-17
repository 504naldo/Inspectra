import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { devices, sites } from "../drizzle/schema";
import * as db from "./db";
import { getTransactionDb } from "./db/client";
import { importRouter } from "./routers/importRouter";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(), getSiteById: vi.fn(), createImportLog: vi.fn(), updateImportLog: vi.fn(),
  createBulkImportRowResults: vi.fn(), getMaxDeviceSortOrder: vi.fn(),
  createDevice: vi.fn(), updateDevice: vi.fn(), getDevicesBySite: vi.fn(), updateSite: vi.fn(),
}));

const dialect = new MySqlDialect();
const site = { id: 10, companyId: 3, customerOrgId: 30 };
const caller = () => importRouter.createCaller({ user: { id: 7, role: "office", companyId: 3 } } as TrpcContext);
let saved: any[];
let events: string[];
let transaction: any;
let failure: { serial: string; code: string } | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  saved = []; events = []; failure = undefined;
  vi.mocked(db.getSiteById).mockResolvedValue(site as any);
  transaction = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      if (table === sites) return { for: async () => { events.push("lock:site"); return [site]; } };
      expect(table).toBe(devices);
      const [companyId, siteId, category, externalRef, ...aliases] = dialect.sqlToQuery(condition).params;
      return { limit: (limit: number) => ({ for: async () => {
        events.push("read:identity");
        return saved.filter(row => row.companyId === companyId && row.siteId === siteId && row.category === category &&
          (row.externalRef === externalRef || aliases.includes(row.externalRef) ||
            aliases.includes(row.serialNumber?.trim().toLowerCase()) || aliases.includes(row.barcode?.trim().toLowerCase()))).slice(0, limit);
      } }) };
    } }) }),
  };
  vi.mocked(db.getDb).mockResolvedValue({ transaction: async (operation: any) => {
    events.push("begin");
    const before = structuredClone(saved);
    try { const result = await operation(transaction); events.push("commit"); return result; }
    catch (error) { saved = before; events.push("rollback"); throw error; }
  } } as any);
  const assertContext = () => expect(getTransactionDb()).toBe(transaction);
  vi.mocked(db.createImportLog).mockImplementation(async data => { assertContext(); events.push("log"); return { ...data, id: 11 } as any; });
  vi.mocked(db.getMaxDeviceSortOrder).mockImplementation(async () => { assertContext(); return 4; });
  vi.mocked(db.createDevice).mockImplementation(async data => {
    assertContext();
    if (data.serialNumber === failure?.serial) throw new Error("Write failed", {
      cause: Object.assign(new Error("MySQL failure"), { code: failure.code }),
    });
    const device = { ...data, id: saved.length + 1 };
    saved.push(device); events.push("insert");
    return device as any;
  });
  vi.mocked(db.updateDevice).mockImplementation(async (id, data) => {
    assertContext(); Object.assign(saved.find(row => row.id === id), data); events.push("update");
  });
  vi.mocked(db.createBulkImportRowResults).mockImplementation(async () => { assertContext(); });
  vi.mocked(db.updateImportLog).mockImplementation(async () => { assertContext(); events.push("complete:log"); });
});

function input(rows: any[][], duplicateHandling: "skip" | "update" | "create_new" = "update") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Location", "Device Type", "Serial Number", "Barcode"], ...rows,
  ]), "Fire Alarm Devices");
  return {
    companyId: 999, siteId: 10, importType: "fireAlarmDevices" as const,
    fileName: "mapped.xlsx", fileData: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }).toString("base64"),
    sheetName: "Fire Alarm Devices", columnMapping: { location: "Location", deviceType: "Device Type", serialNumber: "Serial Number", barcode: "Barcode" },
    duplicateHandling,
  };
}

describe("mapped import execution", () => {
  it("resolves identities and writes its log on the locked destination transaction", async () => {
    saved.push({ id: 8, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE", serialNumber: "SN-1", location: "Old" });
    const result = await caller().execute(input([["Hall", "Smoke Detector", "sn-1", ""], ["Lobby", "Heat Detector", "SN-2", ""]]));
    expect(result).toMatchObject({ successCount: 1, duplicateCount: 1, errorCount: 0 });
    expect(events.slice(0, 2)).toEqual(["begin", "lock:site"]);
    expect(events.indexOf("read:identity")).toBeLessThan(events.indexOf("log"));
    expect(events.at(-1)).toBe("commit");
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ location: "Hall", companyId: 3, externalRef: "FIRE_ALARM_DEVICE:10:sn:sn-1" });
    expect(db.createImportLog).toHaveBeenCalledWith(expect.objectContaining({ companyId: 3 }));
  });

  it("excludes all repeated source identities before writing the first matching row", async () => {
    const result = await caller().execute(input([["Hall", "Smoke Detector", "DUP", ""], ["Lobby", "Heat Detector", "dup", ""]]));
    expect(result).toMatchObject({ successCount: 0, duplicateCount: 0, errorCount: 2 });
    expect(db.createDevice).not.toHaveBeenCalled();
    expect(db.updateDevice).not.toHaveBeenCalled();
    expect(db.createBulkImportRowResults).toHaveBeenCalledWith([
      expect.objectContaining({ rowNumber: 2, status: "error", errorMessage: expect.stringContaining("Ambiguous") }),
      expect.objectContaining({ rowNumber: 3, status: "error", errorMessage: expect.stringContaining("Ambiguous") }),
    ]);
  });

  it("does not choose the first of multiple saved identity matches", async () => {
    saved.push(...[1, 2].map(id => ({ id, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE", serialNumber: "DUP", location: `Original ${id}` })));
    expect(await caller().execute(input([["Hall", "Smoke Detector", "DUP", ""]]))).toMatchObject({ errorCount: 1, duplicateCount: 0 });
    expect(db.updateDevice).not.toHaveBeenCalled();
    expect(saved.map(row => row.location)).toEqual(["Original 1", "Original 2"]);
  });

  it("excludes differing serial identities that share a barcode", async () => {
    const result = await caller().execute(input([["Hall", "Smoke Detector", "SERIAL-A", "SHARED"], ["Lobby", "Heat Detector", "SERIAL-B", "shared"]]));
    expect(result).toMatchObject({ successCount: 0, duplicateCount: 0, errorCount: 2 });
    expect(db.createDevice).not.toHaveBeenCalled(); expect(db.updateDevice).not.toHaveBeenCalled();
  });

  it("resolves distinct aliases to a saved target before any row can overwrite its original identity", async () => {
    saved.push({ id: 8, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE", serialNumber: "SERIAL-A", barcode: "TAG-B", location: "Preserved" });
    const result = await caller().execute(input([["Hall", "Smoke Detector", "SERIAL-A", ""], ["Lobby", "Heat Detector", "", "TAG-B"]]));
    expect(result).toMatchObject({ successCount: 0, duplicateCount: 0, errorCount: 2 });
    expect(db.createDevice).not.toHaveBeenCalled(); expect(db.updateDevice).not.toHaveBeenCalled();
    expect(saved[0].location).toBe("Preserved");
    expect(db.createBulkImportRowResults).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, errorMessage: expect.stringContaining("same saved device") }),
      expect.objectContaining({ rowNumber: 3, errorMessage: expect.stringContaining("same saved device") }),
    ]));
  });

  it("keeps explicitly requested new copies even when source aliases overlap", async () => {
    const result = await caller().execute(input([["Hall", "Smoke Detector", "SERIAL-A", "SHARED"], ["Lobby", "Heat Detector", "SERIAL-B", "SHARED"]], "create_new"));
    expect(result).toMatchObject({ successCount: 2, duplicateCount: 0, errorCount: 0 });
    expect(saved).toHaveLength(2);
  });

  it("rejects writable identity/company fields in a client mapping before starting any writes", async () => {
    const request = input([["Hall", "Smoke Detector", "SN-1", ""]]);
    await expect(caller().execute({ ...request, columnMapping: { ...request.columnMapping, companyId: "Serial Number" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(events).toEqual([]);
    expect(db.createImportLog).not.toHaveBeenCalled();
  });

  it("rolls back earlier inserts and never completes its log after a deadlock", async () => {
    failure = { serial: "FAIL", code: "ER_LOCK_DEADLOCK" };
    await expect(caller().execute(input([["Hall", "Smoke Detector", "GOOD", ""], ["Lobby", "Heat Detector", "FAIL", ""]]))).rejects.toThrow("Write failed");
    expect(saved).toEqual([]);
    expect(events.at(-1)).toBe("rollback");
    expect(db.updateImportLog).not.toHaveBeenCalled();
  });

  it("continues after an isolated row data error and reports a partial import", async () => {
    failure = { serial: "FAIL", code: "ER_DATA_TOO_LONG" };
    expect(await caller().execute(input([["Hall", "Smoke Detector", "FAIL", ""], ["Lobby", "Heat Detector", "GOOD", ""]]))).toMatchObject({ successCount: 1, errorCount: 1 });
    expect(saved).toHaveLength(1);
    expect(db.updateImportLog).toHaveBeenCalledWith(11, expect.objectContaining({ status: "partial", successCount: 1, errorCount: 1 }));
    expect(events.at(-1)).toBe("commit");
  });

  it("retains the explicit create_new operator choice", async () => {
    saved.push({ id: 8, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE", serialNumber: "SN-1" });
    expect(await caller().execute(input([["Hall", "Smoke Detector", "SN-1", ""]], "create_new"))).toMatchObject({ successCount: 1, duplicateCount: 0 });
    expect(saved).toHaveLength(2);
    expect(db.updateDevice).not.toHaveBeenCalled();
  });
});
