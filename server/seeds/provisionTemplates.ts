/**
 * Pre-built inspection-template library provisioning.
 *
 * The generic template system (`inspection_templates` / `_sections` / `_items`)
 * is per-company, so pre-built standards have to be installed per tenant:
 * migration 0082 back-filled existing companies, and `company.create` calls
 * `provisionPrebuiltTemplates` so new tenants get the same library. Add new
 * standards by appending their seed to PREBUILT_TEMPLATES (and writing the
 * matching back-fill migration for existing companies).
 *
 * Idempotent: a company that already has a template with the same name is
 * skipped, so re-running (or racing the migration) never duplicates.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  inspectionTemplates,
  inspectionTemplateSections,
  inspectionTemplateItems,
} from "../../drizzle/schema";
import { NFPA10_TEMPLATE } from "./nfpa10Extinguisher";

const PREBUILT_TEMPLATES = [NFPA10_TEMPLATE];

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

    for (const section of tpl.sections) {
      const [secResult] = await db.insert(inspectionTemplateSections).values({
        companyId,
        templateId,
        title: section.title,
        sortOrder: section.sortOrder,
        isRequired: 1,
      });
      const sectionId = secResult.insertId;

      await db.insert(inspectionTemplateItems).values(
        section.items.map((item, idx) => ({
          companyId,
          templateId,
          sectionId,
          itemCode: item.itemCode,
          questionText: item.questionText,
          responseType: item.responseType,
          isRequired: item.isRequired ? 1 : 0,
          sortOrder: idx,
          deficiencyTrigger: item.deficiencyTrigger ?? null,
          codeReference: item.codeReference,
        })),
      );
    }
    installed.push(tpl.name);
  }

  return { installed };
}
