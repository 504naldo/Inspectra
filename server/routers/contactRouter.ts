import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, or, like, isNull, isNotNull } from "drizzle-orm";
import {
  customerContacts,
  CONTACT_ROLES,
  CONTACT_PREFERRED_METHODS,
} from "../../drizzle/schema";
import { logActivity } from "../activityLogger";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const contactRoleEnum = z.enum(CONTACT_ROLES);
const preferredMethodEnum = z.enum(CONTACT_PREFERRED_METHODS);

const contactWriteSchema = z.object({
  customerOrgId: z.number().int().positive().nullable().optional(),
  siteId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional().nullable(),
  companyName: z.string().max(255).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  role: contactRoleEnum,
  isPrimary: z.boolean().default(false),
  receivesReports: z.boolean().default(false),
  receivesQuotes: z.boolean().default(false),
  receivesInvoices: z.boolean().default(false),
  receivesServiceUpdates: z.boolean().default(false),
  receivesComplianceNotices: z.boolean().default(false),
  isSiteAccessContact: z.boolean().default(false),
  preferredMethod: preferredMethodEnum.default("email"),
  notes: z.string().optional().nullable(),
});

const workflowTypeEnum = z.enum(["report", "repair_quote", "invoice", "service_call", "compliance_notice", "general"]);

// ── Helper ────────────────────────────────────────────────────────────────────

function boolToTinyint(v: boolean | undefined | null): 0 | 1 {
  return v ? 1 : 0;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const contactRouter = router({

  // ── List with filters ───────────────────────────────────────────────────────
  listContacts: adminOrOfficeProcedure
    .input(z.object({
      customerOrgId: z.number().int().positive().optional(),
      siteId: z.number().int().positive().optional(),
      role: contactRoleEnum.optional(),
      receivesReports: z.boolean().optional(),
      receivesInvoices: z.boolean().optional(),
      receivesQuotes: z.boolean().optional(),
      activeOnly: z.boolean().default(true),
      search: z.string().max(100).optional(),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      let rows = await db
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.companyId, companyId),
            input.activeOnly ? eq(customerContacts.isActive, 1) : undefined,
            input.customerOrgId ? eq(customerContacts.customerOrgId, input.customerOrgId) : undefined,
            input.siteId ? eq(customerContacts.siteId, input.siteId) : undefined,
            input.role ? eq(customerContacts.role, input.role) : undefined,
            input.receivesReports ? eq(customerContacts.receivesReports, 1) : undefined,
            input.receivesInvoices ? eq(customerContacts.receivesInvoices, 1) : undefined,
            input.receivesQuotes ? eq(customerContacts.receivesQuotes, 1) : undefined,
            input.search
              ? or(
                  like(customerContacts.name, `%${input.search}%`),
                  like(customerContacts.email, `%${input.search}%`),
                  like(customerContacts.phone, `%${input.search}%`),
                  like(customerContacts.companyName, `%${input.search}%`),
                )
              : undefined,
          ),
        )
        .orderBy(customerContacts.name);

      return rows;
    }),

  // ── Get single contact ──────────────────────────────────────────────────────
  getContact: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());
      const [contact] = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.id), eq(customerContacts.companyId, companyId)));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });
      return contact;
    }),

  // ── Contacts for a customer org ─────────────────────────────────────────────
  getContactsForCustomer: adminOrOfficeProcedure
    .input(z.object({ customerOrgId: z.number().int().positive(), activeOnly: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());
      return db
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.companyId, companyId),
            eq(customerContacts.customerOrgId, input.customerOrgId),
            input.activeOnly ? eq(customerContacts.isActive, 1) : undefined,
          ),
        )
        .orderBy(customerContacts.isPrimary, customerContacts.name);
    }),

  // ── Contacts for a site ─────────────────────────────────────────────────────
  getContactsForSite: adminOrOfficeProcedure
    .input(z.object({ siteId: z.number().int().positive(), activeOnly: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());
      return db
        .select()
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.companyId, companyId),
            eq(customerContacts.siteId, input.siteId),
            input.activeOnly ? eq(customerContacts.isActive, 1) : undefined,
          ),
        )
        .orderBy(customerContacts.isPrimary, customerContacts.name);
    }),

  // ── Workflow recipient suggestions ──────────────────────────────────────────
  getRecipientsForWorkflow: adminOrOfficeProcedure
    .input(z.object({
      customerOrgId: z.number().int().positive().optional(),
      siteId: z.number().int().positive().optional(),
      workflowType: workflowTypeEnum,
    }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      if (!input.customerOrgId && !input.siteId) {
        return { recommended: [], fallback: [], warnings: ["No customer or site specified."] };
      }

      const scopeFilter = or(
        input.customerOrgId ? eq(customerContacts.customerOrgId, input.customerOrgId) : undefined,
        input.siteId ? eq(customerContacts.siteId, input.siteId) : undefined,
      );

      const all = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.isActive, 1), scopeFilter))
        .orderBy(customerContacts.isPrimary, customerContacts.name);

      // Pick the right flag column for each workflow type
      const recommended = all.filter((c) => {
        switch (input.workflowType) {
          case "report":           return c.receivesReports === 1;
          case "repair_quote":     return c.receivesQuotes === 1;
          case "invoice":          return c.receivesInvoices === 1;
          case "service_call":     return c.receivesServiceUpdates === 1;
          case "compliance_notice":return c.receivesComplianceNotices === 1;
          case "general":          return c.isPrimary === 1;
        }
      });

      // Role-based fallback if no flagged contacts
      const fallback = recommended.length === 0
        ? all.filter((c) => {
            switch (input.workflowType) {
              case "report":           return c.role === "report_recipient" || c.role === "property_manager";
              case "repair_quote":     return c.role === "quote_approver" || c.role === "property_manager";
              case "invoice":          return c.role === "billing_contact" || c.role === "property_manager";
              case "service_call":     return c.role === "site_contact" || c.role === "emergency_contact";
              case "compliance_notice":return c.role === "property_manager" || c.role === "strata_manager";
              case "general":          return c.isPrimary === 1;
            }
          })
        : [];

      // Primary contact as last resort
      const primary = all.find((c) => c.isPrimary === 1);
      if (recommended.length === 0 && fallback.length === 0 && primary) {
        fallback.push(primary);
      }

      const warnings: string[] = [];
      if (recommended.length === 0 && fallback.length === 0) {
        warnings.push("No recommended recipient found for this workflow. Add a contact with the appropriate role or flag.");
      }
      const noEmail = [...recommended, ...fallback].filter((c) => !c.email);
      if (noEmail.length > 0) {
        warnings.push(`${noEmail.map((c) => c.name).join(", ")} ${noEmail.length === 1 ? "has" : "have"} no email address.`);
      }

      return { recommended, fallback, warnings };
    }),

  // ── Create contact ──────────────────────────────────────────────────────────
  createContact: adminOrOfficeProcedure
    .input(contactWriteSchema)
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      const [result] = await db.insert(customerContacts).values({
        companyId,
        customerOrgId: input.customerOrgId ?? null,
        siteId: input.siteId ?? null,
        name: input.name,
        title: input.title ?? null,
        companyName: input.companyName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        role: input.role,
        isPrimary: boolToTinyint(input.isPrimary),
        receivesReports: boolToTinyint(input.receivesReports),
        receivesQuotes: boolToTinyint(input.receivesQuotes),
        receivesInvoices: boolToTinyint(input.receivesInvoices),
        receivesServiceUpdates: boolToTinyint(input.receivesServiceUpdates),
        receivesComplianceNotices: boolToTinyint(input.receivesComplianceNotices),
        isSiteAccessContact: boolToTinyint(input.isSiteAccessContact),
        preferredMethod: input.preferredMethod,
        notes: input.notes ?? null,
        isActive: 1,
      });

      const id = (result as any).insertId as number;

      logActivity({
        ctx,
        entityType: "customer_contact",
        entityId: id,
        eventType: "created",
        title: `Contact created: ${input.name}`,
        metadata: { role: input.role, customerOrgId: input.customerOrgId, siteId: input.siteId },
      });

      return { id };
    }),

  // ── Update contact ──────────────────────────────────────────────────────────
  updateContact: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }).merge(contactWriteSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      const { id, ...fields } = input;

      const [existing] = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.id, id), eq(customerContacts.companyId, companyId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const update: Partial<typeof customerContacts.$inferInsert> = {};
      if (fields.name !== undefined) update.name = fields.name;
      if (fields.title !== undefined) update.title = fields.title ?? null;
      if (fields.companyName !== undefined) update.companyName = fields.companyName ?? null;
      if (fields.email !== undefined) update.email = fields.email ?? null;
      if (fields.phone !== undefined) update.phone = fields.phone ?? null;
      if (fields.mobile !== undefined) update.mobile = fields.mobile ?? null;
      if (fields.role !== undefined) update.role = fields.role;
      if (fields.isPrimary !== undefined) update.isPrimary = boolToTinyint(fields.isPrimary);
      if (fields.receivesReports !== undefined) update.receivesReports = boolToTinyint(fields.receivesReports);
      if (fields.receivesQuotes !== undefined) update.receivesQuotes = boolToTinyint(fields.receivesQuotes);
      if (fields.receivesInvoices !== undefined) update.receivesInvoices = boolToTinyint(fields.receivesInvoices);
      if (fields.receivesServiceUpdates !== undefined) update.receivesServiceUpdates = boolToTinyint(fields.receivesServiceUpdates);
      if (fields.receivesComplianceNotices !== undefined) update.receivesComplianceNotices = boolToTinyint(fields.receivesComplianceNotices);
      if (fields.isSiteAccessContact !== undefined) update.isSiteAccessContact = boolToTinyint(fields.isSiteAccessContact);
      if (fields.preferredMethod !== undefined) update.preferredMethod = fields.preferredMethod;
      if (fields.notes !== undefined) update.notes = fields.notes ?? null;
      if (fields.customerOrgId !== undefined) update.customerOrgId = fields.customerOrgId ?? null;
      if (fields.siteId !== undefined) update.siteId = fields.siteId ?? null;

      await db.update(customerContacts).set(update).where(eq(customerContacts.id, id));

      logActivity({
        ctx,
        entityType: "customer_contact",
        entityId: id,
        eventType: "updated",
        title: `Contact updated: ${existing.name}`,
        metadata: { changes: Object.keys(update) },
      });

      return { success: true };
    }),

  // ── Deactivate contact (soft delete) ────────────────────────────────────────
  deactivateContact: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      const [existing] = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.id), eq(customerContacts.companyId, companyId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(customerContacts).set({ isActive: 0 }).where(eq(customerContacts.id, input.id));

      logActivity({
        ctx,
        entityType: "customer_contact",
        entityId: input.id,
        eventType: "deactivated",
        title: `Contact deactivated: ${existing.name}`,
      });

      return { success: true };
    }),

  // ── Reactivate contact ──────────────────────────────────────────────────────
  reactivateContact: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());
      const [existing] = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.id, input.id), eq(customerContacts.companyId, companyId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(customerContacts).set({ isActive: 1 }).where(eq(customerContacts.id, input.id));
      return { success: true };
    }),

  // ── Set primary contact ─────────────────────────────────────────────────────
  setPrimaryContact: adminOrOfficeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      customerOrgId: z.number().int().positive().optional(),
      siteId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      // Clear isPrimary for this org/site scope, then set on the target
      if (input.customerOrgId) {
        await db
          .update(customerContacts)
          .set({ isPrimary: 0 })
          .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.customerOrgId, input.customerOrgId)));
      }
      if (input.siteId) {
        await db
          .update(customerContacts)
          .set({ isPrimary: 0 })
          .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.siteId, input.siteId)));
      }

      await db
        .update(customerContacts)
        .set({ isPrimary: 1 })
        .where(and(eq(customerContacts.id, input.id), eq(customerContacts.companyId, companyId)));

      return { success: true };
    }),

  // ── Technician-safe site contacts (assigned jobs only) ──────────────────────
  getSiteContactsForTechnician: protectedProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      // Only return site-safe roles: site_contact, emergency_contact
      // Billing, quote, and property-manager contacts are hidden from technicians
      const rows = await db
        .select({
          id: customerContacts.id,
          name: customerContacts.name,
          title: customerContacts.title,
          phone: customerContacts.phone,
          mobile: customerContacts.mobile,
          role: customerContacts.role,
          isSiteAccessContact: customerContacts.isSiteAccessContact,
          notes: customerContacts.notes,
        })
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.companyId, companyId),
            eq(customerContacts.siteId, input.siteId),
            eq(customerContacts.isActive, 1),
            or(
              eq(customerContacts.role, "site_contact"),
              eq(customerContacts.role, "emergency_contact"),
              eq(customerContacts.isSiteAccessContact, 1),
            ),
          ),
        )
        .orderBy(customerContacts.isSiteAccessContact, customerContacts.name);

      return rows;
    }),

  // ── Overview stats ──────────────────────────────────────────────────────────
  getOverviewStats: adminOrOfficeProcedure
    .query(async ({ ctx }) => {
      const companyId = ctx.user.companyId!;
      const db = requireDb(await getDb());

      const all = await db
        .select()
        .from(customerContacts)
        .where(and(eq(customerContacts.companyId, companyId), eq(customerContacts.isActive, 1)));

      return {
        totalActive: all.length,
        reportRecipients: all.filter((c) => c.receivesReports === 1).length,
        billingContacts: all.filter((c) => c.receivesInvoices === 1 || c.role === "billing_contact").length,
        quoteApprovers: all.filter((c) => c.receivesQuotes === 1 || c.role === "quote_approver").length,
        siteAccessContacts: all.filter((c) => c.isSiteAccessContact === 1).length,
        missingEmail: all.filter((c) => !c.email).length,
      };
    }),
});
