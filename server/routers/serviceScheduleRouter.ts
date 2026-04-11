/**
 * serviceScheduleRouter.ts
 *
 * tRPC procedures for the Monthly Service List / Service Scheduling module.
 *
 * Namespaces:
 *   serviceSchedule.schedules.*  – Long-term recurring service definitions
 *   serviceSchedule.tracking.*   – Monthly admin tracking sheet
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc.js";
import * as db from "../db.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format today's month as YYYY-MM */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Normalize a header string for fuzzy matching — strip all non-alphanumeric chars */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Normalize a building ID for site matching.
 * Strips non-alphanumeric chars AND leading zeros for purely numeric IDs,
 * so "#0007" → "7", "0007" → "7", "7" → "7" all match each other.
 */
const normBldg = (s: string): string => {
  const a = norm(s);
  return /^\d+$/.test(a) ? String(parseInt(a, 10)) : a;
};

/** Find the first column whose normalised header matches any of the given keywords */
function findCol(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) => keywords.some((k) => norm(h).includes(norm(k))));
}

// ─── Shared zod types ─────────────────────────────────────────────────────────

const trackingStatusEnum = z.enum([
  "not_scheduled",
  "scheduled",
  "in_progress",
  "completed",
  "report_pending",
  "rescheduled",
  "overdue",
]);

const reportStatusEnum = z.enum(["none", "pending", "generated", "sent"]);

/** Optional column-index overrides — -1 means "not present" */
const colOverridesSchema = z.object({
  buildingId:  z.number().int().min(-1).optional(),
  siteName:    z.number().int().min(-1).optional(),
  serviceType: z.number().int().min(-1).optional(),
  targetDate:  z.number().int().min(-1).optional(),
  notes:       z.number().int().min(-1).optional(),
}).optional();

// ─── Router ───────────────────────────────────────────────────────────────────

export const serviceScheduleRouter = router({
  // ── Service Schedules ─────────────────────────────────────────────────────

  /** List all active service schedule definitions for a company */
  listSchedules: officeProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getServiceSchedulesByCompany(input.companyId);
    }),

  /** Create a service schedule definition */
  createSchedule: officeProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        serviceType: z.string().min(1).max(100),
        frequency: z.enum(["monthly", "quarterly", "semi_annual", "annual", "other"]),
        estimatedHours: z.number().nonnegative().optional(),
        requiredTechCount: z.number().int().positive().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const site = await db.getSiteById(input.siteId);
      if (!site || site.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.createServiceSchedule({
        siteId: input.siteId,
        buildingId: site.buildingId ?? undefined,
        customerOrgId: site.customerOrgId,
        companyId: site.companyId,
        serviceType: input.serviceType,
        frequency: input.frequency,
        estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : undefined,
        requiredTechCount: input.requiredTechCount,
        notes: input.notes,
        active: true,
      });
    }),

  /** Update a service schedule definition (or deactivate it) */
  updateSchedule: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        serviceType: z.string().max(100).optional(),
        frequency: z.enum(["monthly", "quarterly", "semi_annual", "annual", "other"]).optional(),
        estimatedHours: z.number().nonnegative().optional(),
        requiredTechCount: z.number().int().positive().optional(),
        active: z.boolean().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getServiceScheduleById(input.id);
      if (!existing || existing.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, estimatedHours, ...rest } = input;
      await db.updateServiceSchedule(id, {
        ...rest,
        ...(estimatedHours != null ? { estimatedHours: String(estimatedHours) } : {}),
      });
      return { success: true };
    }),

  // ── Monthly Tracking ──────────────────────────────────────────────────────

  /**
   * List monthly tracking rows for a company.
   * Optionally filter by trackingMonth, status, or search string.
   */
  listTracking: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        trackingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        status: trackingStatusEnum.optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const rows = await db.getMonthlyTrackingByCompany(input.companyId, input.trackingMonth);

      // Apply optional filters in-memory (small datasets)
      let filtered = rows;
      if (input.status) filtered = filtered.filter((r) => r.status === input.status);
      if (input.search) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.buildingId?.toLowerCase().includes(q) ||
            r.serviceType.toLowerCase().includes(q) ||
            r.notes?.toLowerCase().includes(q)
        );
      }

      // Enrich each row with site + customer names
      const siteIds = Array.from(new Set(filtered.map((r) => r.siteId)));
      const sites = await Promise.all(siteIds.map((id) => db.getSiteById(id)));
      const siteMap = Object.fromEntries(sites.filter(Boolean).map((s) => [s!.id, s!]));

      const orgIds = Array.from(new Set(filtered.map((r) => r.customerOrgId)));
      const orgs = await Promise.all(orgIds.map((id) => db.getCustomerOrgById(id)));
      const orgMap = Object.fromEntries(orgs.filter(Boolean).map((o) => [o!.id, o!]));

      // Enrich with linked job data
      const jobIds = filtered.map((r) => r.linkedJobId).filter((id): id is number => id !== null);
      const jobs = await Promise.all(jobIds.map((id) => db.getJobById(id)));
      const jobMap = Object.fromEntries(jobs.filter(Boolean).map((j) => [j!.id, j!]));

      return filtered.map((row) => ({
        ...row,
        siteName: siteMap[row.siteId]?.name ?? "Unknown",
        customerName: orgMap[row.customerOrgId]?.name ?? "Unknown",
        linkedJob: row.linkedJobId ? jobMap[row.linkedJobId] ?? null : null,
      }));
    }),

  /** Update a tracking row's fields (status, dates, notes, etc.) */
  updateTracking: officeProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: trackingStatusEnum.optional(),
        targetDate: z.string().optional(),    // ISO date string
        scheduledDate: z.string().optional(), // ISO date string
        plannedHours: z.number().nonnegative().optional(),
        reportStatus: reportStatusEnum.optional(),
        deficiencyCount: z.number().int().nonnegative().optional(),
        rescheduleReason: z.string().max(1000).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await db.getMonthlyTrackingById(input.id);
      if (!row || row.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, targetDate, scheduledDate, plannedHours, ...rest } = input;
      await db.updateMonthlyTracking(id, {
        ...rest,
        ...(targetDate !== undefined ? { targetDate: new Date(targetDate) } : {}),
        ...(scheduledDate !== undefined ? { scheduledDate: new Date(scheduledDate) } : {}),
        ...(plannedHours != null ? { plannedHours: String(plannedHours) } : {}),
      });
      return { success: true };
    }),

  /**
   * Create a job from a tracking row.
   * Sets status→scheduled and linkedJobId on the tracking row.
   */
  createJobFromTracking: officeProcedure
    .input(
      z.object({
        trackingId: z.number().int().positive(),
        scheduledDate: z.string().optional(), // ISO date string override
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await db.getMonthlyTrackingById(input.trackingId);
      if (!row || row.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (row.linkedJobId) throw new TRPCError({ code: "CONFLICT", message: "A job is already linked to this tracking row." });

      const site = await db.getSiteById(row.siteId);
      const customer = await db.getCustomerOrgById(row.customerOrgId);
      if (!site || !customer) throw new TRPCError({ code: "NOT_FOUND", message: "Site or customer not found." });

      // Map serviceType / frequency to jobType
      const jobTypeMap: Record<string, string> = {
        annual: "annual",
        semi_annual: "semi_annual",
        quarterly: "quarterly",
        monthly: "monthly",
      };

      const sched = await db.getServiceScheduleById(row.serviceScheduleId ?? 0);
      const jobType = (jobTypeMap[sched?.frequency ?? ""] ?? "annual") as any;

      const scheduledDateParsed = input.scheduledDate
        ? new Date(input.scheduledDate)
        : (row.scheduledDate ?? undefined);

      const jobNumber = `JOB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      const job = await db.createJob({
        companyId: row.companyId,
        siteId: row.siteId,
        customerOrgId: row.customerOrgId,
        jobNumber,
        title: `${row.serviceType} — ${site.name}`,
        description: input.notes ?? row.notes ?? undefined,
        jobType,
        status: scheduledDateParsed ? "scheduled" : "pending",
        priority: "medium",
        scheduledDate: scheduledDateParsed,
      });

      // Link back to the tracking row
      await db.updateMonthlyTracking(row.id, {
        linkedJobId: job.id,
        status: "scheduled",
        ...(scheduledDateParsed ? { scheduledDate: scheduledDateParsed } : {}),
      });

      return { jobId: job.id, jobNumber };
    }),

  // ── Import ─────────────────────────────────────────────────────────────────

  /**
   * Parse file headers + auto-detect column indices.
   * Called immediately after file selection, before the mapping step.
   */
  parseHeaders: officeProcedure
    .input(z.object({
      companyId:       z.number().int().positive(),
      fileName:        z.string(),
      fileData:        z.string(), // base64
      headerRowIndex:  z.number().int().min(0).max(20).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const buffer = Buffer.from(input.fileData, "base64");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "File appears empty." });

      // Return up to 5 raw rows so the UI can let the user pick which one is the header
      const rawPreviewRows = rows.slice(0, 5).map((r) =>
        r.map((c: any) => String(c ?? "").trim())
      );

      const hi = Math.min(input.headerRowIndex, rows.length - 1);
      const headers = rows[hi].map((h: any) => String(h ?? "").trim());
      return {
        headers,
        rawPreviewRows,
        rowCount: rows.length - hi - 1,
        detected: {
          buildingId:  findCol(headers, "file", "buildingid", "accountno", "account", "fileno", "filenumber", "bldg", "building", "acct"),
          siteName:    findCol(headers, "sitename", "buildingname", "location", "address", "property", "site", "name"),
          serviceType: findCol(headers, "servicetype", "service", "type", "inspection"),
          targetDate:  findCol(headers, "targetdate", "duedate", "scheduled", "date"),
          notes:       findCol(headers, "notes", "comments", "remarks"),
        },
      };
    }),

  /**
   * Parse a Monthly Service List spreadsheet and return a preview.
   * Matches rows to sites by buildingId (primary) or site name (fallback).
   * Returns preview rows with match status — no DB writes yet.
   */
  importPreview: officeProcedure
    .input(
      z.object({
        companyId:      z.number().int().positive(),
        trackingMonth:  z.string().regex(/^\d{4}-\d{2}$/),
        fileName:       z.string(),
        fileData:       z.string(), // base64
        colOverrides:   colOverridesSchema,
        headerRowIndex: z.number().int().min(0).max(20).default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const buffer = Buffer.from(input.fileData, "base64");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Spreadsheet appears empty." });

      const hi = Math.min(input.headerRowIndex, rows.length - 1);
      const headers = rows[hi].map((h: any) => String(h ?? "").trim());

      // Column detection — use caller overrides if provided, otherwise auto-detect
      const ov = input.colOverrides ?? {};
      const colBuildingId = ov.buildingId  ?? findCol(headers, "file", "buildingid", "accountno", "account", "fileno", "filenumber", "bldg", "building", "acct");
      const colSiteName   = ov.siteName    ?? findCol(headers, "sitename", "buildingname", "location", "address", "property", "site", "name");
      const colCustomer   =                   findCol(headers, "customer", "client", "org", "company");
      const colServiceType= ov.serviceType ?? findCol(headers, "servicetype", "service", "type", "inspection");
      const colFrequency  =                   findCol(headers, "frequency", "freq");
      const colTargetDate = ov.targetDate  ?? findCol(headers, "targetdate", "duedate", "scheduled", "date");
      const colNotes      = ov.notes       ?? findCol(headers, "notes", "comments", "remarks");

      // Fetch all sites for this company once
      const allSites = await db.getSitesByCompany(input.companyId);
      const siteByBuildingId = new Map(
        allSites.filter((s) => s.buildingId).map((s) => [normBldg(s.buildingId!), s])
      );
      const siteByName = new Map(allSites.map((s) => [s.name.toLowerCase(), s]));

      const previewRows = rows.slice(hi + 1).map((row, i) => {
        const rawBuildingId = colBuildingId >= 0 ? String(row[colBuildingId] ?? "").trim() : "";
        const rawSiteName   = colSiteName >= 0   ? String(row[colSiteName] ?? "").trim()   : "";
        const serviceType   = colServiceType >= 0 ? String(row[colServiceType] ?? "").trim() : "Annual Inspection";
        const frequency     = colFrequency >= 0  ? String(row[colFrequency] ?? "").trim()  : "";
        const targetDate    = colTargetDate >= 0  ? String(row[colTargetDate] ?? "").trim()  : "";
        const notes         = colNotes >= 0       ? String(row[colNotes] ?? "").trim()       : "";
        const customer      = colCustomer >= 0    ? String(row[colCustomer] ?? "").trim()    : "";

        if (!rawBuildingId && !rawSiteName && !serviceType) {
          return null; // blank row
        }

        // Match
        let matchedSite = rawBuildingId
          ? siteByBuildingId.get(normBldg(rawBuildingId))
          : undefined;
        let matchMethod = matchedSite ? "buildingId" : "none";

        if (!matchedSite && rawSiteName) {
          matchedSite = siteByName.get(rawSiteName.toLowerCase());
          if (!matchedSite) {
            // partial match
            matchedSite = allSites.find((s) =>
              s.name.toLowerCase().includes(rawSiteName.toLowerCase()) ||
              rawSiteName.toLowerCase().includes(s.name.toLowerCase())
            );
          }
          if (matchedSite) matchMethod = "siteName";
        }

        return {
          rowIndex: i + 2, // 1-based, header is row 1
          rawBuildingId,
          rawSiteName,
          serviceType,
          frequency,
          targetDate,
          customer,
          notes,
          matchStatus: matchedSite ? "matched" : "unmatched",
          matchMethod,
          matchedSiteId: matchedSite?.id ?? null,
          matchedSiteName: matchedSite?.name ?? null,
          matchedBuildingId: matchedSite?.buildingId ?? null,
          matchedCustomerOrgId: matchedSite?.customerOrgId ?? null,
        };
      }).filter(Boolean);

      const matched = previewRows.filter((r) => r!.matchStatus === "matched").length;
      const unmatched = previewRows.filter((r) => r!.matchStatus === "unmatched").length;

      return {
        previewRows,
        matched,
        unmatched,
        totalRows: previewRows.length,
        trackingMonth: input.trackingMonth,
        headers,
        usedCols: { buildingId: colBuildingId, siteName: colSiteName, serviceType: colServiceType, targetDate: colTargetDate, notes: colNotes },
      };
    }),

  /**
   * Execute the import — create monthly_service_tracking rows.
   * Skips rows where status=unmatched unless skipUnmatched=true (default true).
   * Skips duplicates (same siteId + serviceType + trackingMonth).
   */
  importExecute: officeProcedure
    .input(
      z.object({
        companyId:      z.number().int().positive(),
        trackingMonth:  z.string().regex(/^\d{4}-\d{2}$/),
        fileName:       z.string(),
        fileData:       z.string(), // base64
        skipUnmatched:  z.boolean().default(true),
        updateExisting: z.boolean().default(false),
        colOverrides:   colOverridesSchema,
        headerRowIndex: z.number().int().min(0).max(20).default(0),
        /** Manual site assignments for rows that couldn't be auto-matched */
        manualMappings: z.array(z.object({
          rawBuildingId: z.string(),
          siteId:        z.number().int().positive(),
        })).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const buffer = Buffer.from(input.fileData, "base64");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Spreadsheet appears empty." });

      const hi = Math.min(input.headerRowIndex, rows.length - 1);
      const headers = rows[hi].map((h: any) => String(h ?? "").trim());
      const ov = input.colOverrides ?? {};
      const colBuildingId = ov.buildingId  ?? findCol(headers, "file#", "file #", "buildingid", "building id", "accountno", "account", "fileno", "file no", "file number", "bldg", "building", "acct", "file", "id");
      const colSiteName   = ov.siteName    ?? findCol(headers, "sitename", "site name", "building name", "location", "address", "property", "site", "building", "name");
      const colServiceType= ov.serviceType ?? findCol(headers, "service type", "servicetype", "service", "type", "inspection");
      const colFrequency  =                   findCol(headers, "frequency", "freq");
      const colTargetDate = ov.targetDate  ?? findCol(headers, "targetdate", "target date", "due date", "scheduled", "date");
      const colNotes      = ov.notes       ?? findCol(headers, "notes", "comments", "remarks");

      const allSites = await db.getSitesByCompany(input.companyId);
      const siteByBuildingId = new Map(
        allSites.filter((s) => s.buildingId).map((s) => [normBldg(s.buildingId!), s])
      );
      const siteByName = new Map(allSites.map((s) => [s.name.toLowerCase(), s]));

      // Build manual mapping lookup (user-provided overrides for unmatched building IDs)
      const manualMap = new Map<string, typeof allSites[0]>();
      for (const m of input.manualMappings) {
        const site = allSites.find((s) => s.id === m.siteId);
        if (site) {
          manualMap.set(normBldg(m.rawBuildingId), site);
          // Persist the building ID onto the site so future imports auto-match
          if (!site.buildingId && m.rawBuildingId) {
            await db.updateSite(site.id, { buildingId: m.rawBuildingId });
          }
        }
      }

      // Fetch existing rows for this month to detect duplicates
      const existingRows = await db.getMonthlyTrackingByCompany(input.companyId, input.trackingMonth);

      let created = 0, skipped = 0, updated = 0, errors = 0;
      const rowResults: Array<{ row: number; status: string; message?: string }> = [];

      for (let i = hi + 1; i < rows.length; i++) {
        const row = rows[i];
        const rawBuildingId = colBuildingId >= 0 ? String(row[colBuildingId] ?? "").trim() : "";
        const rawSiteName   = colSiteName >= 0   ? String(row[colSiteName] ?? "").trim()   : "";
        const serviceType   = colServiceType >= 0 ? String(row[colServiceType] ?? "").trim() : "Annual Inspection";
        const frequency     = colFrequency >= 0  ? String(row[colFrequency] ?? "").trim()  : "";
        const rawTargetDate = colTargetDate >= 0  ? String(row[colTargetDate] ?? "").trim()  : "";
        const notes         = colNotes >= 0       ? String(row[colNotes] ?? "").trim()       : "";

        if (!rawBuildingId && !rawSiteName && !serviceType) continue; // blank

        let matchedSite = rawBuildingId ? siteByBuildingId.get(normBldg(rawBuildingId)) : undefined;
        // Fall back to manual mapping if auto-match failed
        if (!matchedSite && rawBuildingId) matchedSite = manualMap.get(normBldg(rawBuildingId));
        if (!matchedSite && rawSiteName) {
          matchedSite = siteByName.get(rawSiteName.toLowerCase());
          if (!matchedSite) {
            matchedSite = allSites.find((s) =>
              s.name.toLowerCase().includes(rawSiteName.toLowerCase()) ||
              rawSiteName.toLowerCase().includes(s.name.toLowerCase())
            );
          }
        }

        if (!matchedSite) {
          if (input.skipUnmatched) {
            skipped++;
            rowResults.push({ row: i + 1, status: "skipped", message: "No matching site found" });
            continue;
          }
          errors++;
          rowResults.push({ row: i + 1, status: "error", message: "No matching site found" });
          continue;
        }

        // Parse target date
        let targetDate: string | undefined;
        if (rawTargetDate) {
          const parsed = new Date(rawTargetDate);
          if (!isNaN(parsed.getTime())) targetDate = parsed.toISOString().slice(0, 10);
        }

        // Map frequency to enum
        const freqMap: Record<string, string> = {
          monthly: "monthly", month: "monthly",
          quarterly: "quarterly", quarter: "quarterly",
          "semi-annual": "semi_annual", "semi annual": "semi_annual", semiannual: "semi_annual",
          annual: "annual", yearly: "annual",
        };
        const normalizedFreq = (freqMap[frequency.toLowerCase()] ?? "annual") as any;

        // Check for duplicate
        const duplicate = existingRows.find(
          (r) => r.siteId === matchedSite!.id && r.serviceType === serviceType
        );

        if (duplicate) {
          if (input.updateExisting) {
            await db.updateMonthlyTracking(duplicate.id, {
              ...(targetDate ? { targetDate: new Date(targetDate) } : {}),
              notes: notes || duplicate.notes,
              buildingId: (rawBuildingId || matchedSite.buildingId) ?? undefined,
            });
            updated++;
            rowResults.push({ row: i + 1, status: "updated" });
          } else {
            skipped++;
            rowResults.push({ row: i + 1, status: "skipped", message: "Duplicate row" });
          }
          continue;
        }

        try {
          await db.createMonthlyTracking({
            siteId: matchedSite.id,
            buildingId: (rawBuildingId || matchedSite.buildingId) ?? undefined,
            customerOrgId: matchedSite.customerOrgId,
            companyId: input.companyId,
            trackingMonth: input.trackingMonth,
            serviceType,
            ...(targetDate ? { targetDate: new Date(targetDate) } : {}),
            status: "not_scheduled",
            reportStatus: "none",
            notes: notes || undefined,
          });
          created++;
          rowResults.push({ row: i + 1, status: "created" });
        } catch (err) {
          errors++;
          rowResults.push({ row: i + 1, status: "error", message: String(err) });
        }
      }

      return { created, updated, skipped, errors, rowResults };
    }),
});
