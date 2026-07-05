/**
 * scripts/seedNFPATemplates.ts
 *
 * Seeds pre-built NFPA / ULC inspection templates for a company.
 * Templates are marked active and assigned a default system-type assignment so
 * they appear automatically on jobs of the matching type.
 *
 * Safe to re-run — existing templates with the same name are skipped.
 *
 * Usage:
 *   DATABASE_URL=mysql://... npx tsx scripts/seedNFPATemplates.ts --company 1
 *   DATABASE_URL=mysql://... npx tsx scripts/seedNFPATemplates.ts --company 1 --dry-run
 */

import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import * as schema from "../drizzle/schema.js";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

// ─── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const companyId = (() => {
  const idx = args.indexOf("--company");
  return idx !== -1 ? parseInt(args[idx + 1], 10) : NaN;
})();
const dryRun = args.includes("--dry-run");

if (isNaN(companyId)) {
  console.error("Usage: tsx scripts/seedNFPATemplates.ts --company <id> [--dry-run]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// ─── DB ────────────────────────────────────────────────────────────────────────
const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

// ─── Template definitions ──────────────────────────────────────────────────────
// Source of truth lives in server/seeds/nfpaTemplateLibrary.ts, shared with the
// automatic company-creation provisioning and the 0083 back-fill migration.
import { NFPA_TEMPLATE_LIBRARY as TEMPLATES } from "../server/seeds/nfpaTemplateLibrary.js";

// ─── Insertion logic ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\n📋 NFPA Template Seeder — company ${companyId}${dryRun ? " [DRY RUN]" : ""}\n`);

  // Fetch existing template names to skip duplicates
  const existing = await db
    .select({ name: schema.inspectionTemplates.name })
    .from(schema.inspectionTemplates)
    .where(schema.inspectionTemplates.companyId ? eq(schema.inspectionTemplates.companyId, companyId) : undefined as any);
  const existingNames = new Set(existing.map((t) => t.name));

  let inserted = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    if (existingNames.has(tpl.name)) {
      console.log(`  ⏭  Skip (exists): ${tpl.name}`);
      skipped++;
      continue;
    }

    console.log(`  ➕ Creating: ${tpl.name}`);
    if (dryRun) { inserted++; continue; }

    // Insert template
    const [tplResult] = await db.insert(schema.inspectionTemplates).values({
      companyId,
      name: tpl.name,
      description: tpl.description,
      systemType: tpl.systemType,
      inspectionType: tpl.inspectionType,
      frequency: tpl.frequency,
      status: "active",
      isDefault: 1,
    });
    const templateId = tplResult.insertId;

    // Insert sections + items
    let sectionOrder = 0;
    for (const sec of tpl.sections) {
      const [secResult] = await db.insert(schema.inspectionTemplateSections).values({
        companyId,
        templateId,
        title: sec.title,
        description: sec.description ?? null,
        sortOrder: sectionOrder++,
        isRequired: 1,
      });
      const sectionId = secResult.insertId;

      let itemOrder = 0;
      for (const item of sec.items) {
        await db.insert(schema.inspectionTemplateItems).values({
          companyId,
          templateId,
          sectionId,
          itemCode: item.itemCode ?? null,
          questionText: item.questionText,
          helpText: item.helpText ?? null,
          responseType: item.responseType,
          isRequired: item.isRequired !== false ? 1 : 0,
          sortOrder: itemOrder++,
          codeReference: item.codeReference ?? null,
          deficiencyTrigger: item.deficiencyTrigger ? JSON.stringify(item.deficiencyTrigger) : null,
          options: item.options ? JSON.stringify(item.options) : null,
        });
      }
    }

    // Default assignment (system-type level, no site/customer specifics)
    if (tpl.defaultAssignmentSystemType || tpl.defaultAssignmentJobType) {
      await db.insert(schema.inspectionTemplateAssignments).values({
        companyId,
        templateId,
        systemType: tpl.defaultAssignmentSystemType ?? null,
        jobType: tpl.defaultAssignmentJobType ?? null,
        siteId: null,
        customerOrgId: null,
        isActive: 1,
      });
    }

    const totalItems = tpl.sections.reduce((s, sec) => s + sec.items.length, 0);
    console.log(`     ✓ ${tpl.sections.length} sections, ${totalItems} items`);
    inserted++;
  }

  console.log(`\n✅ Done — ${inserted} template(s) created, ${skipped} skipped.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
