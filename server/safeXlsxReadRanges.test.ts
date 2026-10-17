import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { safeXlsxRead } from "./_core/safeXlsxRead";

function withDeclaredRange(range: string, sheets = 1): Buffer {
  const workbook = XLSX.utils.book_new();
  for (let i = 0; i < sheets; i += 1) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Value"], ["data"]]), `Sheet${i + 1}`);
  }
  const zip = new AdmZip(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  for (const entry of zip.getEntries()) {
    if (!/^xl\/worksheets\/sheet[0-9]+\.xml$/.test(entry.entryName)) continue;
    zip.updateFile(entry.entryName, Buffer.from(entry.getData().toString().replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${range}"/>`)));
  }
  return zip.toBuffer();
}

describe("Excel worksheet ranges stay bounded before main-thread conversion", () => {
  it("rejects a sparse workbook declaring billions of empty cells", async () => {
    await expect(safeXlsxRead(withDeclaredRange("A1:XFD1048576"), { type: "buffer" })).rejects.toThrow("ranges are too large");
  });

  it("applies the cell budget across worksheets, including sparse ranges", async () => {
    await expect(safeXlsxRead(withDeclaredRange("A1:Z20000", 2), { type: "buffer" })).rejects.toThrow("ranges are too large");
  });

  it("preserves ordinary sparse worksheets for existing import consumers", async () => {
    const workbook = await safeXlsxRead(withDeclaredRange("A1:Z100"), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1)).toEqual([{ Value: "data" }]);
  });

  it("rejects excessive sheet counts without returning them to import consumers", async () => {
    await expect(safeXlsxRead(withDeclaredRange("A1:A2", 101), { type: "buffer" })).rejects.toThrow("too many worksheets");
  });
});
