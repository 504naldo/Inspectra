import { z } from "zod";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { TRPCError } from "@trpc/server";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { router, officeProcedure, adminProcedure, technicianProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  inspectionTemplates,
  inspectionTemplateSections,
  inspectionTemplateItems,
  inspectionTemplateAssignments,
  inspectionTemplateResponses,
  jobs,
  users,
  deficiencies,
  TEMPLATE_STATUSES,
} from "../../drizzle/schema";
import { logActivity } from "../activityLogger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertTemplateOwner(templateId: number, companyId: number) {
  const db = (await getDb())!;
  const [template] = await db
    .select({ id: inspectionTemplates.id, companyId: inspectionTemplates.companyId })
    .from(inspectionTemplates)
    .where(eq(inspectionTemplates.id, templateId))
    .limit(1);
  if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
  if (template.companyId !== companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
  return template;
}

async function assertSectionOwner(sectionId: number, companyId: number) {
  const db = (await getDb())!;
  const [section] = await db
    .select({ id: inspectionTemplateSections.id, companyId: inspectionTemplateSections.companyId, templateId: inspectionTemplateSections.templateId })
    .from(inspectionTemplateSections)
    .where(eq(inspectionTemplateSections.id, sectionId))
    .limit(1);
  if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
  if (section.companyId !== companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
  return section;
}

async function assertItemOwner(itemId: number, companyId: number) {
  const db = (await getDb())!;
  const [item] = await db
    .select({ id: inspectionTemplateItems.id, companyId: inspectionTemplateItems.companyId, templateId: inspectionTemplateItems.templateId, sectionId: inspectionTemplateItems.sectionId })
    .from(inspectionTemplateItems)
    .where(eq(inspectionTemplateItems.id, itemId))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
  if (item.companyId !== companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
  return item;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const inspectionTemplateRouter = router({

  // ── Template CRUD ──────────────────────────────────────────────────────────

  list: officeProcedure
    .input(z.object({
      systemType: z.string().optional(),
      status: z.enum(TEMPLATE_STATUSES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const conditions = [eq(inspectionTemplates.companyId, ctx.user.companyId!)];
      if (input?.systemType) conditions.push(eq(inspectionTemplates.systemType, input.systemType));
      if (input?.status) conditions.push(eq(inspectionTemplates.status, input.status));

      return db
        .select()
        .from(inspectionTemplates)
        .where(and(...conditions))
        .orderBy(asc(inspectionTemplates.systemType), asc(inspectionTemplates.name));
    }),

  get: officeProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [template] = await db
        .select()
        .from(inspectionTemplates)
        .where(and(
          eq(inspectionTemplates.id, input.id),
          eq(inspectionTemplates.companyId, ctx.user.companyId!),
        ))
        .limit(1);
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      const [sections, items, assignments] = await Promise.all([
        db.select().from(inspectionTemplateSections)
          .where(eq(inspectionTemplateSections.templateId, input.id))
          .orderBy(asc(inspectionTemplateSections.sortOrder)),
        db.select().from(inspectionTemplateItems)
          .where(eq(inspectionTemplateItems.templateId, input.id))
          .orderBy(asc(inspectionTemplateItems.sectionId), asc(inspectionTemplateItems.sortOrder)),
        db.select().from(inspectionTemplateAssignments)
          .where(and(
            eq(inspectionTemplateAssignments.templateId, input.id),
            eq(inspectionTemplateAssignments.isActive, 1),
          )),
      ]);

      return { template, sections, items, assignments };
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      systemType: z.string().default("general"),
      inspectionType: z.string().default("annual"),
      frequency: z.string().default("annual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(inspectionTemplates).values({
        companyId: ctx.user.companyId!,
        name: input.name,
        description: input.description,
        systemType: input.systemType,
        inspectionType: input.inspectionType,
        frequency: input.frequency,
        status: "draft",
        createdById: ctx.user.id,
      });
      const id = result.insertId;
      void logActivity({ ctx, entityType: "job", entityId: id, eventType: "created", title: `Template created: ${input.name}` });
      return { id };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      systemType: z.string().optional(),
      inspectionType: z.string().optional(),
      frequency: z.string().optional(),
      status: z.enum(TEMPLATE_STATUSES).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(input.id, ctx.user.companyId!);
      const db = (await getDb())!;
      const { id, isDefault, ...rest } = input;
      await db.update(inspectionTemplates).set({
        ...rest,
        ...(isDefault != null ? { isDefault: isDefault ? 1 : 0 } : {}),
      }).where(eq(inspectionTemplates.id, id));
      return { ok: true };
    }),

  clone: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [template] = await db
        .select()
        .from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.id, input.id), eq(inspectionTemplates.companyId, ctx.user.companyId!)))
        .limit(1);
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      const [sections, items] = await Promise.all([
        db.select().from(inspectionTemplateSections).where(eq(inspectionTemplateSections.templateId, input.id)).orderBy(asc(inspectionTemplateSections.sortOrder)),
        db.select().from(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, input.id)).orderBy(asc(inspectionTemplateItems.sortOrder)),
      ]);

      const [newTemplate] = await db.insert(inspectionTemplates).values({
        companyId: ctx.user.companyId!,
        name: input.name,
        description: template.description,
        systemType: template.systemType,
        inspectionType: template.inspectionType,
        frequency: template.frequency,
        status: "draft",
        version: 1,
        createdById: ctx.user.id,
      });
      const newId = newTemplate.insertId;

      const sectionIdMap = new Map<number, number>();
      for (const section of sections) {
        const [newSection] = await db.insert(inspectionTemplateSections).values({
          companyId: ctx.user.companyId!,
          templateId: newId,
          title: section.title,
          description: section.description,
          sortOrder: section.sortOrder,
          isRequired: section.isRequired,
        });
        sectionIdMap.set(section.id, newSection.insertId);
      }

      for (const item of items) {
        const newSectionId = sectionIdMap.get(item.sectionId);
        if (!newSectionId) continue;
        await db.insert(inspectionTemplateItems).values({
          companyId: ctx.user.companyId!,
          templateId: newId,
          sectionId: newSectionId,
          itemCode: item.itemCode,
          questionText: item.questionText,
          helpText: item.helpText,
          responseType: item.responseType,
          isRequired: item.isRequired,
          sortOrder: item.sortOrder,
          deficiencyTrigger: item.deficiencyTrigger,
          options: item.options,
          codeReference: item.codeReference,
        });
      }

      return { id: newId };
    }),

  // ── Section CRUD ───────────────────────────────────────────────────────────

  addSection: adminProcedure
    .input(z.object({
      templateId: z.number(),
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      isRequired: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(input.templateId, ctx.user.companyId!);
      const db = (await getDb())!;

      const existingSections = await db
        .select({ sortOrder: inspectionTemplateSections.sortOrder })
        .from(inspectionTemplateSections)
        .where(eq(inspectionTemplateSections.templateId, input.templateId))
        .orderBy(desc(inspectionTemplateSections.sortOrder))
        .limit(1);

      const nextOrder = existingSections.length > 0 ? existingSections[0].sortOrder + 1 : 0;

      const [result] = await db.insert(inspectionTemplateSections).values({
        companyId: ctx.user.companyId!,
        templateId: input.templateId,
        title: input.title,
        description: input.description,
        sortOrder: nextOrder,
        isRequired: input.isRequired ? 1 : 0,
      });
      return { id: result.insertId };
    }),

  updateSection: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      isRequired: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSectionOwner(input.id, ctx.user.companyId!);
      const db = (await getDb())!;
      const { id, isRequired, ...rest } = input;
      await db.update(inspectionTemplateSections).set({
        ...rest,
        ...(isRequired != null ? { isRequired: isRequired ? 1 : 0 } : {}),
      }).where(eq(inspectionTemplateSections.id, id));
      return { ok: true };
    }),

  deleteSection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const section = await assertSectionOwner(input.id, ctx.user.companyId!);
      const db = (await getDb())!;
      await db.delete(inspectionTemplateItems).where(eq(inspectionTemplateItems.sectionId, input.id));
      await db.delete(inspectionTemplateSections).where(eq(inspectionTemplateSections.id, input.id));
      return { ok: true, templateId: section.templateId };
    }),

  reorderSections: adminProcedure
    .input(z.object({
      templateId: z.number(),
      orderedIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(input.templateId, ctx.user.companyId!);
      const db = (await getDb())!;
      await Promise.all(
        input.orderedIds.map((id, idx) =>
          db.update(inspectionTemplateSections)
            .set({ sortOrder: idx })
            .where(and(eq(inspectionTemplateSections.id, id), eq(inspectionTemplateSections.companyId, ctx.user.companyId!)))
        )
      );
      return { ok: true };
    }),

  // ── Item CRUD ──────────────────────────────────────────────────────────────

  addItem: adminProcedure
    .input(z.object({
      templateId: z.number(),
      sectionId: z.number(),
      itemCode: z.string().max(50).optional(),
      questionText: z.string().min(1),
      helpText: z.string().optional(),
      responseType: z.string().default("pass_fail_na"),
      isRequired: z.boolean().default(true),
      deficiencyTrigger: z.object({
        onValues: z.array(z.string()),
        severity: z.enum(["critical", "major", "minor", "observation"]),
        defaultTitle: z.string().optional(),
      }).optional(),
      options: z.array(z.string()).optional(),
      codeReference: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(input.templateId, ctx.user.companyId!);
      const db = (await getDb())!;

      const existing = await db
        .select({ sortOrder: inspectionTemplateItems.sortOrder })
        .from(inspectionTemplateItems)
        .where(eq(inspectionTemplateItems.sectionId, input.sectionId))
        .orderBy(desc(inspectionTemplateItems.sortOrder))
        .limit(1);

      const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

      const [result] = await db.insert(inspectionTemplateItems).values({
        companyId: ctx.user.companyId!,
        templateId: input.templateId,
        sectionId: input.sectionId,
        itemCode: input.itemCode,
        questionText: input.questionText,
        helpText: input.helpText,
        responseType: input.responseType,
        isRequired: input.isRequired ? 1 : 0,
        sortOrder: nextOrder,
        deficiencyTrigger: input.deficiencyTrigger ?? null,
        options: input.options ?? null,
        codeReference: input.codeReference,
      });
      return { id: result.insertId };
    }),

  updateItem: adminProcedure
    .input(z.object({
      id: z.number(),
      itemCode: z.string().max(50).optional(),
      questionText: z.string().min(1).optional(),
      helpText: z.string().nullable().optional(),
      responseType: z.string().optional(),
      isRequired: z.boolean().optional(),
      deficiencyTrigger: z.object({
        onValues: z.array(z.string()),
        severity: z.enum(["critical", "major", "minor", "observation"]),
        defaultTitle: z.string().optional(),
      }).nullable().optional(),
      options: z.array(z.string()).nullable().optional(),
      codeReference: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertItemOwner(input.id, ctx.user.companyId!);
      const db = (await getDb())!;
      const { id, isRequired, ...rest } = input;
      await db.update(inspectionTemplateItems).set({
        ...rest,
        ...(isRequired != null ? { isRequired: isRequired ? 1 : 0 } : {}),
      }).where(eq(inspectionTemplateItems.id, id));
      return { ok: true };
    }),

  deleteItem: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertItemOwner(input.id, ctx.user.companyId!);
      const db = (await getDb())!;
      await db.delete(inspectionTemplateItems).where(eq(inspectionTemplateItems.id, input.id));
      return { ok: true };
    }),

  reorderItems: adminProcedure
    .input(z.object({
      sectionId: z.number(),
      orderedIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertSectionOwner(input.sectionId, ctx.user.companyId!);
      const db = (await getDb())!;
      await Promise.all(
        input.orderedIds.map((id, idx) =>
          db.update(inspectionTemplateItems)
            .set({ sortOrder: idx })
            .where(and(eq(inspectionTemplateItems.id, id), eq(inspectionTemplateItems.companyId, ctx.user.companyId!)))
        )
      );
      return { ok: true };
    }),

  // ── Assignments ────────────────────────────────────────────────────────────

  addAssignment: adminProcedure
    .input(z.object({
      templateId: z.number(),
      jobType: z.string().optional(),
      systemType: z.string().optional(),
      siteId: z.number().optional(),
      customerOrgId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(input.templateId, ctx.user.companyId!);
      const db = (await getDb())!;
      const [result] = await db.insert(inspectionTemplateAssignments).values({
        companyId: ctx.user.companyId!,
        templateId: input.templateId,
        jobType: input.jobType,
        systemType: input.systemType,
        siteId: input.siteId,
        customerOrgId: input.customerOrgId,
        isActive: 1,
      });
      return { id: result.insertId };
    }),

  removeAssignment: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(inspectionTemplateAssignments)
        .set({ isActive: 0 })
        .where(and(
          eq(inspectionTemplateAssignments.id, input.id),
          eq(inspectionTemplateAssignments.companyId, ctx.user.companyId!),
        ));
      return { ok: true };
    }),

  // ── Technician — get templates applicable to a job ─────────────────────────

  getTemplatesForJob: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;

      // Get job details to match against assignments
      const [job] = await db
        .select({ jobType: jobs.jobType, siteId: jobs.siteId, customerOrgId: jobs.customerOrgId, companyId: jobs.companyId })
        .from(jobs)
        .where(eq(jobs.id, input.jobId))
        .limit(1);

      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });

      // Find active templates with matching assignments
      const assignments = await db
        .select({
          templateId: inspectionTemplateAssignments.templateId,
          jobType: inspectionTemplateAssignments.jobType,
          systemType: inspectionTemplateAssignments.systemType,
          siteId: inspectionTemplateAssignments.siteId,
          customerOrgId: inspectionTemplateAssignments.customerOrgId,
        })
        .from(inspectionTemplateAssignments)
        .where(and(
          eq(inspectionTemplateAssignments.companyId, ctx.user.companyId!),
          eq(inspectionTemplateAssignments.isActive, 1),
        ));

      const matchingTemplateIds = new Set<number>();
      for (const a of assignments) {
        const jobTypeMatch = !a.jobType || a.jobType === job.jobType;
        const siteMatch = !a.siteId || a.siteId === job.siteId;
        const customerMatch = !a.customerOrgId || a.customerOrgId === job.customerOrgId;
        if (jobTypeMatch && siteMatch && customerMatch) {
          matchingTemplateIds.add(a.templateId);
        }
      }

      if (matchingTemplateIds.size === 0) return [];

      const templates = await db
        .select()
        .from(inspectionTemplates)
        .where(and(
          eq(inspectionTemplates.companyId, ctx.user.companyId!),
          eq(inspectionTemplates.status, "active"),
        ));

      return templates.filter((t) => matchingTemplateIds.has(t.id));
    }),

  getTemplateWithResponses: technicianProcedure
    .input(z.object({ templateId: z.number(), jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;

      const [[template], [job]] = await Promise.all([
        db.select().from(inspectionTemplates)
          .where(and(eq(inspectionTemplates.id, input.templateId), eq(inspectionTemplates.companyId, ctx.user.companyId!)))
          .limit(1),
        db.select({ companyId: jobs.companyId }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1),
      ]);

      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });

      const [sections, items, responses] = await Promise.all([
        db.select().from(inspectionTemplateSections)
          .where(eq(inspectionTemplateSections.templateId, input.templateId))
          .orderBy(asc(inspectionTemplateSections.sortOrder)),
        db.select().from(inspectionTemplateItems)
          .where(eq(inspectionTemplateItems.templateId, input.templateId))
          .orderBy(asc(inspectionTemplateItems.sectionId), asc(inspectionTemplateItems.sortOrder)),
        db.select().from(inspectionTemplateResponses)
          .where(and(
            eq(inspectionTemplateResponses.jobId, input.jobId),
            eq(inspectionTemplateResponses.templateId, input.templateId),
          )),
      ]);

      return { template, sections, items, responses };
    }),

  saveResponse: technicianProcedure
    .input(z.object({
      jobId: z.number(),
      templateId: z.number(),
      sectionId: z.number(),
      itemId: z.number(),
      responseValue: z.string().nullable().optional(),
      responseText: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      deficiencyId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;

      const [job] = await db.select({ companyId: jobs.companyId, finalizedAt: jobs.finalizedAt })
        .from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
      if (job.finalizedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Job is finalized" });

      await db.insert(inspectionTemplateResponses).values({
        companyId: ctx.user.companyId!,
        jobId: input.jobId,
        templateId: input.templateId,
        sectionId: input.sectionId,
        itemId: input.itemId,
        responseValue: input.responseValue ?? null,
        responseText: input.responseText ?? null,
        notes: input.notes ?? null,
        deficiencyId: input.deficiencyId ?? null,
        answeredById: ctx.user.id,
        answeredAt: new Date(),
      }).onDuplicateKeyUpdate({
        set: {
          responseValue: input.responseValue ?? null,
          responseText: input.responseText ?? null,
          notes: input.notes ?? null,
          deficiencyId: input.deficiencyId ?? null,
          answeredById: ctx.user.id,
          answeredAt: new Date(),
        },
      });

      return { ok: true };
    }),

  // Returns template completeness for the Submit-for-QA dialog.
  // Counts required items vs answered responses across all templates assigned to the job.
  getCompletenessForJob: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;

      const [job] = await db
        .select({ jobType: jobs.jobType, siteId: jobs.siteId, customerOrgId: jobs.customerOrgId, companyId: jobs.companyId })
        .from(jobs)
        .where(eq(jobs.id, input.jobId))
        .limit(1);

      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) return { templateCount: 0, totalRequired: 0, answered: 0 };

      const assignments = await db
        .select({ templateId: inspectionTemplateAssignments.templateId, jobType: inspectionTemplateAssignments.jobType, siteId: inspectionTemplateAssignments.siteId, customerOrgId: inspectionTemplateAssignments.customerOrgId })
        .from(inspectionTemplateAssignments)
        .where(and(eq(inspectionTemplateAssignments.companyId, ctx.user.companyId!), eq(inspectionTemplateAssignments.isActive, 1)));

      const matchingIds = new Set<number>();
      for (const a of assignments) {
        if ((!a.jobType || a.jobType === job.jobType) && (!a.siteId || a.siteId === job.siteId) && (!a.customerOrgId || a.customerOrgId === job.customerOrgId)) {
          matchingIds.add(a.templateId);
        }
      }

      if (matchingIds.size === 0) return { templateCount: 0, totalRequired: 0, answered: 0 };

      const activeTemplates = await db
        .select({ id: inspectionTemplates.id })
        .from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.companyId, ctx.user.companyId!), eq(inspectionTemplates.status, "active")));

      const activeIds = activeTemplates.map((t) => t.id).filter((id) => matchingIds.has(id));
      if (activeIds.length === 0) return { templateCount: 0, totalRequired: 0, answered: 0 };

      const [allItems, responses] = await Promise.all([
        db.select({ id: inspectionTemplateItems.id })
          .from(inspectionTemplateItems)
          .where(and(inArray(inspectionTemplateItems.templateId, activeIds), eq(inspectionTemplateItems.isRequired, 1))),
        db.select({ itemId: inspectionTemplateResponses.itemId, responseValue: inspectionTemplateResponses.responseValue, responseText: inspectionTemplateResponses.responseText })
          .from(inspectionTemplateResponses)
          .where(and(eq(inspectionTemplateResponses.jobId, input.jobId), eq(inspectionTemplateResponses.companyId, ctx.user.companyId!))),
      ]);

      const answeredIds = new Set(responses.filter((r) => r.responseValue || r.responseText).map((r) => r.itemId));
      return {
        templateCount: activeIds.length,
        totalRequired: allItems.length,
        answered: allItems.filter((i) => answeredIds.has(i.id)).length,
      };
    }),

  // ── Report QA / Admin — lightweight response summary ─────────────────────

  getResponseSummary: officeProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;

      const [job] = await db.select({ companyId: jobs.companyId })
        .from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });

      const responses = await db
        .select()
        .from(inspectionTemplateResponses)
        .where(eq(inspectionTemplateResponses.jobId, input.jobId));

      const templateIds = Array.from(new Set(responses.map((r) => r.templateId)));
      if (templateIds.length === 0) return { templates: [], responses: [] };

      const templates = await db
        .select({ id: inspectionTemplates.id, name: inspectionTemplates.name })
        .from(inspectionTemplates)
        .where(eq(inspectionTemplates.companyId, ctx.user.companyId!));

      return {
        templates: templates.filter((t) => templateIds.includes(t.id)),
        responses,
      };
    }),

  // ── Report QA / PDF — rich structured summary ─────────────────────────────

  getReportResponseSummary: officeProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;

      const [job] = await db.select({ companyId: jobs.companyId })
        .from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job || job.companyId !== ctx.user.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });

      const responses = await db
        .select()
        .from(inspectionTemplateResponses)
        .where(eq(inspectionTemplateResponses.jobId, input.jobId));

      if (responses.length === 0) return [];

      const templateIds = Array.from(new Set(responses.map((r) => r.templateId)));

      // Fetch all needed data in parallel
      const [allTemplates, allSections, allItems, allUsers, allDeficiencies] = await Promise.all([
        db.select().from(inspectionTemplates)
          .where(eq(inspectionTemplates.companyId, ctx.user.companyId!)),
        db.select().from(inspectionTemplateSections)
          .where(eq(inspectionTemplateSections.companyId, ctx.user.companyId!))
          .orderBy(asc(inspectionTemplateSections.sortOrder)),
        db.select().from(inspectionTemplateItems)
          .where(eq(inspectionTemplateItems.companyId, ctx.user.companyId!))
          .orderBy(asc(inspectionTemplateItems.sectionId), asc(inspectionTemplateItems.sortOrder)),
        db.select({ id: users.id, name: users.name }).from(users)
          .where(eq(users.companyId, ctx.user.companyId!)),
        db.select({ id: deficiencies.id, title: deficiencies.title })
          .from(deficiencies)
          .where(eq(deficiencies.jobId, input.jobId)),
      ]);

      const userMap = new Map(allUsers.map((u) => [u.id, u.name ?? "Unknown"]));
      const defMap = new Map(allDeficiencies.map((d) => [d.id, d.title]));
      const responseMap = new Map(responses.map((r) => [r.itemId, r]));

      return templateIds.map((templateId) => {
        const template = allTemplates.find((t) => t.id === templateId);
        if (!template) return null;

        const templateSections = allSections.filter((s) => s.templateId === templateId);
        const templateItems = allItems.filter((i) => i.templateId === templateId);
        const templateResponses = responses.filter((r) => r.templateId === templateId);

        const totalItems = templateItems.length;
        const answeredItems = templateItems.filter((i) => {
          const r = responseMap.get(i.id);
          return r && (r.responseValue || r.responseText);
        }).length;
        const requiredItems = templateItems.filter((i) => i.isRequired === 1).length;
        const unansweredRequiredItems = templateItems.filter((i) => {
          if (i.isRequired !== 1) return false;
          const r = responseMap.get(i.id);
          return !r || (!r.responseValue && !r.responseText);
        }).length;

        let passCount = 0;
        let failCount = 0;
        let naCount = 0;
        for (const r of templateResponses) {
          const v = (r.responseValue ?? "").toLowerCase();
          if (v === "pass" || v === "yes" || v === "checked") passCount++;
          else if (v === "fail" || v === "no") failCount++;
          else if (v === "na") naCount++;
        }

        const sections = templateSections.map((section) => {
          const sectionItems = templateItems
            .filter((i) => i.sectionId === section.id)
            .map((item) => {
              const resp = responseMap.get(item.id);
              return {
                itemCode: item.itemCode,
                questionText: item.questionText,
                responseType: item.responseType,
                responseValue: resp?.responseValue ?? null,
                responseText: resp?.responseText ?? null,
                notes: resp?.notes ?? null,
                codeReference: item.codeReference,
                isRequired: item.isRequired === 1,
                deficiencyId: resp?.deficiencyId ?? null,
                deficiencyTitle: resp?.deficiencyId ? (defMap.get(resp.deficiencyId) ?? null) : null,
                answeredByName: resp?.answeredById ? (userMap.get(resp.answeredById) ?? null) : null,
                answeredAt: resp?.answeredAt ?? null,
              };
            });
          return {
            sectionId: section.id,
            sectionTitle: section.title,
            sectionSortOrder: section.sortOrder,
            items: sectionItems,
          };
        });

        return {
          templateId,
          templateName: template.name,
          systemType: template.systemType,
          inspectionType: template.inspectionType,
          completionPercent: totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0,
          totalItems,
          answeredItems,
          requiredItems,
          unansweredRequiredItems,
          passCount,
          failCount,
          naCount,
          sections,
        };
      }).filter((t): t is NonNullable<typeof t> => t !== null);
    }),
});
