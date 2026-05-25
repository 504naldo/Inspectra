/**
 * scripts/auditSiteDependencies.ts
 *
 * READ-ONLY audit of per-site dependency counts.
 *
 * For each site in the company, reports how many dependent records exist across
 * all tables that reference siteId (directly or via jobs). Sites with zero
 * dependencies across all tables are candidates for review/deletion — but only
 * after manual confirmation.
 *
 * This script never modifies any data.
 *
 * Usage:
 *   DATABASE_URL=mysql://... pnpm audit:site-dependencies -- --company 1
 *
 * Optional flags:
 *   --company N          Company ID (default: 1)
 *   --customer-org N     Restrict to one customerOrg
 *   --show-all           Print every site, not just orphaned ones
 *   --output-json        Write full report → data/exports/site-dependency-audit.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";

config();

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {
    companyId: 1,
    customerOrgId: undefined as number | undefined,
    showAll: false,
    outputJson: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":      args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org": args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--show-all":     args.showAll = true; break;
      case "--output-json":  args.outputJson = true; break;
      default:
        if (argv[i].startsWith("--")) { console.error(`Unknown option: ${argv[i]}`); process.exit(1); }
    }
  }
  return args;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function ensureExportsDir() {
  mkdirSync("data/exports", { recursive: true });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface SiteDependencySummary {
  siteId: number;
  siteName: string;
  fileNumber: string | null;
  buildingId: string | null;
  customerOrgId: number;
  devices: number;
  jobs: number;
  workOrders: number;
  approvedWork: number;
  invoices: number;
  serviceSchedules: number;
  monthlyTracking: number;
  areas: number;
  wsi: number;
  contacts: number;
  attachments: number;
  assetEvents: number;
  agreementLinks: number;
  repairLetters: number;
  totalDependencies: number;
}

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("ERROR: DATABASE_URL is not set."); process.exit(1); }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Site Dependency Audit (READ-ONLY)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company    : ${args.companyId}`);
  if (args.customerOrgId) console.log(`  org filter : ${args.customerOrgId}`);
  console.log();

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Load all sites ─────────────────────────────────────────────────────────
  const siteFilter = args.customerOrgId !== undefined
    ? and(
        eq(schema.sites.companyId, args.companyId),
        eq(schema.sites.customerOrgId, args.customerOrgId)
      )
    : eq(schema.sites.companyId, args.companyId);

  const allSites = await db
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      fileNumber: schema.sites.fileNumber,
      buildingId: schema.sites.buildingId,
      customerOrgId: schema.sites.customerOrgId,
    })
    .from(schema.sites)
    .where(siteFilter);

  if (allSites.length === 0) {
    console.log("No sites found for this company.");
    return;
  }

  console.log(`Loaded ${allSites.length} sites. Counting dependencies...\n`);

  const siteIds = allSites.map(s => s.id);

  // ── Batch-count all dependency tables ─────────────────────────────────────
  // We use GROUP BY siteId counts for efficiency

  async function countBySite(
    table: typeof schema.devices | typeof schema.jobs | typeof schema.workOrders |
           typeof schema.approvedWork | typeof schema.invoices | typeof schema.serviceSchedules |
           typeof schema.monthlyServiceTracking | typeof schema.areas |
           typeof schema.customerContacts | typeof schema.attachments |
           typeof schema.assetLifecycleEvents | typeof schema.agreementSites |
           typeof schema.repairLetterTracking | typeof schema.siteWorkSiteInfo,
    siteCol: "siteId",
  ): Promise<Map<number, number>> {
    const rows = await db
      .select({
        siteId: (table as any)[siteCol] as typeof schema.sites.id,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(table as any)
      .where(inArray((table as any)[siteCol], siteIds))
      .groupBy((table as any)[siteCol]);

    const map = new Map<number, number>();
    for (const r of rows) map.set(r.siteId, r.count);
    return map;
  }

  const [
    deviceCounts,
    jobCounts,
    workOrderCounts,
    approvedWorkCounts,
    invoiceCounts,
    scheduleCounts,
    trackingCounts,
    areaCounts,
    contactCounts,
    attachmentCounts,
    assetEventCounts,
    agreementCounts,
    repairLetterCounts,
    wsiCounts,
  ] = await Promise.all([
    countBySite(schema.devices, "siteId"),
    countBySite(schema.jobs, "siteId"),
    countBySite(schema.workOrders, "siteId"),
    countBySite(schema.approvedWork, "siteId"),
    countBySite(schema.invoices, "siteId"),
    countBySite(schema.serviceSchedules, "siteId"),
    countBySite(schema.monthlyServiceTracking, "siteId"),
    countBySite(schema.areas, "siteId"),
    countBySite(schema.customerContacts, "siteId"),
    countBySite(schema.attachments, "siteId"),
    countBySite(schema.assetLifecycleEvents, "siteId"),
    countBySite(schema.agreementSites, "siteId"),
    countBySite(schema.repairLetterTracking, "siteId"),
    countBySite(schema.siteWorkSiteInfo, "siteId"),
  ]);

  // ── Build summary ─────────────────────────────────────────────────────────
  const summaries: SiteDependencySummary[] = allSites.map(site => {
    const devices        = deviceCounts.get(site.id) ?? 0;
    const jobs           = jobCounts.get(site.id) ?? 0;
    const workOrders     = workOrderCounts.get(site.id) ?? 0;
    const approvedWork   = approvedWorkCounts.get(site.id) ?? 0;
    const invoices       = invoiceCounts.get(site.id) ?? 0;
    const serviceSchedules = scheduleCounts.get(site.id) ?? 0;
    const monthlyTracking  = trackingCounts.get(site.id) ?? 0;
    const areas          = areaCounts.get(site.id) ?? 0;
    const wsi            = wsiCounts.get(site.id) ?? 0;
    const contacts       = contactCounts.get(site.id) ?? 0;
    const attachments    = attachmentCounts.get(site.id) ?? 0;
    const assetEvents    = assetEventCounts.get(site.id) ?? 0;
    const agreementLinks = agreementCounts.get(site.id) ?? 0;
    const repairLetters  = repairLetterCounts.get(site.id) ?? 0;

    const totalDependencies =
      devices + jobs + workOrders + approvedWork + invoices +
      serviceSchedules + monthlyTracking + areas + wsi + contacts +
      attachments + assetEvents + agreementLinks + repairLetters;

    return {
      siteId: site.id,
      siteName: site.name,
      fileNumber: site.fileNumber,
      buildingId: site.buildingId,
      customerOrgId: site.customerOrgId,
      devices, jobs, workOrders, approvedWork, invoices,
      serviceSchedules, monthlyTracking, areas, wsi, contacts,
      attachments, assetEvents, agreementLinks, repairLetters,
      totalDependencies,
    };
  });

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const withDevices          = summaries.filter(s => s.devices > 0).length;
  const withJobs             = summaries.filter(s => s.jobs > 0).length;
  const withWorkOrders       = summaries.filter(s => s.workOrders > 0).length;
  const withInvoices         = summaries.filter(s => s.invoices > 0).length;
  const withSchedules        = summaries.filter(s => s.serviceSchedules > 0).length;
  const withWsi              = summaries.filter(s => s.wsi > 0).length;
  const withContacts         = summaries.filter(s => s.contacts > 0).length;
  const withAttachments      = summaries.filter(s => s.attachments > 0).length;
  const orphaned             = summaries.filter(s => s.totalDependencies === 0);

  const line = "─".repeat(60);

  console.log(`${line}`);
  console.log("  SUMMARY");
  console.log(line);
  console.log(`  ${pad("Total sites:", 40)} ${allSites.length}`);
  console.log(`  ${pad("Sites with devices:", 40)} ${withDevices}`);
  console.log(`  ${pad("Sites with jobs:", 40)} ${withJobs}`);
  console.log(`  ${pad("Sites with work orders:", 40)} ${withWorkOrders}`);
  console.log(`  ${pad("Sites with invoices:", 40)} ${withInvoices}`);
  console.log(`  ${pad("Sites with service schedules:", 40)} ${withSchedules}`);
  console.log(`  ${pad("Sites with WSI records:", 40)} ${withWsi}`);
  console.log(`  ${pad("Sites with contacts:", 40)} ${withContacts}`);
  console.log(`  ${pad("Sites with attachments:", 40)} ${withAttachments}`);
  console.log();
  console.log(`  ${pad("Sites with NO dependencies (review candidates):", 40)} ${orphaned.length}`);

  if (orphaned.length > 0) {
    console.log(`\n${line}`);
    console.log(`  SITES WITH NO DEPENDENCIES (${orphaned.length})`);
    console.log(`  These sites have zero devices, jobs, work orders, schedules,`);
    console.log(`  WSI, contacts, attachments, or any other dependent records.`);
    console.log(`  They MAY be safe to delete — verify manually before acting.`);
    console.log(line);
    for (const s of orphaned) {
      const fn = s.fileNumber ? `  file#=${s.fileNumber}` : "";
      const bi = s.buildingId ? `  bldg=${s.buildingId}` : "";
      console.log(`  siteId=${String(s.siteId).padEnd(5)} org=${s.customerOrgId}${fn}${bi}  "${s.siteName}"`);
    }
  }

  // ── Verbose / show-all mode ────────────────────────────────────────────────
  if (args.showAll) {
    console.log(`\n${line}`);
    console.log(`  ALL SITES — DEPENDENCY COUNTS`);
    console.log(line);
    console.log(
      `  ${"ID".padEnd(6)} ${"FILE#".padEnd(8)} ` +
      `${"DEV".padEnd(5)} ${"JOB".padEnd(5)} ${"WO".padEnd(5)} ${"INV".padEnd(5)} ` +
      `${"SCH".padEnd(5)} ${"WSI".padEnd(5)} ${"CNT".padEnd(5)} NAME`
    );
    for (const s of summaries) {
      console.log(
        `  ${String(s.siteId).padEnd(6)} ${(s.fileNumber ?? "—").padEnd(8)} ` +
        `${String(s.devices).padEnd(5)} ${String(s.jobs).padEnd(5)} ` +
        `${String(s.workOrders).padEnd(5)} ${String(s.invoices).padEnd(5)} ` +
        `${String(s.serviceSchedules).padEnd(5)} ${String(s.wsi).padEnd(5)} ` +
        `${String(s.contacts).padEnd(5)} "${s.siteName}"`
      );
    }
  }

  // ── JSON output ─────────────────────────────────────────────────────────────
  if (args.outputJson) {
    ensureExportsDir();
    const path = "data/exports/site-dependency-audit.json";
    writeFileSync(path, JSON.stringify({
      companyId: args.companyId,
      generatedAt: new Date().toISOString(),
      totalSites: allSites.length,
      orphanedSites: orphaned.length,
      summaries,
    }, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  console.log();
  console.log("Audit complete. No changes made to the database.");
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\nFatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
