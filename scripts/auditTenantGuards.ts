/**
 * scripts/auditTenantGuards.ts
 *
 * Lightweight STATIC heuristic that flags tRPC procedures which accept a
 * record identifier (jobId, siteId, reportId, attachmentId, …) but show no sign
 * of scoping that record to the caller's tenant.
 *
 * ⚠️  This is a lint-grade heuristic, NOT a security proof. It reads source text
 * with regexes; it cannot follow control flow, resolve helpers across files, or
 * understand a bespoke inline check it hasn't been taught. Treat a flag as
 * "a human should look at this procedure", and treat a clean run as "nothing
 * obvious", never as "proven safe". The authoritative record of reviewed
 * decisions is the allowlist below (with reasons) plus docs/PRODUCTION_READINESS.md.
 *
 * A procedure is FLAGGED when ALL of these hold:
 *   1. it is a technician/office/protected/customer procedure (admin procedures
 *      are cross-company by design — the platform-operator role — so they are
 *      intentionally NOT flagged), and
 *   2. it accepts / uses a record identifier (see ID_TOKENS), and
 *   3. its body shows no approved ownership/scoping signal (see SCOPING_SIGNALS)
 *      and it is not in the reviewed ALLOWLIST.
 *
 * Usage:
 *   pnpm security:tenant-audit           # advisory: prints findings, exits 0
 *   pnpm security:tenant-audit --strict  # exits 1 if any non-allowlisted finding
 *   pnpm security:tenant-audit --json    # machine-readable output
 *
 * Documented in docs/security/TENANT_GUARD_AUDIT.md.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Procedure builders that carry an authenticated, tenant-scoped caller and can
// therefore leak across tenants if a record id is used without a check. Admin
// procedures are deliberately excluded — `admin` is the cross-company platform
// operator (docs/ROLE_TRUST_MODEL.md), so cross-company access there is intended.
const SCOPED_PROCEDURES = [
  "technicianProcedure",
  "officeProcedure",
  "protectedProcedure",
  "customerProcedure",
  "adminOrOfficeProcedure",
];

// Record identifiers that address a specific row and thus usually need scoping.
const ID_TOKENS = [
  "jobId",
  "siteId",
  "reportId",
  "attachmentId",
  "deviceId",
  "deficiencyId",
  "customerOrgId",
  "quoteId",
  "repairQuoteId",
  "workOrderId",
  "invoiceId",
  "serviceAgreementId",
  "agreementId",
  "partsRequestId",
  "purchaseOrderId",
  "vendorId",
  "inventoryItemId",
  "importLogId",
  "templateId",
  "areaId",
];

// Signals that the procedure DOES scope the record to the caller's tenant.
// Any one of these present in the procedure body clears the flag. This is
// intentionally broad (false-negative-leaning) so the check stays advisory and
// low-noise: a shared guard, a *_ForCompany getter, an inline company compare,
// or the platform-operator bypass all count.
const SCOPING_SIGNALS: RegExp[] = [
  /assert\w*Company\b/,              // assertJobCompany, assertSiteCompany, assertDeviceCompany, assertCustomerOrgCompany, …
  /assert\w*Access\b/,               // assertDeficiencyAccess, assertAttachmentAccess, …
  /get\w+ForCompany\b/,              // getJobForCompany, getSiteForCompany, …
  /requireOwned\w*/,                 // requireOwnedQueueItem, requireOwned…
  /callerIsPlatformOperator/,        // admin platform-operator bypass in an otherwise-scoped proc
  /ctx\.user\.companyId/,            // inline company compare / scoped query
  /ctx\.user\.customerOrgId/,        // customer-portal org scoping
  /assertCustomerOrgCompany/,
];

interface Finding {
  file: string;
  procedure: string;
  line: number;
  builder: string;
  ids: string[];
  allowlisted: boolean;
  reason: string;
}

/**
 * Reviewed allowlist. Key = "<relFile>::<procedureName>". A key here means a
 * human confirmed the scoping is handled in a way the heuristic can't see (or
 * that cross-tenant access is intended). Keep the reason specific — it is the
 * audit trail. Prefer fixing the code over adding an entry.
 */
const ALLOWLIST: Record<string, string> = {
  // Reviewed 2026-07-21 (commit of this pass). Scoping is real but not visible
  // to the regex.
  "server/routers/complianceRouter.ts::finalizeJob":
    "delegates to compliance/finalizeJob.ts, which enforces job.companyId === ctx.user.companyId before finalizing",
  "server/jobAssignmentRouter.ts::listMyJobs":
    "self-scoped: returns only the caller's own assignments (WHERE jobAssignments.userId = ctx.user.id)",
  "server/jobAssignmentRouter.ts::listJobsWithAssignees":
    "office/admin dispatch list filtered by input.companyId; client-supplied-companyId trust for office is tracked as PR-15 residual in docs/PRODUCTION_READINESS.md",
  "server/jobAssignmentRouter.ts::listDispatch":
    "office/admin dispatch list filtered by input.companyId; client-supplied-companyId trust for office is tracked as PR-15 residual in docs/PRODUCTION_READINESS.md",
};

function listRouterFiles(): string[] {
  const files: string[] = [];
  const routersDir = path.join(ROOT, "server", "routers");
  if (safeIsDir(routersDir)) {
    for (const name of readdirSync(routersDir)) {
      if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
        files.push(path.join(routersDir, name));
      }
    }
  }
  // Top-level routers that live directly under server/ (e.g. fireAlarmRouter.ts).
  const serverDir = path.join(ROOT, "server");
  for (const name of readdirSync(serverDir)) {
    if (/Router\.ts$/.test(name) && !name.endsWith(".test.ts")) {
      files.push(path.join(serverDir, name));
    }
  }
  return Array.from(new Set(files)).sort();
}

function safeIsDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

const procStartRe = new RegExp(
  `(^|\\n)\\s*([A-Za-z0-9_]+)\\s*:\\s*(${SCOPED_PROCEDURES.join("|")})\\b`,
  "g",
);

function auditFile(absFile: string): Finding[] {
  const rel = path.relative(ROOT, absFile);
  const src = readFileSync(absFile, "utf8");
  const findings: Finding[] = [];

  // Collect every procedure-start position, then slice each block from its start
  // to the next procedure-start (or end of file). Regex, so block boundaries are
  // approximate — fine for an advisory pass.
  const starts: { name: string; builder: string; index: number }[] = [];
  for (const m of src.matchAll(procStartRe)) {
    starts.push({ name: m[2], builder: m[3], index: m.index! + m[1].length });
  }

  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const block = src.slice(cur.index, end);
    const line = src.slice(0, cur.index).split("\n").length;

    const ids = ID_TOKENS.filter((t) => new RegExp(`\\b${t}\\b`).test(block));
    if (ids.length === 0) continue; // no record id → not our concern

    const scoped = SCOPING_SIGNALS.some((re) => re.test(block));
    if (scoped) continue; // shows a scoping signal → clear

    const key = `${rel}::${cur.name}`;
    const allowlisted = key in ALLOWLIST;
    findings.push({
      file: rel,
      procedure: cur.name,
      line,
      builder: cur.builder,
      ids,
      allowlisted,
      reason: allowlisted
        ? ALLOWLIST[key]
        : `uses ${ids.join(", ")} but no ownership/scoping signal found`,
    });
  }

  return findings;
}

function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const asJson = argv.includes("--json");

  const files = listRouterFiles();
  const all: Finding[] = [];
  for (const f of files) all.push(...auditFile(f));

  const active = all.filter((f) => !f.allowlisted);
  const allowlisted = all.filter((f) => f.allowlisted);

  if (asJson) {
    console.log(JSON.stringify({ scannedFiles: files.length, active, allowlisted }, null, 2));
  } else {
    console.log(`\nTenant-guard audit (heuristic — not a proof)`);
    console.log(`Scanned ${files.length} router files.\n`);

    if (active.length === 0) {
      console.log("✓ No unscoped id-addressed procedures flagged.");
    } else {
      console.log(`⚠ ${active.length} procedure(s) to review:\n`);
      for (const f of active) {
        console.log(`  ${f.file}:${f.line}  ${f.procedure} (${f.builder})`);
        console.log(`     ${f.reason}`);
      }
    }
    if (allowlisted.length > 0) {
      console.log(`\nAllowlisted (reviewed, ${allowlisted.length}):`);
      for (const f of allowlisted) {
        console.log(`  ${f.file}:${f.line}  ${f.procedure} — ${f.reason}`);
      }
    }
    console.log(
      `\nThis is a lint-grade heuristic, not a security proof. A clean run means ` +
      `"nothing obvious", not "verified safe". Review flags by hand; record ` +
      `decisions in the ALLOWLIST (with a reason) or in docs/PRODUCTION_READINESS.md.`,
    );
  }

  if (strict && active.length > 0) {
    console.error(`\nStrict mode: ${active.length} non-allowlisted finding(s).`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();

export { auditFile, ID_TOKENS, SCOPED_PROCEDURES, ALLOWLIST };
