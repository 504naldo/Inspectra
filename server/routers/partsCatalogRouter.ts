import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";

const partRowSchema = z.object({
  category: z.string().min(1).max(100),
  productName: z.string().min(1).max(255),
  sku: z.string().max(100).optional().nullable(),
  unitPrice: z.number().nonnegative(),
  defaultLabourHours: z.number().nonnegative().default(0),
  taxableGst: z.boolean().default(true),
  taxablePst: z.boolean().default(true),
  description: z.string().optional().nullable(),
});

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export const partsCatalogRouter = router({
  list: officeProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return db.getPartsCatalogByCompany(ctx.user.companyId!, input.includeInactive);
    }),

  getById: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const part = await db.getPartsCatalogItemById(input.id);
      if (!part) throw new TRPCError({ code: "NOT_FOUND" });
      if (part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return part;
    }),

  create: officeProcedure
    .input(partRowSchema)
    .mutation(async ({ ctx, input }) => {
      return db.createPartsCatalogItem({
        companyId: ctx.user.companyId!,
        category: input.category,
        productName: input.productName,
        sku: input.sku ?? null,
        unitPrice: String(input.unitPrice) as any,
        defaultLabourHours: String(input.defaultLabourHours) as any,
        taxableGst: input.taxableGst ? 1 : 0,
        taxablePst: input.taxablePst ? 1 : 0,
        isActive: true,
        description: input.description ?? null,
      });
    }),

  update: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      category: z.string().min(1).max(100).optional(),
      productName: z.string().min(1).max(255).optional(),
      sku: z.string().max(100).optional().nullable(),
      unitPrice: z.number().nonnegative().optional(),
      defaultLabourHours: z.number().nonnegative().optional(),
      taxableGst: z.boolean().optional(),
      taxablePst: z.boolean().optional(),
      isActive: z.boolean().optional(),
      description: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const part = await db.getPartsCatalogItemById(input.id);
      if (!part) throw new TRPCError({ code: "NOT_FOUND" });
      if (part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const { id, unitPrice, defaultLabourHours, taxableGst, taxablePst, ...rest } = input;
      await db.updatePartsCatalogItem(id, {
        ...rest,
        ...(unitPrice !== undefined ? { unitPrice: String(unitPrice) as any } : {}),
        ...(defaultLabourHours !== undefined ? { defaultLabourHours: String(defaultLabourHours) as any } : {}),
        ...(taxableGst !== undefined ? { taxableGst: taxableGst ? 1 : 0 } : {}),
        ...(taxablePst !== undefined ? { taxablePst: taxablePst ? 1 : 0 } : {}),
      });
      return { success: true };
    }),

  deactivate: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const part = await db.getPartsCatalogItemById(input.id);
      if (!part) throw new TRPCError({ code: "NOT_FOUND" });
      if (part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.updatePartsCatalogItem(input.id, { isActive: false });
      return { success: true };
    }),

  reactivate: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const part = await db.getPartsCatalogItemById(input.id);
      if (!part) throw new TRPCError({ code: "NOT_FOUND" });
      if (part.companyId !== ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await db.updatePartsCatalogItem(input.id, { isActive: true });
      return { success: true };
    }),

  importPreview: officeProcedure
    .input(z.object({
      rows: z.array(partRowSchema),
      updateExisting: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getPartsCatalogByCompany(ctx.user.companyId!, true);
      const existingKeys = new Map(
        existing.map((p) => [`${norm(p.category)}|${norm(p.productName)}`, p])
      );

      const toCreate: typeof input.rows = [];
      const toUpdate: Array<{ id: number; row: (typeof input.rows)[0] }> = [];
      const skipped: Array<{ row: (typeof input.rows)[0]; reason: string }> = [];

      for (const row of input.rows) {
        const key = `${norm(row.category)}|${norm(row.productName)}`;
        const match = existingKeys.get(key);
        if (match) {
          if (input.updateExisting) {
            toUpdate.push({ id: match.id, row });
          } else {
            skipped.push({ row, reason: "duplicate" });
          }
        } else {
          toCreate.push(row);
        }
      }

      return { toCreate: toCreate.length, toUpdate: toUpdate.length, skipped: skipped.length };
    }),

  importExecute: officeProcedure
    .input(z.object({
      rows: z.array(partRowSchema),
      updateExisting: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const existing = await db.getPartsCatalogByCompany(companyId, true);
      const existingKeys = new Map(
        existing.map((p) => [`${norm(p.category)}|${norm(p.productName)}`, p])
      );

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of input.rows) {
        const key = `${norm(row.category)}|${norm(row.productName)}`;
        const match = existingKeys.get(key);
        if (match) {
          if (input.updateExisting) {
            await db.updatePartsCatalogItem(match.id, {
              category: row.category,
              productName: row.productName,
              sku: row.sku ?? null,
              unitPrice: String(row.unitPrice) as any,
              defaultLabourHours: String(row.defaultLabourHours) as any,
              taxableGst: row.taxableGst ? 1 : 0,
              taxablePst: row.taxablePst ? 1 : 0,
              description: row.description ?? null,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await db.createPartsCatalogItem({
            companyId,
            category: row.category,
            productName: row.productName,
            sku: row.sku ?? null,
            unitPrice: String(row.unitPrice) as any,
            defaultLabourHours: String(row.defaultLabourHours) as any,
            taxableGst: row.taxableGst ? 1 : 0,
            taxablePst: row.taxablePst ? 1 : 0,
            isActive: true,
            description: row.description ?? null,
          });
          created++;
        }
      }

      return { created, updated, skipped };
    }),
});
