import { getDb, getSitesByCompany } from "../db";
import { deficiencies, jobs } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  officeProcedure as baseOfficeProcedure,
  technicianProcedure as baseTechnicianProcedure,
} from "../_core/trpc";
import {
  assertSiteCompany,
  getDeficiencyForCompany,
  getJobForCompany,
} from "../tenantGuards";
import { ewfBinding, ewfCommand, sourceHash } from "../ewfIntegration";
const accountInput = z.object({ accountScope: z.string().max(100) });
const verifyScope = (
  scope: string,
  user: { id: number; companyId: number | null; role: string }
) => {
  if (scope !== `${user.id}:${user.companyId}:${user.role}`)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account context changed",
    });
};
const officeProcedure = baseOfficeProcedure
  .input(accountInput)
  .use(({ ctx, input, next }) => {
    verifyScope(input.accountScope, ctx.user);
    return next();
  });
const technicianProcedure = baseTechnicianProcedure
  .input(accountInput)
  .use(({ ctx, input, next }) => {
    verifyScope(input.accountScope, ctx.user);
    return next();
  });
const ids = z.object({
  siteId: z.number().int().positive(),
  deficiencyId: z.number().int().positive(),
});
export async function ewfSource(
  siteId: number,
  deficiencyId: number,
  companyId: number
) {
  const site = await assertSiteCompany(siteId, companyId);
  const deficiency = await getDeficiencyForCompany(deficiencyId, companyId);
  const job = await getJobForCompany(deficiency.jobId, companyId);
  if (
    job.siteId !== site.id ||
    job.companyId !== site.companyId ||
    job.customerOrgId !== site.customerOrgId
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Deficiency does not belong to this property",
    });
  return {
    companyId: site.companyId,
    siteId: site.id,
    deficiencyId: deficiency.id,
    customerOrgId: site.customerOrgId,
    version: sourceHash({
      siteUpdated: site.updatedAt,
      deficiencyUpdated: deficiency.updatedAt,
      jobId: job.id,
    }),
    property: {
      name: site.name,
      address: site.address || "",
      city: site.city || "",
    },
    deficiency: {
      title: deficiency.title,
      description: deficiency.description || "",
      system: deficiency.systemCategory || "",
      severity: deficiency.severity,
      status: deficiency.status,
    },
  };
}
const part = z
  .object({
    description: z.string().min(1).max(1000),
    quantity_milli: z.number().int().positive().max(1e9),
    unit: z.string().min(1).max(40),
  })
  .strict();
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    payload: z
      .object({
        quote_row_version: z.number().int().nonnegative(),
        fitter_user_id: z.string().uuid(),
        request_brief: z.string().max(6000),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("save"),
    payload: z
      .object({
        estimateId: z.string().uuid(),
        row_version: z.number().int().nonnegative(),
        estimated_hours_hundredths: z.number().int().nonnegative().max(1e6),
        scope: z.string().max(6000),
        restrictions: z.string().max(6000),
        notes: z.string().max(6000),
        parts: z.array(part).max(50),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("submit"),
    payload: z
      .object({
        estimateId: z.string().uuid(),
        row_version: z.number().int().nonnegative(),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("review"),
    payload: z
      .object({
        estimateId: z.string().uuid(),
        row_version: z.number().int().nonnegative(),
        quote_row_version: z.number().int().nonnegative(),
        reviewed: z.literal(true),
        review_note: z.string().min(1).max(2000),
      })
      .strict(),
  }),
]);
export const ewfRouter = router({
  properties: officeProcedure.query(async ({ ctx }) => {
    if (!ctx.user.companyId) return [];
    return getSitesByCompany(ctx.user.companyId);
  }),
  deficiencies: officeProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ id: deficiencies.id, title: deficiencies.title })
        .from(deficiencies)
        .innerJoin(jobs, eq(deficiencies.jobId, jobs.id))
        .where(
          and(
            eq(jobs.siteId, input.siteId),
            eq(jobs.companyId, site.companyId),
            eq(jobs.customerOrgId, site.customerOrgId)
          )
        );
      return rows;
    }),
  source: officeProcedure.input(ids).query(async ({ ctx, input }) => {
    const source = await ewfSource(
      input.siteId,
      input.deficiencyId,
      ctx.user.companyId!
    );
    return { source, hash: sourceHash(source) };
  }),
  open: officeProcedure
    .input(
      ids.extend({
        reviewedSourceHash: z.string().length(64),
        quoteId: z.string().uuid().optional(),
        quoteVersion: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await ewfSource(
        input.siteId,
        input.deficiencyId,
        ctx.user.companyId!
      );
      if (sourceHash(source) !== input.reviewedSourceHash)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Source changed. Review it again.",
        });
      return ewfCommand(
        ewfBinding(source.companyId),
        ctx.user,
        source,
        "open",
        {
          reviewedSourceHash: input.reviewedSourceHash,
          ...(input.quoteId
            ? { quoteId: input.quoteId, quoteVersion: input.quoteVersion }
            : {}),
        }
      );
    }),
  read: technicianProcedure.input(ids).query(async ({ ctx, input }) => {
    const source = await ewfSource(
      input.siteId,
      input.deficiencyId,
      ctx.user.companyId!
    );
    return ewfCommand(
      ewfBinding(source.companyId),
      ctx.user,
      source,
      "read",
      {}
    );
  }),
  command: technicianProcedure
    .input(ids.extend({ command }))
    .mutation(async ({ ctx, input }) => {
      // EWF additionally requires the exact active mapped fitter assignment; no changes to Inspectra offline sync permissions.
      if (
        ctx.user.role === "technician" &&
        ["assign", "review"].includes(input.command.action)
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Office estimate management required",
        });
      const source = await ewfSource(
        input.siteId,
        input.deficiencyId,
        ctx.user.companyId!
      );
      return ewfCommand(
        ewfBinding(source.companyId),
        ctx.user,
        source,
        input.command.action,
        input.command.payload
      );
    }),
});
