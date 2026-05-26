/**
 * scripts/auditSiteDependencies.ts
 *
 * READ-ONLY audit of per-site dependency counts.
 *
 * For each site, reports dependent record counts across every table that
 * references siteId (directly) or via jobs (indirectly). Sites with zero
 * total dependencies are candidates for review — but never act without
 * manual confirmation.
 *
 * This script NEVER modifies any data.
 *
 * Usage:
 *   DATABASE_URL=mysql://... pnpm site:audit-dependencies -- --company 1
 *
 * Options:
 *   --company N          Company ID (default: 1)
 *   --customer-org N     Restrict to one customerOrg ID
 *   --show-all           Print every site row, not just orphaned ones
 *   --output             Write JSON → data/exports/site-dependency-audit.json
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
    output: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":       args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org":  args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--show-all":      args.showAll = true; break;
      case "--output":        args.output = true; break;
      // backward-compat alias
      case "--output-json":   args.output = true; break;
      default:
        if (argv[i].startsWith("--")) { console.error(`Unknown option: ${argv[i]}`); process.exit(1); }
    }
  }
  return args;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function ensureExportsDir() {
  mkdirSync("data/exports", { recursive: true });
}

// ─── Per-site dependency summary ──────────────────────────────────────────────

interface SiteDependencySummary {
  siteId: number;
  siteName: string;
  customerOrgId: number;
  fileNumber: string | null;
  buildingId: string | null;
  address: string | null;
  city: string | null;
  // Direct siteId references
  devices: number;
  jobs: number;
  areas: number;
  wsi: number;
  contacts: number;
  attachments: number;
  quotes: number;
  workOrders: number;
  approvedWork: number;
  invoices: number;
  serviceSchedules: number;
  monthlyTracking: number;
  repairLetters: number;
  assetEvents: number;
  agreementLinks: number;
  fireAlarmSystems: number;
  timeEntries: number;
  templateAssignments: number;
  partsRequests: number;
  // Indirect (via jobs)
  reports: number;
  deficiencies: number;
  // Summary
  totalDirect: number;
  totalIndirect: number;
  totalDependencies: number;
  safeToDelete: boolean;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("ERROR: DATABASE_URL is not set."); process.exit(1); }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Site Dependency Audit  (READ-ONLY)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company    : ${args.companyId}`);
  if (args.customerOrgId !== undefined) console.log(`  org filter : ${args.customerOrgId}`);
  console.log();

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Load sites ──────────────────────────────────────────────────────────────
  const siteFilter = args.customerOrgId !== undefined
    ? and(eq(schema.sites.companyId, args.companyId), eq(schema.sites.customerOrgId, args.customerOrgId))
    : eq(schema.sites.companyId, args.companyId);

  const allSites = await db
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      fileNumber: schema.sites.fileNumber,
      buildingId: schema.sites.buildingId,
      customerOrgId: schema.sites.customerOrgId,
      address: schema.sites.address,
      city: schema.sites.city,
    })
    .from(schema.sites)
    .where(siteFilter);

  if (allSites.length === 0) {
    console.log("No sites found."); return;
  }

  const siteIds = allSites.map(s => s.id);
  console.log(`Loaded ${allSites.length} sites. Counting dependencies...\n`);

  // ── Helper: count by siteId with GROUP BY ──────────────────────────────────
  async function countBySite(tableName: string, colName = "siteId"): Promise<Map<number, number>> {
    const rows = await db.execute(
      sql.raw(`SELECT ${colName} as sid, COUNT(*) as cnt FROM \`${tableName}\` WHERE ${colName} IN (${siteIds.join(",")}) GROUP BY ${colName}`)
    ) as unknown as Array<{ sid: number; cnt: number | string }>;
    const flat = Array.isArray(rows[0]) ? (rows[0] as unknown as Array<{ sid: number; cnt: number | string }>) : rows;
    const map = new Map<number, number>();
    for (const r of flat) map.set(Number(r.sid), Number(r.cnt));
    return map;
  }

  // ── Helper: count via jobs (indirect) ─────────────────────────────────────
  // Loads all jobIds for in-scope sites, then counts target table.
  async function countViaJobs(tableName: string, colName = "jobId"): Promise<Map<number, number>> {
    const jobRows = await db.execute(
      sql.raw(`SELECT id, siteId FROM \`jobs\` WHERE siteId IN (${siteIds.join(",")})`)
    ) as unknown as Array<{ id: number; siteId: number }>;
    const flatJobs = Array.isArray(jobRows[0]) ? (jobRows[0] as unknown as Array<{ id: number; siteId: number }>) : jobRows;

    if (flatJobs.length === 0) {
      // No jobs → no indirect counts
      return new Map();
    }

    const jobIds = flatJobs.map(j => j.id);
    const targetRows = await db.execute(
      sql.raw(`SELECT ${colName} as jid, COUNT(*) as cnt FROM \`${tableName}\` WHERE ${colName} IN (${jobIds.join(",")}) GROUP BY ${colName}`)
    ) as unknown as Array<{ jid: number; cnt: number | string }>;
    const flatTarget = Array.isArray(targetRows[0]) ? (targetRows[0] as unknown as Array<{ jid: number; cnt: number | string }>) : targetRows;

    // Map jobId → count, then re-key by siteId
    const jobToCount = new Map<number, number>();
    for (const r of flatTarget) jobToCount.set(Number(r.jid), Number(r.cnt));

    const siteMap = new Map<number, number>();
    for (const j of flatJobs) {
      const existing = siteMap.get(j.siteId) ?? 0;
      siteMap.set(j.siteId, existing + (jobToCount.get(j.id) ?? 0));
    }
    return siteMap;
  }

  // ── Run all counts in parallel ─────────────────────────────────────────────
  const [
    deviceCounts, jobCounts, areaCounts, wsiCounts, contactCounts,
    attachmentCounts, quoteCounts, workOrderCounts, approvedWorkCounts,
    invoiceCounts, scheduleCounts, trackingCounts, repairLetterCounts,
    assetEventCounts, agreementCounts, faSysCounts, timeEntryCounts,
    templateAssignCounts, partsReqCounts,
    reportCounts, deficiencyCounts,
  ] = await Promise.all([
    countBySite("devices"),
    countBySite("jobs"),
    countBySite("areas"),
    countBySite("site_work_site_info"),
    countBySite("customer_contacts"),
    countBySite("attachments"),
    countBySite("quotes"),
    countBySite("work_orders"),
    countBySite("approved_work"),
    countBySite("invoices"),
    countBySite("service_schedules"),
    countBySite("monthly_service_tracking"),
    countBySite("repair_letter_tracking"),
    countBySite("asset_lifecycle_events"),
    countBySite("agreement_sites"),
    countBySite("fire_alarm_systems"),
    countBySite("time_entries"),
    countBySite("inspection_template_assignments"),
    countBySite("parts_requests"),
    countViaJobs("reports"),
    countViaJobs("deficiencies"),
  ]);

  // ── Build summaries ────────────────────────────────────────────────────────
  const summaries: SiteDependencySummary[] = allSites.map(site => {
    const devices              = deviceCounts.get(site.id) ?? 0;
    const jobs                 = jobCounts.get(site.id) ?? 0;
    const areas                = areaCounts.get(site.id) ?? 0;
    const wsi                  = wsiCounts.get(site.id) ?? 0;
    const contacts             = contactCounts.get(site.id) ?? 0;
    const attachments          = attachmentCounts.get(site.id) ?? 0;
    const quotes               = quoteCounts.get(site.id) ?? 0;
    const workOrders           = workOrderCounts.get(site.id) ?? 0;
    const approvedWork         = approvedWorkCounts.get(site.id) ?? 0;
    const invoices             = invoiceCounts.get(site.id) ?? 0;
    const serviceSchedules     = scheduleCounts.get(site.id) ?? 0;
    const monthlyTracking      = trackingCounts.get(site.id) ?? 0;
    const repairLetters        = repairLetterCounts.get(site.id) ?? 0;
    const assetEvents          = assetEventCounts.get(site.id) ?? 0;
    const agreementLinks       = agreementCounts.get(site.id) ?? 0;
    const fireAlarmSystems     = faSysCounts.get(site.id) ?? 0;
    const timeEntries          = timeEntryCounts.get(site.id) ?? 0;
    const templateAssignments  = templateAssignCounts.get(site.id) ?? 0;
    const partsRequests        = partsReqCounts.get(site.id) ?? 0;
    const reports              = reportCounts.get(site.id) ?? 0;
    const deficiencies         = deficiencyCounts.get(site.id) ?? 0;

    const totalDirect =
      devices + jobs + areas + wsi + contacts + attachments + quotes +
      workOrders + approvedWork + invoices + serviceSchedules + monthlyTracking +
      repairLetters + assetEvents + agreementLinks + fireAlarmSystems +
      timeEntries + templateAssignments + partsRequests;

    const totalIndirect = reports + deficiencies;
    const totalDependencies = totalDirect + totalIndirect;

    return {
      siteId: site.id,
      siteName: site.name,
      customerOrgId: site.customerOrgId,
      fileNumber: site.fileNumber,
      buildingId: site.buildingId,
      address: site.address,
      city: site.city,
      devices, jobs, areas, wsi, contacts, attachments, quotes,
      workOrders, approvedWork, invoices, serviceSchedules, monthlyTracking,
      repairLetters, assetEvents, agreementLinks, fireAlarmSystems,
      timeEntries, templateAssignments, partsRequests,
      reports, deficiencies,
      totalDirect, totalIndirect, totalDependencies,
      safeToDelete: totalDependencies === 0,
    };
  });

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const withDeps    = summaries.filter(s => s.totalDependencies > 0);
  const orphaned    = summaries.filter(s => s.totalDependencies === 0);
  const line        = "─".repeat(60);

  console.log(line);
  console.log("  DEPENDENCY SUMMARY");
  console.log(line);
  console.log(`  ${pad("Total sites:", 42)} ${summaries.length}`);
  console.log(`  ${pad("Sites with any dependencies:", 42)} ${withDeps.length}`);
  console.log(`  ${pad("Sites with NO dependencies:", 42)} ${orphaned.length}`);
  console.log();

  const cnt = (label: string, n: number) =>
    n > 0 ? console.log(`  ${pad(label, 42)} ${n}`) : undefined;

  cnt("  w/ devices:",             summaries.filter(s => s.devices > 0).length);
  cnt("  w/ jobs:",                summaries.filter(s => s.jobs > 0).length);
  cnt("  w/ work orders:",         summaries.filter(s => s.workOrders > 0).length);
  cnt("  w/ approved work:",       summaries.filter(s => s.approvedWork > 0).length);
  cnt("  w/ invoices:",            summaries.filter(s => s.invoices > 0).length);
  cnt("  w/ reports (via jobs):",  summaries.filter(s => s.reports > 0).length);
  cnt("  w/ deficiencies (via jobs):", summaries.filter(s => s.deficiencies > 0).length);
  cnt("  w/ service schedules:",   summaries.filter(s => s.serviceSchedules > 0).length);
  cnt("  w/ WSI records:",         summaries.filter(s => s.wsi > 0).length);
  cnt("  w/ contacts:",            summaries.filter(s => s.contacts > 0).length);
  cnt("  w/ attachments:",         summaries.filter(s => s.attachments > 0).length);
  cnt("  w/ fire alarm systems:",  summaries.filter(s => s.fireAlarmSystems > 0).length);
  cnt("  w/ quotes:",              summaries.filter(s => s.quotes > 0).length);
  cnt("  w/ agreement links:",     summaries.filter(s => s.agreementLinks > 0).length);

  console.log();
  console.log(`  Direct-reference tables:`);
  console.log(`    areas, devices, jobs, fire_alarm_systems, quotes,`);
  console.log(`    service_schedules, monthly_service_tracking, repair_letter_tracking,`);
  console.log(`    site_work_site_info, agreement_sites, work_orders, approved_work,`);
  console.log(`    invoices, attachments, customer_contacts, asset_lifecycle_events,`);
  console.log(`    time_entries, inspection_template_assignments, parts_requests`);
  console.log(`  Indirect (via jobs.siteId):`);
  console.log(`    reports, deficiencies`);

  // ── Unsafe sites detail ────────────────────────────────────────────────────
  if (withDeps.length > 0 && args.showAll) {
    console.log(`\n${line}`);
    console.log(`  ALL SITES — DEPENDENCY COUNTS`);
    console.log(line);
    const h =
      `  ${"ID".padEnd(6)} ${"FILE#".padEnd(8)} ${"DEV".padEnd(4)} ${"JOB".padEnd(4)} ` +
      `${"RPT".padEnd(4)} ${"DEF".padEnd(4)} ${"WO".padEnd(4)} ${"INV".padEnd(4)} ` +
      `${"SCH".padEnd(4)} ${"WSI".padEnd(4)} ${"CNT".padEnd(4)} NAME`;
    console.log(h);
    for (const s of summaries) {
      console.log(
        `  ${String(s.siteId).padEnd(6)} ${(s.fileNumber ?? "—").padEnd(8)} ` +
        `${String(s.devices).padEnd(4)} ${String(s.jobs).padEnd(4)} ` +
        `${String(s.reports).padEnd(4)} ${String(s.deficiencies).padEnd(4)} ` +
        `${String(s.workOrders).padEnd(4)} ${String(s.invoices).padEnd(4)} ` +
        `${String(s.serviceSchedules).padEnd(4)} ${String(s.wsi).padEnd(4)} ` +
        `${String(s.contacts).padEnd(4)} "${s.siteName}"`
      );
    }
  }

  // ── Orphaned sites detail ─────────────────────────────────────────────────
  if (orphaned.length > 0) {
    console.log(`\n${line}`);
    console.log(`  SITES WITH NO DEPENDENCIES (${orphaned.length})`);
    console.log(`  Zero devices, jobs, WSI, contacts, schedules, attachments, etc.`);
    console.log(`  May be safe to delete — confirm manually before acting.`);
    console.log(line);
    for (const s of orphaned) {
      const fn = s.fileNumber ? `  file#=${s.fileNumber}` : "";
      const bi = s.buildingId ? `  bldg=${s.buildingId}` : "";
      const addr = s.address ? `  "${s.address}${s.city ? ", " + s.city : ""}"` : "";
      console.log(`  siteId=${String(s.siteId).padEnd(5)} org=${s.customerOrgId}${fn}${bi}${addr}  name="${s.siteName}"`);
    }
  }

  // ── JSON output ────────────────────────────────────────────────────────────
  if (args.output) {
    ensureExportsDir();
    const path = "data/exports/site-dependency-audit.json";
    writeFileSync(path, JSON.stringify({
      companyId: args.companyId,
      generatedAt: new Date().toISOString(),
      totalSites: summaries.length,
      sitesWithDependencies: withDeps.length,
      sitesWithNoDependencies: orphaned.length,
      directReferenceTables: [
        "areas", "devices", "jobs", "fire_alarm_systems", "quotes",
        "service_schedules", "monthly_service_tracking", "repair_letter_tracking",
        "site_work_site_info", "agreement_sites", "work_orders", "approved_work",
        "invoices", "attachments", "customer_contacts", "asset_lifecycle_events",
        "time_entries", "inspection_template_assignments", "parts_requests",
      ],
      indirectTables: ["reports (via jobs)", "deficiencies (via jobs)"],
      summaries,
    }, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  console.log(`\nAudit complete — no changes made to the database.\n`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error("\nFatal:", err instanceof Error ? err.message : err); process.exit(1); });
