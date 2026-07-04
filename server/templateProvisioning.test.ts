/**
 * templateProvisioning.test.ts — pre-built inspection-template library.
 *
 * Real-DB tests that a newly created company (via company.create) receives the
 * pre-built NFPA 10 template, that its content matches the seed source of
 * truth, and that provisioning is idempotent (safe to race the 0082 back-fill
 * migration or be re-run).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  inspectionTemplates,
  inspectionTemplateSections,
  inspectionTemplateItems,
} from "../drizzle/schema";
import { NFPA10_TEMPLATE } from "./seeds/nfpa10Extinguisher";
import { provisionPrebuiltTemplates } from "./seeds/provisionTemplates";

function adminCtx(): TrpcContext {
  return { user: { id: 1, openId: "a", email: "a@e.com", name: "A", role: "admin", companyId: 1,
      customerOrgId: null, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} },
    requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

const TOTAL_ITEMS = NFPA10_TEMPLATE.sections.reduce((n, s) => n + s.items.length, 0);

describe("Pre-built template provisioning", () => {
  let companyId: number;

  beforeAll(async () => {
    const caller = appRouter.createCaller(adminCtx());
    const company = await caller.company.create({ name: `Provision Co ${Date.now()}` });
    companyId = company.id;
  });

  it("company.create installs the NFPA 10 template with the seeded structure", async () => {
    const db = (await getDb())!;
    const [tpl] = await db.select().from(inspectionTemplates)
      .where(and(eq(inspectionTemplates.companyId, companyId), eq(inspectionTemplates.name, NFPA10_TEMPLATE.name)));
    expect(tpl).toBeDefined();
    expect(tpl.systemType).toBe("fire_extinguisher");
    expect(tpl.status).toBe("active");

    const sections = await db.select().from(inspectionTemplateSections)
      .where(eq(inspectionTemplateSections.templateId, tpl.id))
      .orderBy(asc(inspectionTemplateSections.sortOrder));
    expect(sections.map((s) => s.title)).toEqual(NFPA10_TEMPLATE.sections.map((s) => s.title));
    expect(sections.every((s) => s.companyId === companyId)).toBe(true);

    const items = await db.select().from(inspectionTemplateItems)
      .where(eq(inspectionTemplateItems.templateId, tpl.id));
    expect(items).toHaveLength(TOTAL_ITEMS);
    expect(items.every((i) => i.companyId === companyId)).toBe(true);

    // A seeded deficiency trigger round-trips through the JSON column intact.
    const hydro = items.find((i) => i.questionText === "12-year hydrostatic test current.");
    expect(hydro?.deficiencyTrigger).toMatchObject({ onValues: ["fail"], severity: "critical" });
    expect(hydro?.codeReference).toBe("NFPA 10 §8.3.1");
  });

  it("provisioning is idempotent — a second run installs nothing", async () => {
    const { installed } = await provisionPrebuiltTemplates(companyId);
    expect(installed).toEqual([]);

    const db = (await getDb())!;
    const tpls = await db.select().from(inspectionTemplates)
      .where(and(eq(inspectionTemplates.companyId, companyId), eq(inspectionTemplates.name, NFPA10_TEMPLATE.name)));
    expect(tpls).toHaveLength(1);
    const items = await db.select().from(inspectionTemplateItems)
      .where(eq(inspectionTemplateItems.templateId, tpls[0].id));
    expect(items).toHaveLength(TOTAL_ITEMS);
  });
});
