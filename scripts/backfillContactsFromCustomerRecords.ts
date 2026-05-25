/**
 * scripts/backfillContactsFromCustomerRecords.ts
 *
 * Backfill the customer_contacts table from contact data already stored in:
 *   - customerOrgs.contactName / contactEmail / contactPhone
 *   - sites.contactName / contactPhone
 *   - sites.summary.contacts[]  (JSON array populated from Customer Records workbooks)
 *   - siteWorkSiteInfo.siteContactName/Phone/Email
 *   - siteWorkSiteInfo.propertyManagerName/Phone/Email
 *
 * These DB fields contain data that was originally imported from Customer Records
 * (Google Drive workbooks and summary sheets). This script promotes them into the
 * first-class customerContacts table with proper role, recipient flag, and dedup logic.
 *
 * Safety guarantees:
 *   - Never creates Sites or CustomerOrgs
 *   - Never overwrites populated contact fields
 *   - Never creates duplicate contacts (dedup by email HIGH, name+phone MEDIUM)
 *   - Never assigns fallback/default org
 *   - LOW-confidence name-only matches are reported but never acted on
 *   - Reports conflicts without overwriting
 *   - Safe to re-run (idempotent in dry-run; live run skips existing HIGH/MEDIUM matches)
 *
 * Usage (dry run — no DB writes):
 *   DATABASE_URL=mysql://... pnpm backfill:contacts:dry -- --company 1
 *
 * Usage (apply):
 *   DATABASE_URL=mysql://... pnpm backfill:contacts -- --company 1 --update-existing
 *
 * Optional flags:
 *   --company N          Company ID (default: 1)
 *   --customer-org N     Restrict to one customerOrg ID
 *   --limit N            Cap candidates processed
 *   --update-existing    Also fill blank fields on existing matched contacts
 *   --output-unmatched   Write skipped records → data/exports/contact-backfill-unmatched.json
 *   --output-conflicts   Write conflict rows → data/exports/contact-backfill-conflicts.json
 *   --verbose            Print every candidate processed
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import type { ContactRole, SiteSummary } from "../drizzle/schema.js";
import { config } from "dotenv";
import { normName } from "../lib/import/normalize.js";

config();

// ─── Types ────────────────────────────────────────────────────────────────────

type DbOrg  = typeof schema.customerOrgs.$inferSelect;
type DbSite = typeof schema.sites.$inferSelect;
type DbWsi  = typeof schema.siteWorkSiteInfo.$inferSelect;
type DbContact = typeof schema.customerContacts.$inferSelect;

type Confidence = "high" | "medium" | "low";

interface ContactCandidate {
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: ContactRole;
  customerOrgId: number | null;
  siteId: number | null;
  isPrimary: 0 | 1;
  receivesReports: 0 | 1;
  receivesQuotes: 0 | 1;
  receivesInvoices: 0 | 1;
  receivesServiceUpdates: 0 | 1;
  receivesComplianceNotices: 0 | 1;
  isSiteAccessContact: 0 | 1;
  sourceTable: string;
  sourceId: number;
  sourceField: string;
}

interface ConflictRow {
  sourceTable: string;
  sourceId: number;
  contactId: number | null;
  customerOrgId: number | null;
  siteId: number | null;
  matchConfidence: string;
  fieldName: string;
  existingContactValue: string | null;
  customerRecordValue: string | null;
  recommendedAction: string;
  reason: string;
}

type ActionType =
  | "create"
  | "update"
  | "skip-exists"
  | "skip-no-name"
  | "skip-low-confidence"
  | "skip-no-org"
  | "dry-run-create"
  | "dry-run-update";

interface ProcessResult {
  candidate: ContactCandidate;
  matchedContactId: number | null;
  confidence: Confidence | "none";
  action: ActionType;
  fieldsSet?: string[];
  conflicts: ConflictRow[];
}

interface CliArgs {
  companyId: number;
  apply: boolean;
  updateExisting: boolean;
  customerOrgId?: number;
  limit?: number;
  outputUnmatched: boolean;
  outputConflicts: boolean;
  verbose: boolean;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    companyId: 1,
    apply: false,
    updateExisting: false,
    outputUnmatched: false,
    outputConflicts: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--apply":           args.apply = true; break;
      case "--company":         args.companyId = parseInt(argv[++i], 10); break;
      case "--customer-org":    args.customerOrgId = parseInt(argv[++i], 10); break;
      case "--limit":           args.limit = parseInt(argv[++i], 10); break;
      case "--update-existing": args.updateExisting = true; break;
      case "--output-unmatched": args.outputUnmatched = true; break;
      case "--output-conflicts": args.outputConflicts = true; break;
      case "--verbose":         args.verbose = true; break;
      case "--default-org":
        console.error("ERROR: --default-org is not supported.");
        console.error("       customerOrgId must come from the source record.");
        process.exit(1);
        break;
      default:
        if (argv[i].startsWith("--")) {
          console.error(`Unknown option: ${argv[i]}`);
          process.exit(1);
        }
    }
  }

  return args;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normPhone(s: string | null | undefined): string {
  return (s ?? "").replace(/[^0-9]/g, "");
}

// ─── Role mapping ─────────────────────────────────────────────────────────────

const VALID_ROLES = new Set<ContactRole>([
  "property_manager", "strata_manager", "building_manager",
  "site_contact", "billing_contact", "quote_approver",
  "report_recipient", "emergency_contact", "tenant_contact", "other",
]);

function mapRole(raw: string | null | undefined): ContactRole {
  if (!raw) return "other";
  const n = raw.trim().toLowerCase().replace(/[\s_-]+/g, "_");
  if (VALID_ROLES.has(n as ContactRole)) return n as ContactRole;
  const lookup: Record<string, ContactRole> = {
    "property_manager":  "property_manager",
    "property manager":  "property_manager",
    "strata_manager":    "strata_manager",
    "strata manager":    "strata_manager",
    "building_manager":  "building_manager",
    "building manager":  "building_manager",
    "site_contact":      "site_contact",
    "site contact":      "site_contact",
    "billing_contact":   "billing_contact",
    "billing contact":   "billing_contact",
    "quote_approver":    "quote_approver",
    "quote approver":    "quote_approver",
    "report_recipient":  "report_recipient",
    "report recipient":  "report_recipient",
    "emergency_contact": "emergency_contact",
    "emergency contact": "emergency_contact",
    "tenant_contact":    "tenant_contact",
    "tenant contact":    "tenant_contact",
  };
  return lookup[raw.trim().toLowerCase()] ?? "other";
}

// ─── Recipient flags from role ────────────────────────────────────────────────

interface RecipientFlags {
  receivesReports: 0 | 1;
  receivesQuotes: 0 | 1;
  receivesInvoices: 0 | 1;
  receivesServiceUpdates: 0 | 1;
  receivesComplianceNotices: 0 | 1;
  isSiteAccessContact: 0 | 1;
}

function flagsForRole(role: ContactRole): RecipientFlags {
  return {
    receivesReports:          role === "report_recipient" ? 1 : 0,
    receivesQuotes:           role === "quote_approver" ? 1 : 0,
    receivesInvoices:         role === "billing_contact" ? 1 : 0,
    receivesServiceUpdates:   (role === "site_contact" || role === "emergency_contact") ? 1 : 0,
    receivesComplianceNotices:(role === "property_manager" || role === "strata_manager") ? 1 : 0,
    isSiteAccessContact:      (role === "site_contact" || role === "emergency_contact") ? 1 : 0,
  };
}

// ─── Contact extraction ───────────────────────────────────────────────────────

function extractOrgContact(org: DbOrg): ContactCandidate | null {
  const name = org.contactName?.trim() || null;
  if (!name) return null;
  return {
    name,
    email: org.contactEmail?.trim() || null,
    phone: org.contactPhone?.trim() || null,
    mobile: null,
    role: "other",
    customerOrgId: org.id,
    siteId: null,
    isPrimary: 1,
    receivesReports: 0,
    receivesQuotes: 0,
    receivesInvoices: 0,
    receivesServiceUpdates: 0,
    receivesComplianceNotices: 0,
    isSiteAccessContact: 0,
    sourceTable: "customerOrgs",
    sourceId: org.id,
    sourceField: "contactName",
  };
}

function extractSiteContact(site: DbSite): ContactCandidate | null {
  const name = site.contactName?.trim() || null;
  if (!name) return null;
  const flags = flagsForRole("site_contact");
  return {
    name,
    email: null,
    phone: site.contactPhone?.trim() || null,
    mobile: null,
    role: "site_contact",
    customerOrgId: site.customerOrgId,
    siteId: site.id,
    isPrimary: 0,
    ...flags,
    sourceTable: "sites",
    sourceId: site.id,
    sourceField: "contactName",
  };
}

function extractWsiSiteContact(wsi: DbWsi): ContactCandidate | null {
  const name = wsi.siteContactName?.trim() || null;
  if (!name) return null;
  const flags = flagsForRole("site_contact");
  return {
    name,
    email: wsi.siteContactEmail?.trim() || null,
    phone: wsi.siteContactPhone?.trim() || null,
    mobile: null,
    role: "site_contact",
    customerOrgId: wsi.customerOrgId ?? null,
    siteId: wsi.siteId,
    isPrimary: 0,
    ...flags,
    sourceTable: "siteWorkSiteInfo",
    sourceId: wsi.id,
    sourceField: "siteContactName",
  };
}

function extractWsiPropertyManager(wsi: DbWsi): ContactCandidate | null {
  const name = wsi.propertyManagerName?.trim() || null;
  if (!name) return null;
  const flags = flagsForRole("property_manager");
  return {
    name,
    email: wsi.propertyManagerEmail?.trim() || null,
    phone: wsi.propertyManagerPhone?.trim() || null,
    mobile: null,
    role: "property_manager",
    customerOrgId: wsi.customerOrgId ?? null,
    siteId: wsi.siteId,
    isPrimary: 0,
    ...flags,
    sourceTable: "siteWorkSiteInfo",
    sourceId: wsi.id,
    sourceField: "propertyManagerName",
  };
}

function extractSummaryContacts(site: DbSite): ContactCandidate[] {
  const summary = site.summary as SiteSummary | null;
  if (!summary?.contacts?.length) return [];

  return summary.contacts
    .map((c, idx): ContactCandidate | null => {
      const name = c.name?.trim() || null;
      if (!name) return null;
      const role = mapRole(c.role);
      const flags = flagsForRole(role);
      return {
        name,
        email: c.email?.trim() || null,
        phone: c.phone?.trim() || null,
        mobile: null,
        role,
        customerOrgId: site.customerOrgId,
        siteId: site.id,
        isPrimary: 0,
        ...flags,
        sourceTable: "sites.summary",
        sourceId: site.id,
        sourceField: `contacts[${idx}]`,
      };
    })
    .filter((c): c is ContactCandidate => c !== null);
}

// ─── Dedup / matching ─────────────────────────────────────────────────────────

interface ContactIndexes {
  /** key: `${companyId}::${orgId}::${normEmail}` → contact */
  byOrgEmail: Map<string, DbContact>;
  /** key: `${companyId}::${siteId}::${normEmail}` → contact */
  bySiteEmail: Map<string, DbContact>;
  /** key: `${companyId}::${orgId}::${normName}::${normPhone}` → contact */
  byOrgNamePhone: Map<string, DbContact>;
  /** key: `${companyId}::${siteId}::${normName}::${normPhone}` → contact */
  bySiteNamePhone: Map<string, DbContact>;
  /** key: `${companyId}::${orgId}::${normName}` → contact[] (for LOW match) */
  byOrgName: Map<string, DbContact[]>;
  /** key: `${companyId}::${siteId}::${normName}` → contact[] (for LOW match) */
  bySiteName: Map<string, DbContact[]>;
}

function buildContactIndexes(contacts: DbContact[]): ContactIndexes {
  const byOrgEmail    = new Map<string, DbContact>();
  const bySiteEmail   = new Map<string, DbContact>();
  const byOrgNamePhone= new Map<string, DbContact>();
  const bySiteNamePhone = new Map<string, DbContact>();
  const byOrgName     = new Map<string, DbContact[]>();
  const bySiteName    = new Map<string, DbContact[]>();

  for (const c of contacts) {
    const cid = c.companyId;
    const ne  = normEmail(c.email);
    const nn  = normName(c.name);
    const np  = normPhone(c.phone);

    if (ne && c.customerOrgId) {
      const k = `${cid}::${c.customerOrgId}::${ne}`;
      if (!byOrgEmail.has(k)) byOrgEmail.set(k, c);
    }
    if (ne && c.siteId) {
      const k = `${cid}::${c.siteId}::${ne}`;
      if (!bySiteEmail.has(k)) bySiteEmail.set(k, c);
    }
    if (nn && np && c.customerOrgId) {
      const k = `${cid}::${c.customerOrgId}::${nn}::${np}`;
      if (!byOrgNamePhone.has(k)) byOrgNamePhone.set(k, c);
    }
    if (nn && np && c.siteId) {
      const k = `${cid}::${c.siteId}::${nn}::${np}`;
      if (!bySiteNamePhone.has(k)) bySiteNamePhone.set(k, c);
    }
    if (nn && c.customerOrgId) {
      const k = `${cid}::${c.customerOrgId}::${nn}`;
      const arr = byOrgName.get(k) ?? [];
      arr.push(c);
      byOrgName.set(k, arr);
    }
    if (nn && c.siteId) {
      const k = `${cid}::${c.siteId}::${nn}`;
      const arr = bySiteName.get(k) ?? [];
      arr.push(c);
      bySiteName.set(k, arr);
    }
  }

  return { byOrgEmail, bySiteEmail, byOrgNamePhone, bySiteNamePhone, byOrgName, bySiteName };
}

interface MatchResult {
  confidence: Confidence;
  contact: DbContact;
  matchedBy: string;
}

function matchContact(
  candidate: ContactCandidate,
  companyId: number,
  indexes: ContactIndexes,
): MatchResult | null {
  const ne = normEmail(candidate.email);
  const nn = normName(candidate.name);
  const np = normPhone(candidate.phone);

  // HIGH: email match within same org scope
  if (ne) {
    if (candidate.customerOrgId) {
      const c = indexes.byOrgEmail.get(`${companyId}::${candidate.customerOrgId}::${ne}`);
      if (c) return { confidence: "high", contact: c, matchedBy: "org+email" };
    }
    if (candidate.siteId) {
      const c = indexes.bySiteEmail.get(`${companyId}::${candidate.siteId}::${ne}`);
      if (c) return { confidence: "high", contact: c, matchedBy: "site+email" };
    }
  }

  // MEDIUM: name + phone within same org scope
  if (nn && np) {
    if (candidate.customerOrgId) {
      const c = indexes.byOrgNamePhone.get(`${companyId}::${candidate.customerOrgId}::${nn}::${np}`);
      if (c) return { confidence: "medium", contact: c, matchedBy: "org+name+phone" };
    }
    if (candidate.siteId) {
      const c = indexes.bySiteNamePhone.get(`${companyId}::${candidate.siteId}::${nn}::${np}`);
      if (c) return { confidence: "medium", contact: c, matchedBy: "site+name+phone" };
    }
  }

  // LOW: name only within same org scope (report only, never act)
  if (nn) {
    if (candidate.customerOrgId) {
      const arr = indexes.byOrgName.get(`${companyId}::${candidate.customerOrgId}::${nn}`);
      if (arr?.length) return { confidence: "low", contact: arr[0], matchedBy: "org+name" };
    }
    if (candidate.siteId) {
      const arr = indexes.bySiteName.get(`${companyId}::${candidate.siteId}::${nn}`);
      if (arr?.length) return { confidence: "low", contact: arr[0], matchedBy: "site+name" };
    }
  }

  return null;
}

// ─── Patch builder ────────────────────────────────────────────────────────────

function buildContactPatch(
  candidate: ContactCandidate,
  existing: DbContact,
  companyId: number,
  confidence: Confidence,
): { patch: Partial<typeof schema.customerContacts.$inferInsert>; conflicts: ConflictRow[] } {
  const patch: Partial<typeof schema.customerContacts.$inferInsert> = {};
  const conflicts: ConflictRow[] = [];

  function trySet<K extends keyof typeof schema.customerContacts.$inferInsert>(
    field: K,
    value: (typeof schema.customerContacts.$inferInsert)[K] | null | undefined,
  ) {
    if (value == null || value === "") return;
    const existing_val = existing[field as keyof DbContact];
    if (existing_val == null || existing_val === "" || existing_val === 0) {
      patch[field] = value;
    } else if (String(existing_val) !== String(value)) {
      conflicts.push({
        sourceTable: candidate.sourceTable,
        sourceId: candidate.sourceId,
        contactId: existing.id,
        customerOrgId: candidate.customerOrgId,
        siteId: candidate.siteId,
        matchConfidence: confidence,
        fieldName: field as string,
        existingContactValue: String(existing_val),
        customerRecordValue: String(value),
        recommendedAction: "manual-review",
        reason: `Existing contact ${field as string} differs from Customer Records value`,
      });
    }
  }

  trySet("email", candidate.email);
  trySet("phone", candidate.phone);
  trySet("mobile", candidate.mobile);
  trySet("title", undefined);

  // Recipient flags: only upgrade from 0→1, never 1→0
  if (candidate.receivesReports === 1 && existing.receivesReports === 0)      patch.receivesReports = 1;
  if (candidate.receivesQuotes === 1 && existing.receivesQuotes === 0)        patch.receivesQuotes = 1;
  if (candidate.receivesInvoices === 1 && existing.receivesInvoices === 0)    patch.receivesInvoices = 1;
  if (candidate.receivesServiceUpdates === 1 && existing.receivesServiceUpdates === 0) patch.receivesServiceUpdates = 1;
  if (candidate.receivesComplianceNotices === 1 && existing.receivesComplianceNotices === 0) patch.receivesComplianceNotices = 1;
  if (candidate.isSiteAccessContact === 1 && existing.isSiteAccessContact === 0) patch.isSiteAccessContact = 1;

  return { patch, conflicts };
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function ensureExportsDir() {
  mkdirSync("data/exports", { recursive: true });
}

function roleLabel(role: ContactRole): string {
  return role.replace(/_/g, " ");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Customer Records → Contacts Backfill`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  company          : ${args.companyId}`);
  console.log(`  mode             : ${args.apply ? "APPLY (live writes)" : "DRY RUN (no DB changes)"}`);
  if (args.customerOrgId !== undefined) console.log(`  customer-org     : ${args.customerOrgId}`);
  if (args.limit !== undefined)         console.log(`  limit            : ${args.limit}`);
  console.log(`  update-existing  : ${args.updateExisting}`);
  console.log();

  // ── Connect ─────────────────────────────────────────────────────────────────
  const db = drizzle(dbUrl, { schema, mode: "default" });

  // ── Load DB snapshot ─────────────────────────────────────────────────────────
  console.log("Loading database snapshot...");

  const orgFilter = args.customerOrgId !== undefined
    ? and(
        eq(schema.customerOrgs.companyId, args.companyId),
        eq(schema.customerOrgs.id, args.customerOrgId)
      )
    : eq(schema.customerOrgs.companyId, args.companyId);

  const siteFilter = args.customerOrgId !== undefined
    ? and(
        eq(schema.sites.companyId, args.companyId),
        eq(schema.sites.customerOrgId, args.customerOrgId)
      )
    : eq(schema.sites.companyId, args.companyId);

  const [allOrgs, allSites, allContacts] = await Promise.all([
    db.select().from(schema.customerOrgs).where(orgFilter),
    db.select().from(schema.sites).where(siteFilter),
    db.select().from(schema.customerContacts).where(eq(schema.customerContacts.companyId, args.companyId)),
  ]);

  const siteIds = allSites.map(s => s.id);
  const allWsi: DbWsi[] = siteIds.length
    ? await db
        .select()
        .from(schema.siteWorkSiteInfo)
        .where(
          and(
            eq(schema.siteWorkSiteInfo.companyId, args.companyId),
            inArray(schema.siteWorkSiteInfo.siteId, siteIds)
          )
        )
    : [];

  console.log(
    `  ${allOrgs.length} orgs, ${allSites.length} sites, ` +
    `${allWsi.length} WSI records, ${allContacts.length} existing contacts\n`
  );

  // Index WSI by siteId
  const wsiByeSiteId = new Map<number, DbWsi>();
  for (const w of allWsi) wsiByeSiteId.set(w.siteId, w);

  // ── Extract candidates ────────────────────────────────────────────────────────
  console.log("Extracting contact candidates...");

  const candidates: ContactCandidate[] = [];

  // 1. Org primary contacts
  for (const org of allOrgs) {
    const c = extractOrgContact(org);
    if (c) candidates.push(c);
  }

  // 2. Site contacts + WSI + summary
  for (const site of allSites) {
    const siteC = extractSiteContact(site);
    if (siteC) candidates.push(siteC);

    const wsi = wsiByeSiteId.get(site.id);
    if (wsi) {
      const wsiSite = extractWsiSiteContact(wsi);
      if (wsiSite) candidates.push(wsiSite);

      const wsiPm = extractWsiPropertyManager(wsi);
      if (wsiPm) candidates.push(wsiPm);
    }

    const summaryCs = extractSummaryContacts(site);
    candidates.push(...summaryCs);
  }

  const limited = args.limit !== undefined ? candidates.slice(0, args.limit) : candidates;
  console.log(`  ${limited.length} candidates extracted (of ${candidates.length} total)\n`);

  // ── Build dedup indexes ────────────────────────────────────────────────────────
  const contactIndexes = buildContactIndexes(allContacts);

  // ── Process candidates ────────────────────────────────────────────────────────
  const results: ProcessResult[] = [];
  const allConflicts: ConflictRow[] = [];
  let created = 0, updated = 0, skipped = 0, skippedNoName = 0, skippedLow = 0;
  let highConf = 0, medConf = 0, lowConf = 0;

  for (const candidate of limited) {
    if (!candidate.name?.trim()) {
      results.push({ candidate, matchedContactId: null, confidence: "none", action: "skip-no-name", conflicts: [] });
      skippedNoName++;
      continue;
    }

    if (!candidate.customerOrgId && !candidate.siteId) {
      results.push({ candidate, matchedContactId: null, confidence: "none", action: "skip-no-org", conflicts: [] });
      continue;
    }

    const match = matchContact(candidate, args.companyId, contactIndexes);

    if (match?.confidence === "low") {
      lowConf++;
      skippedLow++;
      results.push({
        candidate, matchedContactId: match.contact.id,
        confidence: "low", action: "skip-low-confidence", conflicts: [],
      });
      continue;
    }

    if (match?.confidence === "high") highConf++;
    else if (match?.confidence === "medium") medConf++;

    if (match && (match.confidence === "high" || match.confidence === "medium")) {
      const { patch, conflicts } = buildContactPatch(
        candidate, match.contact, args.companyId, match.confidence
      );
      allConflicts.push(...conflicts);

      if (args.verbose) {
        console.log(
          `  [${match.confidence.toUpperCase()}] match=${match.contact.id}  ` +
          `"${candidate.name}"  source=${candidate.sourceTable}:${candidate.sourceField}  ` +
          `patch=${JSON.stringify(patch)}`
        );
      }

      const hasPatch = Object.keys(patch).length > 0;
      if (!hasPatch || !args.updateExisting) {
        // Existing contact fully covers this candidate
        skipped++;
        results.push({
          candidate, matchedContactId: match.contact.id,
          confidence: match.confidence, action: "skip-exists", conflicts,
        });
        continue;
      }

      const action: ActionType = args.apply ? "update" : "dry-run-update";
      if (args.apply) {
        await db
          .update(schema.customerContacts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(schema.customerContacts.id, match.contact.id));

        // Update in-memory contact so subsequent candidates see the patch
        const idx = allContacts.findIndex(c => c.id === match.contact.id);
        if (idx !== -1) allContacts[idx] = { ...allContacts[idx], ...patch } as DbContact;

        updated++;
      } else {
        updated++;
      }

      results.push({
        candidate, matchedContactId: match.contact.id,
        confidence: match.confidence, action, fieldsSet: Object.keys(patch), conflicts,
      });
      continue;
    }

    // No high/medium match → create
    if (args.verbose) {
      console.log(
        `  [NEW]  "${candidate.name}"  role=${candidate.role}  ` +
        `source=${candidate.sourceTable}:${candidate.sourceField}`
      );
    }

    const action: ActionType = args.apply ? "create" : "dry-run-create";
    let newContactId: number | undefined;

    if (args.apply) {
      const [res] = await db.insert(schema.customerContacts).values({
        companyId: args.companyId,
        customerOrgId: candidate.customerOrgId,
        siteId: candidate.siteId,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        mobile: candidate.mobile,
        role: candidate.role,
        isPrimary: candidate.isPrimary,
        receivesReports: candidate.receivesReports,
        receivesQuotes: candidate.receivesQuotes,
        receivesInvoices: candidate.receivesInvoices,
        receivesServiceUpdates: candidate.receivesServiceUpdates,
        receivesComplianceNotices: candidate.receivesComplianceNotices,
        isSiteAccessContact: candidate.isSiteAccessContact,
        isActive: 1,
      });
      newContactId = (res as { insertId: number }).insertId;

      // Add to in-memory contact list and rebuild relevant index entries
      const newContact: DbContact = {
        id: newContactId,
        companyId: args.companyId,
        customerOrgId: candidate.customerOrgId,
        siteId: candidate.siteId,
        name: candidate.name,
        title: null,
        companyName: null,
        email: candidate.email,
        phone: candidate.phone,
        mobile: candidate.mobile,
        role: candidate.role,
        isPrimary: candidate.isPrimary,
        receivesReports: candidate.receivesReports,
        receivesQuotes: candidate.receivesQuotes,
        receivesInvoices: candidate.receivesInvoices,
        receivesServiceUpdates: candidate.receivesServiceUpdates,
        receivesComplianceNotices: candidate.receivesComplianceNotices,
        isSiteAccessContact: candidate.isSiteAccessContact,
        preferredMethod: "email",
        notes: null,
        isActive: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      allContacts.push(newContact);

      // Update index maps so subsequent candidates don't create duplicates
      const ne = normEmail(newContact.email);
      const nn = normName(newContact.name);
      const np = normPhone(newContact.phone);
      if (ne && newContact.customerOrgId)
        contactIndexes.byOrgEmail.set(`${args.companyId}::${newContact.customerOrgId}::${ne}`, newContact);
      if (ne && newContact.siteId)
        contactIndexes.bySiteEmail.set(`${args.companyId}::${newContact.siteId}::${ne}`, newContact);
      if (nn && np && newContact.customerOrgId)
        contactIndexes.byOrgNamePhone.set(`${args.companyId}::${newContact.customerOrgId}::${nn}::${np}`, newContact);
      if (nn && np && newContact.siteId)
        contactIndexes.bySiteNamePhone.set(`${args.companyId}::${newContact.siteId}::${nn}::${np}`, newContact);

      created++;
    } else {
      created++;
    }

    results.push({
      candidate, matchedContactId: newContactId ?? null,
      confidence: "none", action,
      fieldsSet: ["name", "email", "phone", "role"],
      conflicts: [],
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────────
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log("  SUMMARY");
  console.log(line);
  console.log(`  ${pad("Orgs processed:", 44)} ${allOrgs.length}`);
  console.log(`  ${pad("Sites processed:", 44)} ${allSites.length}`);
  console.log(`  ${pad("WSI records used:", 44)} ${allWsi.length}`);
  console.log(`  ${pad("Total candidates extracted:", 44)} ${candidates.length}`);
  console.log(`  ${pad("Candidates processed (after limit):", 44)} ${limited.length}`);
  console.log();
  console.log(`  ${pad("HIGH confidence matches:", 44)} ${highConf}`);
  console.log(`  ${pad("MEDIUM confidence matches:", 44)} ${medConf}`);
  console.log(`  ${pad("LOW confidence (review only):", 44)} ${lowConf}`);
  console.log();

  const createLabel = args.apply ? "Contacts created:" : "Would create (dry-run):";
  const updateLabel = args.apply ? "Contacts updated (blank fields):" : "Would update (dry-run):";
  console.log(`  ${pad(createLabel, 44)} ${created}`);
  console.log(`  ${pad(updateLabel, 44)} ${updated}`);
  console.log(`  ${pad("Skipped (already matched):", 44)} ${skipped}`);
  console.log(`  ${pad("Skipped (no name):", 44)} ${skippedNoName}`);
  console.log(`  ${pad("Skipped (LOW confidence only):", 44)} ${skippedLow}`);
  console.log(`  ${pad("Conflicts (not overwritten):", 44)} ${allConflicts.length}`);

  // ── Detail sections ─────────────────────────────────────────────────────────

  const creates = results.filter(r => r.action === "create" || r.action === "dry-run-create");
  if (creates.length > 0) {
    const label = args.apply ? "CONTACTS CREATED" : "WOULD CREATE (DRY RUN)";
    console.log(`\n${line}`);
    console.log(`  ${label} (${creates.length})`);
    console.log(line);
    for (const r of creates) {
      const scope = r.candidate.siteId
        ? `site=${r.candidate.siteId}`
        : `org=${r.candidate.customerOrgId}`;
      console.log(
        `  ${pad(r.candidate.name, 35)} ${pad(roleLabel(r.candidate.role), 20)} ` +
        `${scope}  src=${r.candidate.sourceTable}`
      );
    }
  }

  const updates = results.filter(r => r.action === "update" || r.action === "dry-run-update");
  if (updates.length > 0) {
    const label = args.apply ? "CONTACTS UPDATED" : "WOULD UPDATE (DRY RUN)";
    console.log(`\n${line}`);
    console.log(`  ${label} (blank fields filled) (${updates.length})`);
    console.log(line);
    for (const r of updates) {
      console.log(
        `  contactId=${r.matchedContactId}  "${r.candidate.name}"  ` +
        `fields: ${r.fieldsSet?.join(", ")}`
      );
    }
  }

  const lowMatches = results.filter(r => r.action === "skip-low-confidence");
  if (lowMatches.length > 0) {
    console.log(`\n${line}`);
    console.log(`  LOW CONFIDENCE — MANUAL REVIEW REQUIRED (${lowMatches.length})`);
    console.log(`  These candidates match an existing contact by name only.`);
    console.log(`  No action was taken. Verify and merge manually if needed.`);
    console.log(line);
    for (const r of lowMatches) {
      console.log(
        `  "${r.candidate.name}"  src=${r.candidate.sourceTable}  ` +
        `→ existing contactId=${r.matchedContactId}`
      );
    }
  }

  if (allConflicts.length > 0) {
    console.log(`\n${line}`);
    console.log(`  CONFLICTS — NOT OVERWRITTEN (${allConflicts.length})`);
    console.log(`  Existing contact values differ from Customer Records values.`);
    console.log(`  These were NOT changed. Review manually.`);
    console.log(line);
    for (const c of allConflicts) {
      console.log(`  contactId=${c.contactId}  [${c.matchConfidence}]  field="${c.fieldName}"`);
      console.log(`    existing : ${c.existingContactValue}`);
      console.log(`    source   : ${c.customerRecordValue}`);
    }
  }

  // ── Write output files ───────────────────────────────────────────────────────

  if (args.outputUnmatched) {
    ensureExportsDir();
    const unmatchedResults = results.filter(
      r => r.action === "skip-no-name" || r.action === "skip-no-org"
    );
    const path = "data/exports/contact-backfill-unmatched.json";
    const out = unmatchedResults.map(r => ({
      sourceTable: r.candidate.sourceTable,
      sourceId: r.candidate.sourceId,
      sourceField: r.candidate.sourceField,
      name: r.candidate.name || null,
      role: r.candidate.role,
      customerOrgId: r.candidate.customerOrgId,
      siteId: r.candidate.siteId,
      skipReason: r.action,
    }));
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(`\n  Written: ${path}`);
  }

  if (args.outputConflicts && allConflicts.length > 0) {
    ensureExportsDir();
    const path = "data/exports/contact-backfill-conflicts.json";
    writeFileSync(path, JSON.stringify(allConflicts, null, 2));
    console.log(`  Written: ${path}`);
  }

  // ── Final message ────────────────────────────────────────────────────────────
  console.log();
  if (!args.apply) {
    console.log("DRY RUN complete — no changes were written to the database.");
    console.log("Review the output above, then re-run with --apply to apply.");
  } else if (created + updated > 0) {
    console.log(`Done. ${created} contacts created, ${updated} updated.`);
    if (allConflicts.length > 0)
      console.log(`${allConflicts.length} conflict(s) were NOT overwritten — review manually.`);
  } else {
    console.log("Done. No changes needed.");
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\nFatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
