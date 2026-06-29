/**
 * partsInventoryImport.test.ts — bulk Parts Catalog + Inventory import.
 *
 * Verifies the Import Center pipeline against a real DB: SKU parsing, the
 * removal of the old 280-row cap (imports 290 rows), and the new bulk
 * Inventory import (importCenter.parseInventoryFile → inventory.importExecute).
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function octx(companyId: number): TrpcContext {
  return { user: { id: 1, openId: "o", email: "o@e.com", name: "O", role: "office", companyId, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} }, requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}
function toB64(aoa: unknown[][], sheetName: string): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

describe("Bulk Parts Catalog + Inventory import", () => {
  let companyId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;
  beforeAll(async () => {
    const c = await db.createCompany({ name: "Import Co", email: "i@e.com" });
    companyId = c.id;
    caller = appRouter.createCaller(octx(companyId));
  });

  it("parses SKU and imports past the old 280-row cap", async () => {
    const aoa: unknown[][] = [["title"], [], [], ["Category","Product Name","SKU","","Unit Price","","","Labour","Description"]];
    for (let i = 0; i < 290; i++) aoa.push(["Sprinkler", `Part ${i}`, `SKU-${i}`, "", 10 + i, "", "", 0, `desc ${i}`]);
    const parsed = await caller.importCenter.parsePartsCatalogFile({ fileData: toB64(aoa, "Parts List"), fileName: "p.xlsx" });
    expect(parsed.parsed.length).toBe(290); // old cap was 280
    expect(parsed.parsed[0].sku).toBe("SKU-0");
    const res = await caller.partsCatalog.importExecute({ rows: parsed.parsed.filter((r: any) => !r._dupWithin) as any, updateExisting: false });
    expect(res.created).toBe(290);
    const all = await db.getPartsCatalogByCompany(companyId, true);
    expect(all.find((p) => p.productName === "Part 5")?.sku).toBe("SKU-5");
  });

  it("imports inventory with cost/price/supplier and on-hand quantity", async () => {
    const aoa: unknown[][] = [["title"], [], [], ["Category","Name","SKU","Supplier","Unit Cost","Unit Price","Qty","Reorder","Description"]];
    aoa.push(["Batteries", "12V 7Ah SLA", "BAT-7", "National", 14.5, 22.0, 0, 5, "Sealed lead acid"]);
    aoa.push(["Batteries", "6V 12Ah SLA", "BAT-12", "Vanfire", 18, 28, 0, 3, "Sealed lead acid"]);
    const parsed = await caller.importCenter.parseInventoryFile({ fileData: toB64(aoa, "Inventory"), fileName: "i.xlsx" });
    expect(parsed.parsed.length).toBe(2);
    const res = await caller.inventory.importExecute({ rows: parsed.parsed.filter((r: any) => !r._dupWithin) as any, updateExisting: false });
    expect(res.created).toBe(2);
    const items = await db.getInventoryItemsByCompany(companyId, true);
    const bat = items.find((i) => i.sku === "BAT-7");
    expect(bat?.name).toBe("12V 7Ah SLA");
    expect(Number(bat?.unitCost)).toBe(14.5);
    expect(bat?.supplierName).toBe("National");
    expect(bat?.quantityOnHand).toBe(0);
  });

  it("skips duplicates on re-import unless updateExisting", async () => {
    const aoa: unknown[][] = [["t"], [], [], ["Category","Name","SKU","Supplier","Unit Cost","Unit Price","Qty","Reorder","Description"],
      ["Batteries", "12V 7Ah SLA", "BAT-7", "National", 99, 99, 0, 0, "dup"]];
    const parsed = await caller.importCenter.parseInventoryFile({ fileData: toB64(aoa, "Inventory"), fileName: "i.xlsx" });
    const res = await caller.inventory.importExecute({ rows: parsed.parsed as any, updateExisting: false });
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
  });
});
