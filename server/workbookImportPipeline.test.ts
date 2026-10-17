import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { devices, sites } from "../drizzle/schema";
import { getDb } from "./db";
import {
  buildExternalRef,
  importWorkbookForSite,
  previewWorkbookForSite,
} from "./services/workbookImport";

vi.mock("./db", () => ({ getDb: vi.fn() }));

type SavedDevice = Record<string, any> & { id: number };
const dialect = new MySqlDialect();
let saved: SavedDevice[];
let writes: Array<{ table: unknown; data: Record<string, any> }>;
let events: string[];
let savedSite: Record<string, any>;

beforeEach(() => {
  saved = [];
  writes = [];
  events = [];
  savedSite = { id: 10, companyId: 3, customerOrgId: 30, name: "Original site" };
  const database: any = {
    select: () => ({
      from: (table: unknown) => {
        if (table === sites) return { where: () => ({ for: async () => {
          events.push("lock:site");
          return [savedSite];
        } }) };
        expect(table).toBe(devices);
        return {
          where: (condition: any) => ({
            limit: (limit: number) => {
              const [companyId, siteId, category, externalRef, ...aliases] = dialect.sqlToQuery(condition).params;
              const read = () => {
                events.push(`read:${externalRef}`);
                return saved.filter(row => row.companyId === companyId && row.siteId === siteId &&
                  (row.category == null || row.category === category) &&
                  (row.externalRef === externalRef || aliases.includes(row.externalRef) ||
                   (row.serialNumber && aliases.includes(String(row.serialNumber).trim().toLowerCase())) ||
                   (row.barcode && aliases.includes(String(row.barcode).trim().toLowerCase())))).slice(0, limit);
              };
              return { then: (resolve: any, reject: any) => Promise.resolve(read()).then(resolve, reject),
                for: async () => { events.push("lock:identity"); return read(); } };
            },
          }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (data: Record<string, any>) => ({
        where: async (condition: any) => {
          events.push("update");
          writes.push({ table, data });
          if (table === sites) Object.assign(savedSite, data);
          if (table === devices) {
            const [id, companyId, siteId] = dialect.sqlToQuery(condition).params;
            const row = saved.find(row => row.id === id && row.companyId === companyId && row.siteId === siteId);
            if (row) Object.assign(row, data);
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (data: Record<string, any>) => {
        events.push("insert");
        if (data.serialNumber === "FAIL") throw Object.assign(new Error("Simulated database write failure"), { code: "ER_DATA_TOO_LONG" });
        writes.push({ table, data });
        saved.push({ ...data, id: saved.length + 1 });
      },
    }),
  };
  database.transaction = async (callback: any) => {
    events.push("begin");
    const before = structuredClone(saved);
    const beforeSite = structuredClone(savedSite);
    try {
      const result = await callback(database);
      events.push("commit");
      return result;
    } catch (error) {
      saved = before;
      savedSite = beforeSite;
      events.push("rollback");
      throw error;
    }
  };
  vi.mocked(getDb).mockResolvedValue(database);
});

function options(sheets: Array<[string, any[][]]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  return {
    fileBuffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    fileName: "audit-workbook.xlsx",
    siteId: 10,
    companyId: 3,
    userId: 7,
  };
}

const headers = ["Floor", "Location", "Device Type", "Serial Number", "Barcode", "Model"];
const ref = (data: Record<string, any>) => buildExternalRef("fireAlarmDevices", data, 10, "FIRE_ALARM_DEVICE");

describe("canonical workbook preview and execution", () => {
  it("previews without writes and distinguishes inserts from updates on reimport", async () => {
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hallway", "Smoke Detector", "", "", "M1"],
      ["2", "Hallway", "Smoke Detector", "", "", "M1"],
      ["3", "Office", "Heat Detector", "SN-1", "", "M2"],
    ]]]);
    saved.push({ id: 9, companyId: 3, siteId: 10, externalRef: ref({ serialNumber: "SN-1" }), location: "Old Office" });

    const preview = await previewWorkbookForSite(input);
    expect(writes).toEqual([]);
    expect(preview).toMatchObject({ insertedCount: 2, updatedCount: 1, excludedRowsCount: 0, counts: { fireAlarm: 3, total: 3 } });

    const result = await importWorkbookForSite(input);
    expect(result).toMatchObject({ insertedCount: 2, updatedCount: 1, excludedRowsCount: 0, counts: preview.counts });
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map(row => row.externalRef)).size).toBe(3);
    expect(saved.find(row => row.id === 9)?.location).toBe("3 - Office");

    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 3, counts: { total: 3 } });
    expect(saved).toHaveLength(3);
  });

  it("excludes every source collision across sheets before any device or site writes", async () => {
    const collidingRef = ref({ serialNumber: "SN-42" });
    saved.push({ id: 42, companyId: 3, siteId: 10, externalRef: collidingRef, location: "Preserved" });
    const input = options([
      ["Site Information", [["Site Name", "Address"], ["Renamed", "New Address"]]],
      ["Fire Alarm Devices", [headers,
        ["1", "Hall", "Smoke Detector", "SN-42", "", ""],
        ["1", "Lobby", "Pull Station", "UNIQUE-A", "", ""],
      ]],
      ["Sprinkler Devices", [headers,
        ["2", "Office", "Flow Switch", "sn-42", "", ""],
        ["2", "Plant", "Flow Switch", "UNIQUE-B", "", ""],
      ]],
    ]);
    const preview = await previewWorkbookForSite(input);
    expect(preview).toMatchObject({ insertedCount: 2, updatedCount: 0, excludedRowsCount: 2 });
    expect(preview.excludedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheetName: "Fire Alarm Devices", rowNumber: 2, externalRef: collidingRef }),
      expect.objectContaining({ sheetName: "Sprinkler Devices", rowNumber: 2, externalRef: collidingRef }),
    ]));
    expect(preview.excludedRows.every(row => row.reason.includes("Fire Alarm Devices row 2") && row.reason.includes("Sprinkler Devices row 2"))).toBe(true);
    expect(writes).toHaveLength(0);

    events = [];
    const result = await importWorkbookForSite(input);
    expect(result).toMatchObject({ insertedCount: 2, updatedCount: 0, excludedRowsCount: 2, counts: { fireAlarm: 2, total: 2 } });
    expect(saved.find(row => row.id === 42)?.location).toBe("Preserved");
    expect(writes.filter(write => write.table === devices)).toHaveLength(2);
    expect(writes.some(write => write.table === sites)).toBe(true);
    const firstWrite = events.findIndex(event => event === "insert" || event === "update");
    expect(events.slice(firstWrite).every(event => !event.startsWith("read:"))).toBe(true);
    expect(events).not.toContain(`read:${collidingRef}`);
  });

  it("reports actual spreadsheet row numbers when the header is below title rows", async () => {
    const input = options([["Fire Alarm Devices", [
      ["Annual Inspection"], [], headers,
      ["1", "Hall", "Smoke Detector", "DUP", "", ""],
      ["1", "Office", "Smoke Detector", "DUP", "", ""],
    ]]]);
    const preview = await previewWorkbookForSite(input);
    expect(preview.excludedRows.map(row => row.rowNumber)).toEqual([4, 5]);
    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 2 });
    expect(writes).toEqual([]);
  });

  it("preserves spreadsheet row numbers when the used range starts below empty rows", async () => {
    const input = options([["Fire Alarm Devices", [
      [], [], headers,
      ["1", "Hall", "Smoke Detector", "DUP", "", ""],
      ["1", "Office", "Smoke Detector", "DUP", "", ""],
    ]]]);
    const preview = await previewWorkbookForSite(input);
    expect(preview.excludedRows.map(row => row.rowNumber)).toEqual([4, 5]);
    expect(preview.excludedRows.every(row => row.reason.includes("Fire Alarm Devices row 4") && row.reason.includes("Fire Alarm Devices row 5"))).toBe(true);
    const result = await importWorkbookForSite(input);
    expect(result.excludedRows.map(row => row.rowNumber)).toEqual([4, 5]);
    expect(writes).toEqual([]);
  });

  it("rejects an identity matching multiple saved devices rather than updating the first match", async () => {
    const externalRef = ref({ serialNumber: "DUP" });
    saved.push(...[1, 2].map(id => ({ id, companyId: 3, siteId: 10, externalRef, location: `Saved ${id}` })));
    const input = options([["Fire Alarm Devices", [headers, ["1", "Hall", "Smoke Detector", "DUP", "", ""]]]]);
    const preview = await previewWorkbookForSite(input);
    expect(preview).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 1 });
    expect(preview.excludedRows[0].reason).toContain("multiple saved devices");
    expect(await importWorkbookForSite(input)).toMatchObject({ counts: { total: 0 }, excludedRowsCount: 1 });
    expect(writes).toEqual([]);
    expect(saved.map(row => row.location)).toEqual(["Saved 1", "Saved 2"]);
  });

  it("excludes source rows with different serial references but one shared barcode before any write", async () => {
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hall", "Smoke Detector", "SERIAL-A", "SHARED", ""],
      ["2", "Office", "Smoke Detector", "SERIAL-B", "shared", ""],
    ]]]);
    expect(await previewWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 2 });
    expect(await importWorkbookForSite(input)).toMatchObject({ counts: { total: 0 }, excludedRowsCount: 2 });
    expect(writes).toEqual([]); expect(saved).toEqual([]);
  });

  it("excludes every distinct source alias resolving to one saved asset rather than overwriting it twice", async () => {
    saved.push({ id: 9, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE", serialNumber: "SERIAL-A", barcode: "TAG-B", externalRef: null, location: "Preserved" });
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hall", "Smoke Detector", "SERIAL-A", "", ""],
      ["2", "Office", "Smoke Detector", "", "TAG-B", ""],
    ]]]);
    const preview = await previewWorkbookForSite(input);
    expect(preview).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 2 });
    expect(preview.excludedRows.every(row => row.reason.includes("same saved device"))).toBe(true);
    expect(await importWorkbookForSite(input)).toMatchObject({ counts: { total: 0 }, excludedRowsCount: 2 });
    expect(writes).toEqual([]); expect(saved[0].location).toBe("Preserved");
  });

  it("detects a raw barcode that aliases another row's canonical external reference", async () => {
    const firstRef = ref({ serialNumber: "SERIAL-A" });
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hall", "Smoke Detector", "SERIAL-A", "", ""],
      ["2", "Office", "Smoke Detector", "", firstRef, ""],
    ]]]);
    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 2 });
    expect(writes).toEqual([]);
  });

  it("rechecks saved identities at execution rather than trusting the earlier preview", async () => {
    const externalRef = ref({ serialNumber: "DUP" });
    const input = options([["Fire Alarm Devices", [headers, ["1", "Hall", "Smoke Detector", "DUP", "", ""]]]]);
    expect(await previewWorkbookForSite(input)).toMatchObject({ insertedCount: 1 });
    saved.push(...[1, 2].map(id => ({ id, companyId: 3, siteId: 10, externalRef })));
    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 0, excludedRowsCount: 1 });
    expect(writes).toEqual([]);
  });

  it("counts only successful writes and explains a row failure", async () => {
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hall", "Smoke Detector", "GOOD", "", ""],
      ["2", "Office", "Smoke Detector", "FAIL", "", ""],
    ]]]);
    expect(await previewWorkbookForSite(input)).toMatchObject({ insertedCount: 2 });
    const result = await importWorkbookForSite(input);
    expect(result).toMatchObject({ insertedCount: 1, updatedCount: 0, excludedRowsCount: 1, counts: { total: 1 } });
    expect(result.excludedRows[0]).toMatchObject({ rowNumber: 3, reason: expect.stringContaining("Could not save") });
    expect(saved).toHaveLength(1);
  });

  it("keeps repeated sheets in their intended category and preserves barcode identities after moves", async () => {
    const input = options([
      ["Emergency Lights East", [["Floor", "Location", "Barcode"], ["1", "Hall", "EL-1"]]],
      ["Emergency Lights West", [["Floor", "Location", "Barcode"], ["2", "Office", "EL-2"]]],
    ]);
    expect(await importWorkbookForSite(input)).toMatchObject({ counts: { emergencyLights: 2, fireAlarm: 0, total: 2 }, insertedCount: 2 });
    const moved = options([
      ["Emergency Lights East", [["Floor", "Location", "Barcode"], ["4", "Lobby", "el-1"]]],
    ]);
    expect(await importWorkbookForSite(moved)).toMatchObject({ counts: { emergencyLights: 1 }, insertedCount: 0, updatedCount: 1 });
    expect(saved.find(row => row.externalRef.endsWith(":bc:el-1"))?.location).toBe("4 - Lobby");
    expect(saved).toHaveLength(2);
  });
  it("scopes saved identity checks to both the destination company and site", async () => {
    const externalRef = ref({ serialNumber: "SN-1" });
    saved.push(
      { id: 1, companyId: 4, siteId: 10, externalRef, location: "Other company" },
      { id: 2, companyId: 3, siteId: 11, externalRef, location: "Other site" },
    );
    const input = options([["Fire Alarm Devices", [headers, ["1", "Hall", "Smoke Detector", "SN-1", "", ""]]]]);
    expect(await previewWorkbookForSite(input)).toMatchObject({ insertedCount: 1, updatedCount: 0 });
    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 1, updatedCount: 0 });
    expect(saved).toHaveLength(3);
    expect(saved.slice(0, 2).map(row => row.location)).toEqual(["Other company", "Other site"]);
  });

  it("locks the site before current identity reads and keeps site and device writes in the transaction", async () => {
    const input = options([
      ["Site Information", [["Site Name", "Address"], ["Updated site", "1 Main Street"]]],
      ["Fire Alarm Devices", [headers, ["1", "Hall", "Smoke Detector", "SN-1", "", ""]]],
    ]);
    await importWorkbookForSite(input);
    expect(events[0]).toBe("begin");
    expect(events[1]).toBe("lock:site");
    expect(events.indexOf("lock:identity")).toBeLessThan(events.indexOf("update"));
    expect(events.at(-1)).toBe("commit");
    expect(savedSite.name).toBe("Updated site");
  });

  it("rolls back earlier devices and site fields when the connection or transaction fails", async () => {
    const input = options([
      ["Site Information", [["Site Name"], ["Should roll back"]]],
      ["Fire Alarm Devices", [headers,
        ["1", "Hall", "Smoke Detector", "GOOD", "", ""],
        ["2", "Office", "Smoke Detector", "DEADLOCK", "", ""],
      ]],
    ]);
    const database = (await getDb())!;
    const original = database.insert;
    vi.spyOn(database, "insert").mockImplementation((table: any) => ({ values: async (data: any) => {
      if (data.serialNumber === "DEADLOCK") throw new Error("Query failed", {
        cause: Object.assign(new Error("Transaction rolled back"), { code: "ER_LOCK_DEADLOCK" }),
      });
      return original(table).values(data);
    } }) as any);
    await expect(importWorkbookForSite(input)).rejects.toThrow("Query failed");
    expect(saved).toEqual([]);
    expect(savedSite.name).toBe("Original site");
    expect(events.at(-1)).toBe("rollback");
  });

  it("recognizes saved devices from older importers without creating another copy", async () => {
    saved.push({ id: 1, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE",
      serialNumber: "  old-sn  ", externalRef: null, location: "Original" });
    saved.push({ id: 2, companyId: 3, siteId: 10, category: "FIRE_ALARM_DEVICE",
      externalRef: "tag-2", location: "Legacy tag import" });
    const input = options([["Fire Alarm Devices", [headers,
      ["1", "Hall", "Smoke Detector", "OLD-SN", "", ""],
      ["2", "Lobby", "Smoke Detector", "", "TAG-2", ""],
    ]]]);
    expect(await importWorkbookForSite(input)).toMatchObject({ insertedCount: 0, updatedCount: 2 });
    expect(saved).toHaveLength(2);
    expect(saved[0].externalRef).toBe(ref({ serialNumber: "OLD-SN" }));
    expect(saved[1].externalRef).toBe(ref({ barcode: "TAG-2" }));
  });

  it("preserves selected device sheets, label/value site fields and source ordering for the legacy route", async () => {
    const input = options([
      ["Site Information", [["Site Name", "Imported site"], ["Address", "2 Main Street"], ["City", "Vancouver"]]],
      ["Emergency Lights", [["Location", "Tag"], ["Hall", "EL-1"], ["Lobby", "EL-2"]]],
      ["Fire Extinguishers", [["Location", "Tag"], ["Hall", "EXT-1"]]],
    ]);
    const result = await importWorkbookForSite({ ...input, selectedSheets: ["Emergency Lights"], preserveSourceOrder: true });
    expect(result).toMatchObject({ siteFieldsUpdated: 3, siteUpdatedFields: ["name", "address", "city"],
      insertedCounts: { emergencyLights: 2, extinguishers: 0, total: 2 }, updatedCounts: { total: 0 } });
    expect(savedSite).toMatchObject({ name: "Imported site", address: "2 Main Street", city: "Vancouver" });
    expect(saved.map(row => row.sortOrder)).toEqual([1, 2]);
    expect(saved.map(row => row.barcode)).toEqual(["EL-1", "EL-2"]);
  });

});
