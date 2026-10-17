import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { companies, customerOrgs, devices, importLogs, importRowResults, sites } from "../drizzle/schema";
import * as db from "./db";
import * as identity from "./services/importDeviceIdentity";
import { importWorkbookForSite } from "./services/workbookImport";
import { importRouter } from "./routers/importRouter";
import type { TrpcContext } from "./_core/context";

function deferred() {
  let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
}

// Real MySQL acceptance: deliberately separate from mocked orchestration tests.
describe("Workbook import serialization and rollback (MySQL)", () => {
  let companyId: number, orgId: number;
  beforeAll(async () => {
    companyId = (await db.createCompany({ name: "Workbook concurrency fixtures" })).id;
    orgId = (await db.createCustomerOrg({ companyId, name: "Workbook concurrency customer" })).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    const database = await db.getDb();
    if (!database || !companyId) return;
    const logs = await database.select({ id: importLogs.id }).from(importLogs).where(eq(importLogs.companyId, companyId));
    if (logs.length) await database.delete(importRowResults).where(inArray(importRowResults.importLogId, logs.map(log => log.id)));
    await database.delete(importLogs).where(eq(importLogs.companyId, companyId));
    await database.delete(devices).where(eq(devices.companyId, companyId));
    await database.delete(sites).where(eq(sites.companyId, companyId));
    await database.delete(customerOrgs).where(eq(customerOrgs.id, orgId));
    await database.delete(companies).where(eq(companies.id, companyId));
  });

  async function fixture(twoDevices = false) {
    const site = await db.createSite({ companyId, customerOrgId: orgId, name: "Original site" });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Site Name"], ["Updated site"]]), "Site Information");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Location", "Device Type", "Serial Number"], ["Hall", "Smoke Detector", "FIRST"],
      ...(twoDevices ? [["Lobby", "Heat Detector", "SECOND"]] : []),
    ]), "Fire Alarm Devices");
    return { fileBuffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
      fileName: "concurrent.xlsx", companyId, customerOrgId: orgId, siteId: site.id, userId: 1 };
  }

  it.each(["canonical", "mapped"] as const)("serializes a concurrent %s import after the first import's identity read", async path => {
    const options = await fixture();
    const paused = deferred(), release = deferred();
    const original = identity.findImportDeviceMatches;
    let calls = 0;
    vi.spyOn(identity, "findImportDeviceMatches").mockImplementation(async (...args) => {
      const rows = await original(...args);
      if (++calls === 1) { paused.resolve(); await release.promise; }
      return rows;
    });
    const first = importWorkbookForSite(options);
    await paused.promise;
    const second = path === "canonical" ? importWorkbookForSite(options) :
      importRouter.createCaller({ user: { id: 1, role: "office", companyId } } as TrpcContext).execute({
        companyId, siteId: options.siteId, importType: "fireAlarmDevices", fileName: options.fileName,
        fileData: options.fileBuffer.toString("base64"), sheetName: "Fire Alarm Devices",
        columnMapping: { location: "Location", deviceType: "Device Type", serialNumber: "Serial Number" }, duplicateHandling: "update",
      });
    let early;
    try { early = await Promise.race([second.then(() => "finished"), new Promise<null>(done => setTimeout(() => done(null), 100))]); }
    finally { release.resolve(); }
    expect(await first).toMatchObject({ insertedCount: 1, updatedCount: 0 });
    const secondResult = await second;
    expect(early).toBeNull();
    expect(secondResult).toMatchObject(path === "canonical" ? { insertedCount: 0, updatedCount: 1 } : { successCount: 0, duplicateCount: 1 });
    const database = (await db.getDb())!;
    expect(await database.select().from(devices).where(and(eq(devices.companyId, companyId), eq(devices.siteId, options.siteId)))).toHaveLength(1);
  });

  it("rolls back site fields and preceding rows after a fatal transaction failure", async () => {
    const options = await fixture(true);
    const database = (await db.getDb())!;
    const originalTransaction = database.transaction.bind(database);
    vi.spyOn(database, "transaction").mockImplementation((operation: any) => originalTransaction(async tx => {
      const proxied = new Proxy(tx, { get(target, property) {
        if (property === "insert") return (table: unknown) => {
          const builder = target.insert(table as typeof devices);
          return { values(data: any) {
            if (table === devices && data.serialNumber === "SECOND") {
              throw Object.assign(new Error("Injected transaction failure"), { code: "ER_LOCK_DEADLOCK" });
            }
            return builder.values(data);
          } };
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return operation(proxied);
    }));
    await expect(importWorkbookForSite(options)).rejects.toThrow("Injected transaction failure");
    expect((await db.getSiteById(options.siteId))?.name).toBe("Original site");
    expect(await database.select().from(devices).where(eq(devices.siteId, options.siteId))).toHaveLength(0);
  });
});
