import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { safeXlsxRead } from "../_core/safeXlsxRead";
import type { WorkBook } from "xlsx";

const PARTS_SHEET = "Parts List";
const PARTS_DATA_START = 4; // 0-based index (row 5 in Excel)
const PARTS_DATA_END = 283;  // inclusive 0-based index (row 284 in Excel)

const COL_CATEGORY   = 0; // A
const COL_NAME       = 1; // B
const COL_PRICE      = 4; // E
const COL_LABOUR     = 7; // H
const COL_DESC       = 8; // I

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export const importCenterRouter = router({
  /**
   * Return counts and last-import info for each import type supported by the Import Center.
   */
  getOverview: officeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const [partsCatalog, importLogs] = await Promise.all([
      db.getPartsCatalogByCompany(companyId, true),
      db.getImportLogsByCompany(companyId),
    ]);

    const logsMap: Record<string, (typeof importLogs)[0] | undefined> = {};
    for (const log of importLogs) {
      const t = log.importType as string;
      if (!logsMap[t] || (log.completedAt && (!logsMap[t]!.completedAt || log.completedAt > logsMap[t]!.completedAt!))) {
        logsMap[t] = log;
      }
    }

    return {
      partsCatalog: {
        count: partsCatalog.length,
        lastImport: logsMap["parts_catalog"] ?? null,
      },
      devices: {
        count: null as number | null, // queried on demand
        lastImport: logsMap["devices"] ?? null,
      },
      sites: {
        count: null as number | null,
        lastImport: logsMap["sites"] ?? null,
      },
      areas: {
        count: null as number | null,
        lastImport: logsMap["areas"] ?? null,
      },
      customers: {
        count: null as number | null,
        lastImport: logsMap["customers"] ?? null,
      },
    };
  }),

  /**
   * Recent import log history.
   */
  getRecentLogs: officeProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const logs = await db.getImportLogsByCompany(ctx.user.companyId!);
      return logs.slice(0, input.limit);
    }),

  /**
   * Parse a Parts Catalog XLSX file (base64) and return structured rows
   * ready to pass directly to partsCatalog.importPreview / importExecute.
   *
   * Expected format:
   *   Sheet:   "Parts List"  (fallback: first sheet)
   *   Row 5+:  data rows
   *   Col A:   category
   *   Col B:   productName
   *   Col E:   unitPrice
   *   Col H:   defaultLabourHours
   *   Col I:   description
   */
  parsePartsCatalogFile: officeProcedure
    .input(z.object({
      fileData: z.string().min(1), // base64
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      if (buffer.length < 512) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File is too small or empty." });
      }

      const XLSX = await import("xlsx");
      let workbook: WorkBook;
      try {
        workbook = await safeXlsxRead(new Uint8Array(buffer), { type: "array" });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse file. Ensure it is a valid .xlsx workbook." });
      }

      const sheetName = workbook.SheetNames.includes(PARTS_SHEET)
        ? PARTS_SHEET
        : workbook.SheetNames[0];

      if (!sheetName) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Workbook contains no sheets." });
      }

      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      const dataRows = rows.slice(PARTS_DATA_START, PARTS_DATA_END + 1);

      const seen = new Set<string>();
      const parsed: Array<{
        category: string;
        productName: string;
        unitPrice: number;
        defaultLabourHours: number;
        description: string | null;
        taxableGst: boolean;
        taxablePst: boolean;
        _rowIndex: number;
        _dupWithin: boolean;
      }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const category    = cellStr(row[COL_CATEGORY]);
        const productName = cellStr(row[COL_NAME]);

        if (!category && !productName) continue;
        if (!category || !productName) continue; // need both for valid record

        const key = `${norm(category)}|${norm(productName)}`;
        const dupWithin = seen.has(key);
        seen.add(key);

        parsed.push({
          category,
          productName,
          unitPrice:           cellNum(row[COL_PRICE]),
          defaultLabourHours:  cellNum(row[COL_LABOUR]),
          description:         cellStr(row[COL_DESC]) || null,
          taxableGst:          true,
          taxablePst:          true,
          _rowIndex:           PARTS_DATA_START + i + 1, // 1-based Excel row
          _dupWithin:          dupWithin,
        });
      }

      return {
        sheetUsed: sheetName,
        totalScanned: dataRows.length,
        parsed,
        dupWithinCount: parsed.filter((r) => r._dupWithin).length,
      };
    }),
});
