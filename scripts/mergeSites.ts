/**
 * scripts/mergeSites.ts
 *
 * Merge duplicate Sites: re-parent every child record from a DUP site onto a
 * KEEP site, then delete the DUP. Pure DB operation — no Google Drive / token.
 *
 * Use this for the duplicates the seeder's --clean-* / --fix-suspects passes
 * can't touch: two Site rows for the SAME building (e.g. an "string or null"
 * junk import sitting next to the real record). Those aren't a field fix — one
 * row has to absorb the other and disappear.
 *
 * What it moves (every table with a siteId FK, derived from schema.ts):
 *   areas, devices, jobs, import_logs, knowledge_base, fire_alarm_systems,
 *   quotes, service_schedules, monthly_service_tracking, repair_letter_tracking,
 *   work_orders, approved_work, invoices, asset_lifecycle_events, parts_requests,
 *   time_entries, payroll_time_entries, inspection_template_assignments,
 *   customer_contacts, knowledge_pages, knowledge_source_documents
 *   + attachments (both the siteId column AND the polymorphic
 *     entityType='site'/entityId link)
 *   + site_work_site_info  (UNIQUE siteId — moved, or dropped if KEEP already has one)
 *   + agreement_sites      (UNIQUE agreementId+siteId — moved, or dropped on collision)
 * Deeper children (deficiencies, inspection_results, repairs, sprinkler/device
 * rows, …) hang off jobs/devices and follow them automatically.
 *
 * Each pair runs in a transaction, so a mid-merge failure rolls back cleanly.
 * Always preview with --dry-run first — it prints exactly what would move/delete.
 *
 * Usage:
 *   # Dry-run (preview only)
 *   pnpm merge:sites:dry -- --merge-site "18=754,475=585"
 *   # Live
 *   pnpm merge:sites -- --merge-site "18=754,475=585"
 *   #   …or from a file: --merge-site-file data/site-merges.json
 *   #   ({ "18": "754", "475": "585" }  — keys are DUP ids, values are KEEP ids)
 *
 * DUP=KEEP semantics: the LEFT id is absorbed and deleted, the RIGHT id survives.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";

config();

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MergePair {
  dupId: number;
  keepId: number;
}

export interface MergeArgs {
  companyId: number;
  dryRun: boolean;
  pairs: MergePair[];
}

interface TableAction {
  label: string;
  action: "move" | "delete";
  count: number;
}

interface PairReport {
  dupId: number;
  keepId: number;
  actions: TableAction[];
  siteDeleted: boolean;
  skipped?: string;
}

/** Every table with a plain `siteId` FK — a straight `SET siteId=keepId`. */
const SITE_CHILD_TABLES: { label: string; table: any }[] = [
  { label: "areas", table: schema.areas },
  { label: "devices", table: schema.devices },
  { label: "jobs", table: schema.jobs },
  { label: "import_logs", table: schema.importLogs },
  { label: "knowledge_base", table: schema.knowledgeBase },
  { label: "fire_alarm_systems", table: schema.fireAlarmSystems },
  { label: "quotes", table: schema.quotes },
  { label: "service_schedules", table: schema.serviceSchedules },
  { label: "monthly_service_tracking", table: schema.monthlyServiceTracking },
  { label: "repair_letter_tracking", table: schema.repairLetterTracking },
  { label: "work_orders", table: schema.workOrders },
  { label: "approved_work", table: schema.approvedWork },
  { label: "invoices", table: schema.invoices },
  { label: "asset_lifecycle_events", table: schema.assetLifecycleEvents },
  { label: "parts_requests", table: schema.partsRequests },
  { label: "time_entries", table: schema.timeEntries },
  { label: "payroll_time_entries", table: schema.payrollTimeEntries },
  { label: "inspection_template_assignments", table: schema.inspectionTemplateAssignments },
  { label: "customer_contacts", table: schema.customerContacts },
  { label: "knowledge_pages", table: schema.knowledgePages },
  { label: "knowledge_source_documents", table: schema.knowledgeSourceDocuments },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

/**
 * Parse "dup=keep" entries (comma and/or whitespace separated). Exported for
 * testing. Throws on a malformed entry rather than silently dropping it.
 */
export function parseMergePairs(entries: string[]): MergePair[] {
  const pairs: MergePair[] = [];
  for (const entry of entries) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx < 1) throw new Error(`--merge-site entries must be "dupId=keepId", got: ${entry}`);
    const dupId = parseInt(entry.slice(0, eqIdx), 10);
    const keepId = parseInt(entry.slice(eqIdx + 1), 10);
    if (!Number.isInteger(dupId) || !Number.isInteger(keepId)) {
      throw new Error(`--merge-site entry has a non-numeric id: ${entry}`);
    }
    if (dupId === keepId) throw new Error(`--merge-site cannot merge a site into itself: ${entry}`);
    pairs.push({ dupId, keepId });
  }
  return pairs;
}

export function parseArgs(argv = process.argv.slice(2)): MergeArgs {
  const args: MergeArgs = { companyId: 1, dryRun: false, pairs: [] };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":  args.companyId = parseInt(argv[++i], 10); break;
      case "--dry-run":  args.dryRun = true; break;
      case "--merge-site": {
        const raw = argv[++i] ?? "";
        args.pairs.push(...parseMergePairs(raw.split(/[,\s]+/).filter(Boolean)));
        break;
      }
      case "--merge-site-file": {
        const filePath = argv[++i];
        const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string | number>;
        args.pairs.push(...parseMergePairs(Object.entries(raw).map(([k, v]) => `${k}=${v}`)));
        break;
      }
      default:
        if (argv[i] === "--") break;
        if (argv[i].startsWith("--")) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }
  return args;
}

/**
 * Validate the requested pairs against the loaded site ids. Returns the reason a
 * pair is unsafe, or null if it's good to run. Guards against merging a site
 * that isn't in scope, and against chains (an id used as both a dup and a keep),
 * which would make the merge order-dependent and could delete a still-referenced
 * survivor.
 */
export function validatePairs(
  pairs: MergePair[],
  siteIds: Set<number>,
  companyLabel: string
): Map<number, string> {
  const reasons = new Map<number, string>(); // index → reason
  const dupIds = new Set(pairs.map((p) => p.dupId));
  const keepIds = new Set(pairs.map((p) => p.keepId));
  const seenDup = new Set<number>();
  pairs.forEach((p, i) => {
    if (seenDup.has(p.dupId)) { reasons.set(i, `dup id ${p.dupId} listed twice`); return; }
    seenDup.add(p.dupId);
    if (!siteIds.has(p.dupId)) { reasons.set(i, `no site ${p.dupId} in ${companyLabel}`); return; }
    if (!siteIds.has(p.keepId)) { reasons.set(i, `no keep site ${p.keepId} in ${companyLabel}`); return; }
    if (keepIds.has(p.dupId)) { reasons.set(i, `dup id ${p.dupId} is also a keep target — resolve the chain first`); return; }
    if (dupIds.has(p.keepId)) { reasons.set(i, `keep id ${p.keepId} is also being deleted as a dup — resolve the chain first`); return; }
  });
  return reasons;
}

// ─── Merge core ─────────────────────────────────────────────────────────────

async function countBySite(exec: any, table: any, siteId: number): Promise<number> {
  const rows = await exec.select({ c: sql<number>`count(*)` }).from(table).where(eq(table.siteId, siteId));
  return Number(rows[0]?.c ?? 0);
}

/**
 * Re-parent every child of `dupId` onto `keepId`, then delete `dupId`. When
 * dryRun, only COUNT (no writes). `exec` is a db or a transaction handle.
 */
async function mergeOne(exec: any, dupId: number, keepId: number, dryRun: boolean): Promise<TableAction[]> {
  const actions: TableAction[] = [];

  // Plain siteId FKs
  for (const { label, table } of SITE_CHILD_TABLES) {
    const n = await countBySite(exec, table, dupId);
    if (n === 0) continue;
    if (!dryRun) await exec.update(table).set({ siteId: keepId }).where(eq(table.siteId, dupId));
    actions.push({ label, action: "move", count: n });
  }

  // attachments — the siteId column …
  const attSite = await countBySite(exec, schema.attachments, dupId);
  if (attSite > 0) {
    if (!dryRun) await exec.update(schema.attachments).set({ siteId: keepId }).where(eq(schema.attachments.siteId, dupId));
    actions.push({ label: "attachments.siteId", action: "move", count: attSite });
  }
  // … and the polymorphic entityType='site'/entityId link
  const attEntityRows = await exec
    .select({ c: sql<number>`count(*)` })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.entityType, "site"), eq(schema.attachments.entityId, dupId)));
  const attEntity = Number(attEntityRows[0]?.c ?? 0);
  if (attEntity > 0) {
    if (!dryRun) {
      await exec
        .update(schema.attachments)
        .set({ entityId: keepId })
        .where(and(eq(schema.attachments.entityType, "site"), eq(schema.attachments.entityId, dupId)));
    }
    actions.push({ label: "attachments.entity(site)", action: "move", count: attEntity });
  }

  // site_work_site_info — UNIQUE(siteId): move, or drop the dup's row if KEEP has one
  const swiDup = await exec.select().from(schema.siteWorkSiteInfo).where(eq(schema.siteWorkSiteInfo.siteId, dupId));
  if (swiDup.length > 0) {
    const keepHas =
      (await exec.select().from(schema.siteWorkSiteInfo).where(eq(schema.siteWorkSiteInfo.siteId, keepId))).length > 0;
    if (keepHas) {
      if (!dryRun) await exec.delete(schema.siteWorkSiteInfo).where(eq(schema.siteWorkSiteInfo.siteId, dupId));
      actions.push({ label: "site_work_site_info (KEEP already has one)", action: "delete", count: swiDup.length });
    } else {
      if (!dryRun) await exec.update(schema.siteWorkSiteInfo).set({ siteId: keepId }).where(eq(schema.siteWorkSiteInfo.siteId, dupId));
      actions.push({ label: "site_work_site_info", action: "move", count: swiDup.length });
    }
  }

  // agreement_sites — UNIQUE(agreementId, siteId): move each, drop on collision
  const asDup = await exec.select().from(schema.agreementSites).where(eq(schema.agreementSites.siteId, dupId));
  let asMoved = 0, asDropped = 0;
  for (const r of asDup) {
    const collision =
      (await exec
        .select()
        .from(schema.agreementSites)
        .where(and(eq(schema.agreementSites.agreementId, r.agreementId), eq(schema.agreementSites.siteId, keepId)))).length > 0;
    if (collision) {
      if (!dryRun) await exec.delete(schema.agreementSites).where(eq(schema.agreementSites.id, r.id));
      asDropped++;
    } else {
      if (!dryRun) await exec.update(schema.agreementSites).set({ siteId: keepId }).where(eq(schema.agreementSites.id, r.id));
      asMoved++;
    }
  }
  if (asMoved > 0) actions.push({ label: "agreement_sites", action: "move", count: asMoved });
  if (asDropped > 0) actions.push({ label: "agreement_sites (already in KEEP's agreement)", action: "delete", count: asDropped });

  // Finally, remove the now-empty dup site
  if (!dryRun) await exec.delete(schema.sites).where(eq(schema.sites.id, dupId));

  return actions;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set in .env");
    process.exit(1);
  }
  if (!dbUrl.startsWith("mysql://") && !dbUrl.startsWith("mysql2://")) {
    console.error("ERROR: DATABASE_URL must be a mysql:// or mysql2:// connection string");
    process.exit(1);
  }
  if (args.pairs.length === 0) {
    console.error('ERROR: no merges given. Pass --merge-site "dupId=keepId[,dupId=keepId…]" or --merge-site-file <path>.');
    console.error("       The LEFT id is absorbed and DELETED; the RIGHT id survives.");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Merge duplicate Sites`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company : ${args.companyId}`);
  console.log(`  dry-run : ${args.dryRun}`);
  console.log(`  pairs   : ${args.pairs.map((p) => `${p.dupId}→${p.keepId}`).join(", ")}`);
  console.log();
  if (args.dryRun) console.log("  DRY RUN — no DB writes\n");

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // Load in-scope site ids for validation
  const sites = await db.select().from(schema.sites).where(eq(schema.sites.companyId, args.companyId));
  const siteIds = new Set(sites.map((s) => s.id));
  const reasons = validatePairs(args.pairs, siteIds, `company ${args.companyId}`);

  const reports: PairReport[] = [];

  for (let i = 0; i < args.pairs.length; i++) {
    const { dupId, keepId } = args.pairs[i];
    const reason = reasons.get(i);
    if (reason) {
      reports.push({ dupId, keepId, actions: [], siteDeleted: false, skipped: reason });
      continue;
    }

    if (args.dryRun) {
      const actions = await mergeOne(db, dupId, keepId, true);
      reports.push({ dupId, keepId, actions, siteDeleted: false });
    } else {
      // One transaction per pair: children re-parent and the dup delete either
      // all commit together or all roll back.
      const actions = await db.transaction(async (tx) => mergeOne(tx, dupId, keepId, false));
      reports.push({ dupId, keepId, actions, siteDeleted: true });
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  let totalMoved = 0, totalDeletedRows = 0, sitesMerged = 0, skippedPairs = 0;

  for (const r of reports) {
    console.log(`\n${line}`);
    if (r.skipped) {
      console.log(`  SKIPPED  ${r.dupId} → ${r.keepId}: ${r.skipped}`);
      console.log(line);
      skippedPairs++;
      continue;
    }
    const verb = args.dryRun ? "WOULD MERGE" : "MERGED";
    const dupSite = sites.find((s) => s.id === r.dupId);
    const keepSite = sites.find((s) => s.id === r.keepId);
    console.log(`  ${verb}  siteId=${r.dupId} → siteId=${r.keepId}`);
    console.log(`     dup : "${dupSite?.name ?? "?"}" (${dupSite?.fileNumber ?? "no file#"})`);
    console.log(`     keep: "${keepSite?.name ?? "?"}" (${keepSite?.fileNumber ?? "no file#"})`);
    console.log(line);
    if (r.actions.length === 0) {
      console.log(`     (no child records — dup is empty; ${args.dryRun ? "would just delete" : "deleted"} the row)`);
    }
    for (const a of r.actions) {
      const tag = a.action === "move" ? "move  " : "delete";
      console.log(`     ${tag}  ${String(a.count).padStart(4)}  ${a.label}`);
      if (a.action === "move") totalMoved += a.count;
      else totalDeletedRows += a.count;
    }
    sitesMerged++;
  }

  console.log(`\n${line}`);
  console.log("  SUMMARY");
  console.log(line);
  const mergeLabel = args.dryRun ? "Sites that would merge:" : "Sites merged (dup deleted):";
  console.log(`  ${mergeLabel} ${sitesMerged}`);
  console.log(`  Child rows re-parented:   ${totalMoved}`);
  console.log(`  Redundant rows removed:   ${totalDeletedRows}`);
  if (skippedPairs > 0) console.log(`  Pairs skipped (unsafe):   ${skippedPairs}`);
  console.log();

  if (args.dryRun) {
    console.log("DRY RUN complete — no changes written. Re-run without --dry-run to apply.");
  } else {
    console.log("Done. Duplicate sites merged and deleted.");
  }
  console.log();
}

// Only run when executed directly, not when imported for its exported helpers.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\nFatal:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
