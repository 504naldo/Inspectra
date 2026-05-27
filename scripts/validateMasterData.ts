/**
 * scripts/validateMasterData.ts
 *
 * READ-ONLY master data validation.
 *
 * Validates the DB state produced by the Customer Records backfill pipeline:
 *   Sites → Work Site Info → Contacts
 *
 * Does NOT require Google Drive access.
 * Does NOT modify any data.
 *
 * Checks:
 *   - Site integrity (duplicates, missing fields)
 *   - Work Site Info coverage and completeness
 *   - Contact coverage per org and per site
 *   - Downstream readiness (can reports/invoices/quotes find recipients?)
 *   - WSI org-id consistency
 *
 * Usage:
 *   DATABASE_URL=mysql://... pnpm master-data:validate -- --company 1
 *   DATABASE_URL=mysql://... pnpm master-data:validate -- --company 1 --output
 *   DATABASE_URL=mysql://... pnpm master-data:validate:strict -- --company 1 --strict --output
 *
 * Options:
 *   --company N          Company ID (default: 1)
 *   --customer-org N     Restrict to one customerOrg
 *   --output             Write JSON → data/exports/master-data-validation-report.json
 *   --strict             Include low-severity issues (omitted by default)
 *   --format json|csv    Output format (default: json)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";
import { normBldg } from "../lib/import/normalize.js";

config();

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type Category = "site" | "org" | "wsi" | "contact" | "downstream";

interface IssueRow {
  severity: Severity;
  category: Category;
  siteId?: number;
  siteName?: string;
  customerOrgId?: number;
  orgName?: string;
  contactId?: number;
  wsiId?: number;
  fieldName?: string;
  currentValue?: string;
  expectedValue?: string;
  message: string;
  recommendedAction: string;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {
    companyId: 1,
    customerOrgId: undefined as number | undefined,
    output: false,
    strict: false,
    format: "json" as "json" | "csv",
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--company":      args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org": args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--output":       args.output = true; break;
      case "--strict":       args.strict = true; break;
      case "--format":
        const fmt = argv[++i];
        if (fmt !== "json" && fmt !== "csv") { console.error("--format must be json or csv"); process.exit(1); }
        args.format = fmt;
        break;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("ERROR: DATABASE_URL is not set."); process.exit(1); }

  const LINE = "─".repeat(60);
  const DLINE = "═".repeat(60);

  console.log(`\n${DLINE}`);
  console.log(`  Master Data Validation  (READ-ONLY)`);
  console.log(DLINE);
  console.log(`  company : ${args.companyId}`);
  if (args.customerOrgId !== undefined) console.log(`  org     : ${args.customerOrgId}`);
  console.log(`  strict  : ${args.strict}`);
  console.log();

  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Load data ─────────────────────────────────────────────────────────────

  console.log("Loading data...");

  const siteFilter = args.customerOrgId !== undefined
    ? and(eq(schema.sites.companyId, args.companyId), eq(schema.sites.customerOrgId, args.customerOrgId))
    : eq(schema.sites.companyId, args.companyId);

  const [rawOrgs, allSites, allWsi, allContacts] = await Promise.all([
    db.select({
      id: schema.customerOrgs.id,
      name: schema.customerOrgs.name,
      contactEmail: schema.customerOrgs.contactEmail,
      contactPhone: schema.customerOrgs.contactPhone,
    }).from(schema.customerOrgs)
      .where(eq(schema.customerOrgs.companyId, args.companyId)),

    db.select({
      id: schema.sites.id,
      name: schema.sites.name,
      customerOrgId: schema.sites.customerOrgId,
      buildingId: schema.sites.buildingId,
      fileNumber: schema.sites.fileNumber,
      address: schema.sites.address,
      city: schema.sites.city,
    }).from(schema.sites).where(siteFilter),

    db.select({
      id: schema.siteWorkSiteInfo.id,
      siteId: schema.siteWorkSiteInfo.siteId,
      customerOrgId: schema.siteWorkSiteInfo.customerOrgId,
      accessNotes: schema.siteWorkSiteInfo.accessNotes,
      fireAlarmPanelLocation: schema.siteWorkSiteInfo.fireAlarmPanelLocation,
      monitoringCompany: schema.siteWorkSiteInfo.monitoringCompany,
    }).from(schema.siteWorkSiteInfo)
      .where(eq(schema.siteWorkSiteInfo.companyId, args.companyId)),

    db.select({
      id: schema.customerContacts.id,
      name: schema.customerContacts.name,
      role: schema.customerContacts.role,
      email: schema.customerContacts.email,
      phone: schema.customerContacts.phone,
      mobile: schema.customerContacts.mobile,
      customerOrgId: schema.customerContacts.customerOrgId,
      siteId: schema.customerContacts.siteId,
      isPrimary: schema.customerContacts.isPrimary,
      isSiteAccessContact: schema.customerContacts.isSiteAccessContact,
      isActive: schema.customerContacts.isActive,
      receivesReports: schema.customerContacts.receivesReports,
      receivesQuotes: schema.customerContacts.receivesQuotes,
      receivesInvoices: schema.customerContacts.receivesInvoices,
      receivesServiceUpdates: schema.customerContacts.receivesServiceUpdates,
      receivesComplianceNotices: schema.customerContacts.receivesComplianceNotices,
    }).from(schema.customerContacts)
      .where(eq(schema.customerContacts.companyId, args.companyId)),
  ]);

  const orgs = args.customerOrgId !== undefined
    ? rawOrgs.filter(o => o.id === args.customerOrgId)
    : rawOrgs;

  const activeContacts = allContacts.filter(c => c.isActive === 1);
  const allSiteIds = allSites.map(s => s.id);

  console.log(`  ${orgs.length} orgs, ${allSites.length} sites, ${allWsi.length} WSI, ${allContacts.length} contacts\n`);

  // Build indexes
  const orgById = new Map(orgs.map(o => [o.id, o]));
  const wsiBySiteId = new Map(allWsi.map(w => [w.siteId, w]));

  const activeContactsByOrg = new Map<number, typeof activeContacts>();
  const activeContactsBySite = new Map<number, typeof activeContacts>();
  for (const c of activeContacts) {
    if (c.customerOrgId !== null) {
      const arr = activeContactsByOrg.get(c.customerOrgId) ?? [];
      arr.push(c);
      activeContactsByOrg.set(c.customerOrgId, arr);
    }
    if (c.siteId !== null) {
      const arr = activeContactsBySite.get(c.siteId) ?? [];
      arr.push(c);
      activeContactsBySite.set(c.siteId, arr);
    }
  }

  // ── Run checks ────────────────────────────────────────────────────────────

  console.log("Running validation checks...");
  const issues: IssueRow[] = [];
  const push = (row: IssueRow) => issues.push(row);

  // ── Section 1: Sites ──────────────────────────────────────────────────────

  // Duplicate buildingId
  const bldgMap = new Map<string, { names: string[]; ids: number[] }>();
  for (const s of allSites) {
    const bld = s.buildingId?.trim();
    if (!bld) continue;
    const norm = normBldg(bld);
    const entry = bldgMap.get(norm) ?? { names: [], ids: [] };
    entry.names.push(s.name);
    entry.ids.push(s.id);
    bldgMap.set(norm, entry);
  }
  for (const [bldg, v] of bldgMap.entries()) {
    if (v.ids.length > 1) {
      push({
        severity: "critical", category: "site", fieldName: "buildingId",
        currentValue: v.ids.map((id, i) => `siteId=${id} "${v.names[i]}"`).join("; "),
        message: `Duplicate buildingId "${bldg}" on ${v.ids.length} sites: ${v.names.join(", ")}`,
        recommendedAction: "Assign unique buildingIds; use /admin/sites to correct each site",
      });
    }
  }

  // Duplicate fileNumber
  const fileMap = new Map<string, { names: string[]; ids: number[] }>();
  for (const s of allSites) {
    const fn = s.fileNumber?.trim();
    if (!fn) continue;
    const norm = normBldg(fn);
    const entry = fileMap.get(norm) ?? { names: [], ids: [] };
    entry.names.push(s.name);
    entry.ids.push(s.id);
    fileMap.set(norm, entry);
  }
  for (const [fn, v] of fileMap.entries()) {
    if (v.ids.length > 1) {
      push({
        severity: "critical", category: "site", fieldName: "fileNumber",
        currentValue: v.ids.map((id, i) => `siteId=${id} "${v.names[i]}"`).join("; "),
        message: `Duplicate fileNumber "${fn}" on ${v.ids.length} sites: ${v.names.join(", ")}`,
        recommendedAction: "Assign unique fileNumbers; check Customer Records for correct numbering",
      });
    }
  }

  for (const s of allSites) {
    // Missing buildingId
    if (!s.buildingId?.trim()) {
      push({
        severity: "medium", category: "site",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        fieldName: "buildingId", currentValue: null ?? undefined,
        message: `Site #${s.id} "${s.name}" missing buildingId`,
        recommendedAction: "Set from Customer Records fileNumber via /admin/sites or backfill script",
      });
    }

    // Missing fileNumber
    if (!s.fileNumber?.trim()) {
      push({
        severity: "medium", category: "site",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        fieldName: "fileNumber",
        message: `Site #${s.id} "${s.name}" missing fileNumber`,
        recommendedAction: "Set from Customer Records folder name via /admin/sites or backfill script",
      });
    }

    // Missing address (high — affects technician dispatch)
    if (!s.address?.trim()) {
      push({
        severity: "high", category: "site",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        fieldName: "address",
        message: `Site #${s.id} "${s.name}" missing address`,
        recommendedAction: "Fill address in /admin/sites — required for job packets and dispatch",
      });
    }

    // Missing city (low unless strict)
    if (args.strict && !s.city?.trim()) {
      push({
        severity: "low", category: "site",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        fieldName: "city",
        message: `Site #${s.id} "${s.name}" missing city`,
        recommendedAction: "Fill city in /admin/sites",
      });
    }

    // WSI missing
    if (!wsiBySiteId.has(s.id)) {
      push({
        severity: "high", category: "wsi",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        message: `Site #${s.id} "${s.name}" has no Work Site Info record`,
        recommendedAction: "Run: pnpm backfill:work-site-info:dry -- --company 1 then pnpm backfill:work-site-info -- --company 1 --apply",
      });
    }
  }

  // ── Section 2: Work Site Info completeness ────────────────────────────────

  for (const wsi of allWsi) {
    const siteName = allSites.find(s => s.id === wsi.siteId)?.name ?? `Site ${wsi.siteId}`;

    // WSI customerOrgId mismatch vs site
    const site = allSites.find(s => s.id === wsi.siteId);
    if (site && wsi.customerOrgId !== null && wsi.customerOrgId !== site.customerOrgId) {
      push({
        severity: "high", category: "wsi",
        siteId: wsi.siteId, siteName, wsiId: wsi.id,
        fieldName: "customerOrgId",
        currentValue: String(wsi.customerOrgId),
        expectedValue: String(site.customerOrgId),
        message: `WSI #${wsi.id} for site "${siteName}" has customerOrgId=${wsi.customerOrgId} but site has customerOrgId=${site.customerOrgId}`,
        recommendedAction: "Update WSI customerOrgId to match site — use /admin/sites/[id]/work-site-info",
      });
    }

    if (!wsi.accessNotes?.trim()) {
      push({
        severity: "medium", category: "wsi",
        siteId: wsi.siteId, siteName, wsiId: wsi.id,
        fieldName: "accessNotes",
        message: `WSI for site "${siteName}" missing access notes`,
        recommendedAction: "Fill access notes in /admin/sites/[id]/work-site-info",
      });
    }

    if (!wsi.fireAlarmPanelLocation?.trim()) {
      push({
        severity: "medium", category: "wsi",
        siteId: wsi.siteId, siteName, wsiId: wsi.id,
        fieldName: "fireAlarmPanelLocation",
        message: `WSI for site "${siteName}" missing fire alarm panel location`,
        recommendedAction: "Fill panel location in /admin/sites/[id]/work-site-info",
      });
    }

    if (!wsi.monitoringCompany?.trim()) {
      push({
        severity: "medium", category: "wsi",
        siteId: wsi.siteId, siteName, wsiId: wsi.id,
        fieldName: "monitoringCompany",
        message: `WSI for site "${siteName}" missing monitoring company`,
        recommendedAction: "Fill monitoring info in /admin/sites/[id]/work-site-info",
      });
    }
  }

  // ── Section 3: Customer Orgs ──────────────────────────────────────────────

  for (const org of orgs) {
    if (args.strict && !org.contactEmail?.trim()) {
      push({
        severity: "low", category: "org",
        customerOrgId: org.id, orgName: org.name,
        fieldName: "contactEmail",
        message: `Org "${org.name}" missing contact email on customerOrgs table`,
        recommendedAction: "Set contactEmail in /admin/customers or via contact backfill",
      });
    }
  }

  // ── Section 4: Contacts ───────────────────────────────────────────────────

  // Inactive contacts still flagged as recipients
  for (const c of allContacts.filter(c => c.isActive === 0)) {
    const flagged = (
      c.receivesReports === 1 || c.receivesQuotes === 1 ||
      c.receivesInvoices === 1 || c.receivesServiceUpdates === 1 ||
      c.receivesComplianceNotices === 1
    );
    if (flagged) {
      push({
        severity: "high", category: "contact",
        contactId: c.id, customerOrgId: c.customerOrgId ?? undefined,
        siteId: c.siteId ?? undefined,
        message: `Inactive contact #${c.id} "${c.name}" (${c.role}) is still flagged as a recipient`,
        recommendedAction: "Remove recipient flags from this contact in /admin/contacts or deactivate cleanly",
      });
    }
  }

  // Contacts missing both email and phone
  for (const c of activeContacts) {
    if (!c.email?.trim() && !c.phone?.trim() && !c.mobile?.trim()) {
      push({
        severity: "medium", category: "contact",
        contactId: c.id, customerOrgId: c.customerOrgId ?? undefined,
        siteId: c.siteId ?? undefined,
        message: `Contact #${c.id} "${c.name}" (${c.role}) has no email, phone, or mobile`,
        recommendedAction: "Add at least one contact method in /admin/contacts",
      });
    }
  }

  // Duplicate emails within company
  const emailMap = new Map<string, { count: number; ids: number[]; names: string[] }>();
  for (const c of activeContacts) {
    const em = c.email?.toLowerCase().trim();
    if (!em) continue;
    const entry = emailMap.get(em) ?? { count: 0, ids: [], names: [] };
    entry.count++;
    entry.ids.push(c.id);
    entry.names.push(c.name);
    emailMap.set(em, entry);
  }
  for (const [email, v] of emailMap.entries()) {
    if (v.count > 1) {
      push({
        severity: "medium", category: "contact",
        fieldName: "email", currentValue: email,
        message: `Duplicate email "${email}" on ${v.count} contacts: ${v.names.join(", ")}`,
        recommendedAction: "Dedup contacts manually in /admin/contacts — keep the primary and deactivate duplicates",
      });
    }
  }

  // Orgs missing primary contact
  const orgsWithPrimary = new Set(
    activeContacts
      .filter(c => c.isPrimary === 1 && c.customerOrgId !== null)
      .map(c => c.customerOrgId!)
  );
  for (const org of orgs) {
    if (!orgsWithPrimary.has(org.id)) {
      push({
        severity: "high", category: "contact",
        customerOrgId: org.id, orgName: org.name,
        message: `Org "${org.name}" has no active primary contact (isPrimary=1)`,
        recommendedAction: "Run: pnpm backfill:contacts:dry -- --company 1 or set primary in /admin/contacts",
      });
    }
  }

  // Sites missing site access contact
  const sitesWithAccess = new Set(
    activeContacts
      .filter(c => c.isSiteAccessContact === 1 && c.siteId !== null)
      .map(c => c.siteId!)
  );
  for (const s of allSites) {
    if (!sitesWithAccess.has(s.id)) {
      push({
        severity: "high", category: "contact",
        siteId: s.id, siteName: s.name, customerOrgId: s.customerOrgId,
        message: `Site "${s.name}" has no active site access contact`,
        recommendedAction: "Add a site contact with isSiteAccessContact=true in /admin/contacts",
      });
    }
  }

  // ── Section 5: Downstream readiness per org ───────────────────────────────

  let orgsWithReport = 0, orgsWithBilling = 0, orgsWithQuote = 0;

  for (const org of orgs) {
    const orgContacts = activeContactsByOrg.get(org.id) ?? [];
    const orgSiteIds = allSites
      .filter(s => s.customerOrgId === org.id)
      .map(s => s.id);
    const siteContacts = orgSiteIds.flatMap(sid => activeContactsBySite.get(sid) ?? []);
    const allForOrg = [...orgContacts, ...siteContacts];

    const hasReport  = allForOrg.some(c => c.receivesReports === 1);
    const hasBilling = allForOrg.some(c => c.receivesInvoices === 1 || c.role === "billing_contact");
    const hasQuote   = allForOrg.some(c => c.receivesQuotes === 1 || c.role === "quote_approver");

    if (hasReport) orgsWithReport++;
    if (hasBilling) orgsWithBilling++;
    if (hasQuote) orgsWithQuote++;

    if (!hasReport) {
      push({
        severity: "high", category: "downstream",
        customerOrgId: org.id, orgName: org.name,
        message: `Org "${org.name}" has no report recipient — Send Center and report emails cannot reach this customer`,
        recommendedAction: "Add a contact with receivesReports=true or role=report_recipient",
      });
    }
    if (!hasBilling) {
      push({
        severity: "high", category: "downstream",
        customerOrgId: org.id, orgName: org.name,
        message: `Org "${org.name}" has no billing contact — invoices cannot be addressed to this customer`,
        recommendedAction: "Add a contact with receivesInvoices=true or role=billing_contact",
      });
    }
    if (!hasQuote) {
      push({
        severity: "medium", category: "downstream",
        customerOrgId: org.id, orgName: org.name,
        message: `Org "${org.name}" has no quote approver — repair quotes have no recipient`,
        recommendedAction: "Add a contact with receivesQuotes=true or role=quote_approver",
      });
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────

  const displayedIssues = args.strict ? issues : issues.filter(i => i.severity !== "low");

  const bySeverity = (s: Severity) => displayedIssues.filter(i => i.severity === s);
  const criticalIssues = bySeverity("critical");
  const highIssues     = bySeverity("high");
  const mediumIssues   = bySeverity("medium");
  const lowIssues      = args.strict ? bySeverity("low") : [];

  // Downstream readiness %
  const pct = (n: number, d: number) => d === 0 ? "N/A" : `${n}/${d} (${Math.round(n/d*100)}%)`;
  const sitesWithAccessCount = sitesWithAccess.size;

  // ── Print results ─────────────────────────────────────────────────────────

  console.log(`\n${LINE}`);
  console.log("  VALIDATION RESULTS");
  console.log(LINE);
  console.log(`  ${pad("Customer Orgs checked:", 38)} ${orgs.length}`);
  console.log(`  ${pad("Sites checked:", 38)} ${allSites.length}`);
  console.log(`  ${pad("Work Site Info records:", 38)} ${allWsi.length}`);
  console.log(`  ${pad("Contacts checked:", 38)} ${allContacts.length}`);
  console.log();
  console.log(`  ${pad("CRITICAL:", 38)} ${criticalIssues.length}`);
  console.log(`  ${pad("HIGH:", 38)} ${highIssues.length}`);
  console.log(`  ${pad("MEDIUM:", 38)} ${mediumIssues.length}`);
  if (args.strict) console.log(`  ${pad("LOW:", 38)} ${lowIssues.length}`);
  console.log(`  ${pad("─".repeat(20), 38)}`);
  console.log(`  ${pad("TOTAL:", 38)} ${displayedIssues.length}`);
  console.log();
  console.log("  Downstream readiness:");
  console.log(`  ${pad("  Report recipients:", 38)} ${pct(orgsWithReport, orgs.length)}`);
  console.log(`  ${pad("  Billing contacts:", 38)} ${pct(orgsWithBilling, orgs.length)}`);
  console.log(`  ${pad("  Quote approvers:", 38)} ${pct(orgsWithQuote, orgs.length)}`);
  console.log(`  ${pad("  Site access contacts:", 38)} ${pct(sitesWithAccessCount, allSites.length)}`);
  console.log(`  ${pad("  WSI coverage:", 38)} ${pct(allWsi.filter(w => allSiteIds.includes(w.siteId)).length, allSites.length)}`);

  // ── Issue detail sections ─────────────────────────────────────────────────

  function printSection(label: string, items: IssueRow[]) {
    if (items.length === 0) return;
    console.log(`\n${LINE}`);
    console.log(`  ${label} (${items.length})`);
    console.log(LINE);
    for (const i of items) {
      console.log(`  [${i.category}] ${i.message}`);
      console.log(`         → ${i.recommendedAction}`);
    }
  }

  printSection("CRITICAL ISSUES", criticalIssues);
  printSection("HIGH ISSUES", highIssues);
  printSection("MEDIUM ISSUES", mediumIssues);
  if (args.strict) printSection("LOW ISSUES", lowIssues);

  // ── JSON output ───────────────────────────────────────────────────────────

  if (args.output) {
    ensureExportsDir();
    const path = "data/exports/master-data-validation-report.json";

    if (args.format === "csv") {
      const csvPath = "data/exports/master-data-validation-report.csv";
      const header = "severity,category,siteId,siteName,customerOrgId,orgName,contactId,wsiId,fieldName,currentValue,expectedValue,message,recommendedAction";
      const rows = displayedIssues.map(i => [
        i.severity, i.category,
        i.siteId ?? "", i.siteName ?? "",
        i.customerOrgId ?? "", i.orgName ?? "",
        i.contactId ?? "", i.wsiId ?? "",
        i.fieldName ?? "", i.currentValue ?? "", i.expectedValue ?? "",
        `"${i.message.replace(/"/g, '""')}"`,
        `"${i.recommendedAction.replace(/"/g, '""')}"`,
      ].join(","));
      writeFileSync(csvPath, [header, ...rows].join("\n"));
      console.log(`\n  Written: ${csvPath}`);
    } else {
      writeFileSync(path, JSON.stringify({
        companyId: args.companyId,
        generatedAt: new Date().toISOString(),
        strict: args.strict,
        counts: {
          orgs: orgs.length,
          sites: allSites.length,
          wsiRecords: allWsi.length,
          contacts: allContacts.length,
          issues: {
            critical: criticalIssues.length,
            high: highIssues.length,
            medium: mediumIssues.length,
            low: issues.filter(i => i.severity === "low").length,
            total: displayedIssues.length,
          },
        },
        downstreamReadiness: {
          orgsWithReportRecipient: `${orgsWithReport}/${orgs.length}`,
          orgsWithBillingContact: `${orgsWithBilling}/${orgs.length}`,
          orgsWithQuoteApprover: `${orgsWithQuote}/${orgs.length}`,
          sitesWithAccessContact: `${sitesWithAccessCount}/${allSites.length}`,
          sitesWithWsi: `${allWsi.filter(w => allSiteIds.includes(w.siteId)).length}/${allSites.length}`,
        },
        issues: displayedIssues,
      }, null, 2));
      console.log(`\n  Written: ${path}`);
    }
  }

  console.log(`\nValidation complete — no changes made to the database.\n`);

  if (criticalIssues.length > 0 || highIssues.length > 0) {
    process.exit(1); // non-zero exit when critical/high issues found (useful in CI)
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error("\nFatal:", err instanceof Error ? err.message : err); process.exit(1); });
