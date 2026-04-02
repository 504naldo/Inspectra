/**
 * repairLetterRouter.ts
 * tRPC procedures for Repair Letter Tracking admin module.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc.js";
import * as db from "../db.js";

const repairLetterStatusEnum = z.enum([
  "not_started",
  "draft_needed",
  "drafted",
  "sent",
  "follow_up_needed",
  "completed",
  "closed",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) => keywords.some((k) => norm(h).includes(norm(k))));
}

export const repairLetterRouter = router({
  /** List repair letter tracking rows, enriched with site/customer/job names */
  listTracking: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        trackingPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        status: repairLetterStatusEnum.optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.getRepairLetterTrackingByCompany(input.companyId, input.trackingPeriod);

      let filtered = rows;
      if (input.status) filtered = filtered.filter((r) => r.repairLetterStatus === input.status);
      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.buildingId?.toLowerCase().includes(q) ||
            r.notes?.toLowerCase().includes(q)
        );
      }

      const siteIds = Array.from(new Set(filtered.map((r) => r.siteId)));
      const sites = await Promise.all(siteIds.map((id) => db.getSiteById(id)));
      const siteMap = Object.fromEntries(sites.filter(Boolean).map((s) => [s!.id, s!]));

      const orgIds = Array.from(new Set(filtered.map((r) => r.customerOrgId)));
      const orgs = await Promise.all(orgIds.map((id) => db.getCustomerOrgById(id)));
      const orgMap = Object.fromEntries(orgs.filter(Boolean).map((o) => [o!.id, o!]));

      const jobIds = filtered.map((r) => r.linkedJobId).filter((id): id is number => id !== null);
      const jobs = await Promise.all(jobIds.map((id) => db.getJobById(id)));
      const jobMap = Object.fromEntries(jobs.filter(Boolean).map((j) => [j!.id, j!]));

      return filtered.map((row) => ({
        ...row,
        siteName: siteMap[row.siteId]?.name ?? "Unknown",
        customerName: orgMap[row.customerOrgId]?.name ?? "Unknown",
        linkedJob: row.linkedJobId ? (jobMap[row.linkedJobId] ?? null) : null,
      }));
    }),

  /** Update a repair letter tracking row */
  updateTracking: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        repairLetterStatus: repairLetterStatusEnum.optional(),
        letterSentDate: z.string().optional(),
        followUpDate: z.string().optional(),
        deficiencyCount: z.number().int().nonnegative().optional(),
        assignedToUserId: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
        linkedJobId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await db.getRepairLetterTrackingById(input.id);
      if (!row || row.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, letterSentDate, followUpDate, ...rest } = input;
      await db.updateRepairLetterTracking(id, {
        ...rest,
        ...(letterSentDate !== undefined ? { letterSentDate: new Date(letterSentDate) } : {}),
        ...(followUpDate !== undefined ? { followUpDate: new Date(followUpDate) } : {}),
      });
      return { success: true };
    }),

  /** Preview a Repair Letter import XLSX — no DB writes */
  importPreview: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        trackingPeriod: z.string().regex(/^\d{4}-\d{2}$/),
        fileName: z.string(),
        fileData: z.string(), // base64
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const buffer = Buffer.from(input.fileData, "base64");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      if (rows.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Spreadsheet appears empty." });

      const headers = rows[0].map((h: any) => String(h ?? "").trim());
      const colBldg    = findCol(headers, "buildingid", "building id", "accountno", "account", "fileno", "file no", "file number");
      const colSite    = findCol(headers, "sitename", "site name", "building name", "location", "address");
      const colJob     = findCol(headers, "job", "job#", "jobnumber", "job number");
      const colDefs    = findCol(headers, "deficienc", "deficiency", "deficiencies");
      const colStatus  = findCol(headers, "status", "repair", "letter status");
      const colSent    = findCol(headers, "sent", "letter sent", "sentdate");
      const colFollowUp= findCol(headers, "followup", "follow up", "follow-up");
      const colNotes   = findCol(headers, "notes", "comments", "remarks");

      const allSites = await db.getSitesByCompany(input.companyId);
      const byBldg = new Map(allSites.filter((s) => s.buildingId).map((s) => [s.buildingId!.toLowerCase(), s]));
      const byName = new Map(allSites.map((s) => [s.name.toLowerCase(), s]));

      const previewRows = rows.slice(1).map((row, i) => {
        const rawBldg    = colBldg >= 0   ? String(row[colBldg] ?? "").trim()   : "";
        const rawSite    = colSite >= 0   ? String(row[colSite] ?? "").trim()   : "";
        const rawJob     = colJob >= 0    ? String(row[colJob] ?? "").trim()    : "";
        const rawDefs    = colDefs >= 0   ? String(row[colDefs] ?? "").trim()   : "";
        const rawStatus  = colStatus >= 0 ? String(row[colStatus] ?? "").trim() : "";
        const rawSent    = colSent >= 0   ? String(row[colSent] ?? "").trim()   : "";
        const rawFollowUp= colFollowUp >= 0 ? String(row[colFollowUp] ?? "").trim() : "";
        const notes      = colNotes >= 0  ? String(row[colNotes] ?? "").trim()  : "";

        if (!rawBldg && !rawSite) return null;

        let site = rawBldg ? byBldg.get(rawBldg.toLowerCase()) : undefined;
        let method = site ? "buildingId" : "none";
        if (!site && rawSite) {
          site = byName.get(rawSite.toLowerCase());
          if (!site) site = allSites.find((s) => s.name.toLowerCase().includes(rawSite.toLowerCase()) || rawSite.toLowerCase().includes(s.name.toLowerCase()));
          if (site) method = "siteName";
        }

        return {
          rowIndex: i + 2,
          rawBldg, rawSite, rawJob, rawDefs, rawStatus, rawSent, rawFollowUp, notes,
          matchStatus: site ? "matched" : "unmatched",
          matchMethod: method,
          matchedSiteId: site?.id ?? null,
          matchedSiteName: site?.name ?? null,
          matchedBuildingId: site?.buildingId ?? null,
          matchedCustomerOrgId: site?.customerOrgId ?? null,
        };
      }).filter(Boolean);

      const matched = previewRows.filter((r) => r!.matchStatus === "matched").length;
      return { previewRows, matched, unmatched: previewRows.length - matched, totalRows: previewRows.length };
    }),

  /** Execute import — write repair_letter_tracking rows */
  importExecute: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        trackingPeriod: z.string().regex(/^\d{4}-\d{2}$/),
        fileName: z.string(),
        fileData: z.string(),
        skipUnmatched: z.boolean().default(true),
        updateExisting: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const buffer = Buffer.from(input.fileData, "base64");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      if (rows.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Spreadsheet appears empty." });

      const headers = rows[0].map((h: any) => String(h ?? "").trim());
      const colBldg    = findCol(headers, "buildingid", "building id", "accountno", "account", "fileno", "file no", "file number");
      const colSite    = findCol(headers, "sitename", "site name", "building name", "location", "address");
      const colDefs    = findCol(headers, "deficienc", "deficiency", "deficiencies");
      const colSent    = findCol(headers, "sent", "letter sent", "sentdate");
      const colFollowUp= findCol(headers, "followup", "follow up", "follow-up");
      const colNotes   = findCol(headers, "notes", "comments", "remarks");

      const allSites = await db.getSitesByCompany(input.companyId);
      const byBldg = new Map(allSites.filter((s) => s.buildingId).map((s) => [s.buildingId!.toLowerCase(), s]));
      const byName = new Map(allSites.map((s) => [s.name.toLowerCase(), s]));

      const existing = await db.getRepairLetterTrackingByCompany(input.companyId, input.trackingPeriod);

      let created = 0, updated = 0, skipped = 0, errors = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawBldg  = colBldg >= 0 ? String(row[colBldg] ?? "").trim() : "";
        const rawSite  = colSite >= 0 ? String(row[colSite] ?? "").trim() : "";
        const rawDefs  = colDefs >= 0 ? String(row[colDefs] ?? "").trim() : "";
        const rawSent  = colSent >= 0 ? String(row[colSent] ?? "").trim() : "";
        const rawFU    = colFollowUp >= 0 ? String(row[colFollowUp] ?? "").trim() : "";
        const notes    = colNotes >= 0 ? String(row[colNotes] ?? "").trim() : "";

        if (!rawBldg && !rawSite) continue;

        let site = rawBldg ? byBldg.get(rawBldg.toLowerCase()) : undefined;
        if (!site && rawSite) {
          site = byName.get(rawSite.toLowerCase());
          if (!site) site = allSites.find((s) => s.name.toLowerCase().includes(rawSite.toLowerCase()) || rawSite.toLowerCase().includes(s.name.toLowerCase()));
        }

        if (!site) {
          if (input.skipUnmatched) { skipped++; continue; }
          errors++; continue;
        }

        const defCount = rawDefs ? parseInt(rawDefs, 10) || 0 : 0;
        const sentDate = rawSent ? (() => { const d = new Date(rawSent); return isNaN(d.getTime()) ? undefined : d; })() : undefined;
        const fuDate   = rawFU   ? (() => { const d = new Date(rawFU);   return isNaN(d.getTime()) ? undefined : d; })() : undefined;

        const dup = existing.find((r) => r.siteId === site!.id);

        if (dup) {
          if (input.updateExisting) {
            await db.updateRepairLetterTracking(dup.id, {
              deficiencyCount: defCount || dup.deficiencyCount,
              ...(sentDate ? { letterSentDate: sentDate } : {}),
              ...(fuDate   ? { followUpDate: fuDate }   : {}),
              notes: notes || dup.notes,
              buildingId: (rawBldg || site.buildingId) ?? undefined,
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        try {
          await db.createRepairLetterTracking({
            siteId: site.id,
            buildingId: (rawBldg || site.buildingId) ?? undefined,
            customerOrgId: site.customerOrgId,
            companyId: input.companyId,
            trackingPeriod: input.trackingPeriod,
            deficiencyCount: defCount,
            repairLetterStatus: "not_started",
            ...(sentDate ? { letterSentDate: sentDate } : {}),
            ...(fuDate   ? { followUpDate: fuDate }   : {}),
            notes: notes || undefined,
          });
          created++;
        } catch (err) {
          errors++;
        }
      }

      return { created, updated, skipped, errors };
    }),
});
