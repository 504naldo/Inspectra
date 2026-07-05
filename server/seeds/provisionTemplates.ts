/**
 * Pre-built inspection-template library provisioning.
 *
 * The generic template system (`inspection_templates` / `_sections` / `_items`)
 * is per-company, so pre-built standards have to be installed per tenant:
 * back-fill migrations (0082 NFPA 10, 0083 NFPA/ULC library) cover existing
 * companies, and `company.create` calls `provisionPrebuiltTemplates` so new
 * tenants get the same library. Add new standards by appending their seed to
 * PREBUILT_TEMPLATES (and generating the matching back-fill migration with
 * scripts/generatePrebuiltTemplateMigration.ts).
 *
 * No assignments are created here: the job matcher ignores assignment
 * systemType, so a systemType-only assignment would attach every template to
 * every job. Offices scope each template from the admin Templates UI instead.
 *
 * Idempotent: a company that already has a template with the same name is
 * skipped, so re-running (or racing the migrations) never duplicates.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  inspectionTemplates,
  inspectionTemplateSections,
  inspectionTemplateItems,
} from "../../drizzle/schema";
import { NFPA10_TEMPLATE } from "./nfpa10Extinguisher";
import { NFPA_TEMPLATE_LIBRARY, type TemplateDef } from "./nfpaTemplateLibrary";

export const PREBUILT_TEMPLATES: TemplateDef[] = [
  NFPA10_TEMPLATE as TemplateDef,
  // The library's own NFPA 10 entry is superseded by NFPA10_TEMPLATE above
  // (shipped first, via migration 0082) — including both would duplicate the form.
  ...NFPA_TEMPLATE_LIBRARY.filter(
    (t) => t.name !== "NFPA 10 — Portable Fire Extinguisher Annual Inspection",
  ),
];

export async function provisionPrebuiltTemplates(companyId: number): Promise<{ installed: string[] }> {
  const db = (await getDb())!;
  const installed: string[] = [];

  for (const tpl of PREBUILT_TEMPLATES) {
    const [existing] = await db
      .select({ id: inspectionTemplates.id })
      .from(inspectionTemplates)
      .where(and(eq(inspectionTemplates.companyId, companyId), eq(inspectionTemplates.name, tpl.name)))
      .limit(1);
    if (existing) continue;

    const [tplResult] = await db.insert(inspectionTemplates).values({
      companyId,
      name: tpl.name,
      description: tpl.description,
      systemType: tpl.systemType,
      inspectionType: tpl.inspectionType,
      frequency: tpl.frequency,
      status: "active",
    });
    const templateId = tplResult.insertId;

    for (let sectionIdx = 0; sectionIdx < tpl.sections.length; sectionIdx++) {
      const section = tpl.sections[sectionIdx];
      const [secResult] = await db.insert(inspectionTemplateSections).values({
        companyId,
        templateId,
        title: section.title,
        description: section.description ?? null,
        sortOrder: sectionIdx,
        isRequired: 1,
      });
      const sectionId = secResult.insertId;

      await db.insert(inspectionTemplateItems).values(
        section.items.map((item, idx) => ({
          companyId,
          templateId,
          sectionId,
          itemCode: item.itemCode ?? null,
          questionText: item.questionText,
          helpText: item.helpText ?? null,
          responseType: item.responseType,
          isRequired: item.isRequired !== false ? 1 : 0,
          sortOrder: idx,
          deficiencyTrigger: item.deficiencyTrigger ?? null,
          options: item.options ?? null,
          codeReference: item.codeReference ?? null,
        })),
      );
    }
    installed.push(tpl.name);
  }

  return { installed };
}
