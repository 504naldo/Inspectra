import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import { eq, and, sql, count } from "drizzle-orm";
import {
  users,
  customerOrgs,
  sites,
  partsCatalog,
  inventoryItems,
  importLogs,
  knowledgeBase,
  setupProgress,
  SETUP_STEP_KEYS,
  SETUP_STEP_STATUSES,
  type SetupStepKey,
  type SetupStepStatus,
} from "../../drizzle/schema";

// ─── Step metadata ────────────────────────────────────────────────────────────

export const STEP_META: { key: SetupStepKey; label: string; description: string }[] = [
  {
    key: "company_profile",
    label: "Company Profile",
    description: "Set your company name, email, address, phone, and logo.",
  },
  {
    key: "business_settings",
    label: "Business Settings",
    description: "Configure tax rates, labour rates, and quote validity.",
  },
  {
    key: "users_roles",
    label: "Users & Roles",
    description: "Add admin, office, and technician users.",
  },
  {
    key: "customers_sites",
    label: "Customers & Sites",
    description: "Add your first customers and their inspection sites.",
  },
  {
    key: "imports",
    label: "Imports",
    description: "Import existing devices, sites, and customer data.",
  },
  {
    key: "parts_inventory",
    label: "Parts & Inventory",
    description: "Set up your parts catalog and initial inventory.",
  },
  {
    key: "reports_documents",
    label: "Reports & Documents",
    description: "Configure report footer text and document settings.",
  },
  {
    key: "invoices_sage",
    label: "Invoices & Sage",
    description: "Set invoice numbering prefix and Sage export settings.",
  },
  {
    key: "payroll_time",
    label: "Payroll & Time",
    description: "Configure labour rates for payroll hours.",
  },
  {
    key: "ai_knowledge",
    label: "AI & Knowledge Base",
    description: "Add knowledge base articles for the AI assistant.",
  },
  {
    key: "final_review",
    label: "Final Review",
    description: "Review all setup steps and mark setup complete.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StepCounts = {
  adminCount: number;
  officeCount: number;
  technicianCount: number;
  customerCount: number;
  siteCount: number;
  partsCatalogCount: number;
  inventoryCount: number;
  importCount: number;
  kbCount: number;
  hasCompanyName: boolean;
  hasCompanyEmail: boolean;
  hasDisplayName: boolean;
  hasLabourRate: boolean;
  hasInvoicePrefix: boolean;
  hasSageSettings: boolean;
  hasReportFooter: boolean;
};

function computeAutoComplete(step: SetupStepKey, c: StepCounts): boolean {
  switch (step) {
    case "company_profile":
      return c.hasCompanyName && c.hasCompanyEmail;
    case "business_settings":
      return c.hasLabourRate;
    case "users_roles":
      return c.adminCount >= 1 && c.technicianCount >= 1;
    case "customers_sites":
      return c.customerCount > 0 && c.siteCount > 0;
    case "imports":
      return c.importCount > 0;
    case "parts_inventory":
      return c.partsCatalogCount > 0;
    case "reports_documents":
      return c.hasReportFooter;
    case "invoices_sage":
      return c.hasInvoicePrefix || c.hasSageSettings;
    case "payroll_time":
      return c.hasLabourRate;
    case "ai_knowledge":
      return c.kbCount > 0;
    case "final_review":
      return false; // Always requires manual completion
    default:
      return false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const stepKeySchema = z.enum(SETUP_STEP_KEYS);
const statusSchema = z.enum(SETUP_STEP_STATUSES);

export const setupRouter = router({
  getOverview: officeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const drizzle = await getDb();
    if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const [
      company,
      settings,
      userRows,
      [{ value: customerCount }],
      [{ value: siteCount }],
      [{ value: partsCatalogCount }],
      [{ value: inventoryCount }],
      [{ value: importCount }],
      [{ value: kbCount }],
      stepRows,
    ] = await Promise.all([
      db.getCompanyById(companyId),
      db.getCompanySettings(companyId),
      db.getAllUsers(companyId),
      drizzle
        .select({ value: count() })
        .from(customerOrgs)
        .where(eq(customerOrgs.companyId, companyId)),
      drizzle
        .select({ value: count() })
        .from(sites)
        .where(eq(sites.companyId, companyId)),
      drizzle
        .select({ value: count() })
        .from(partsCatalog)
        .where(and(eq(partsCatalog.companyId, companyId), eq(partsCatalog.isActive, true))),
      drizzle
        .select({ value: count() })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.companyId, companyId), eq(inventoryItems.isActive, true))),
      drizzle
        .select({ value: count() })
        .from(importLogs)
        .where(eq(importLogs.companyId, companyId)),
      drizzle
        .select({ value: count() })
        .from(knowledgeBase)
        .where(eq(knowledgeBase.companyId, companyId)),
      drizzle
        .select()
        .from(setupProgress)
        .where(eq(setupProgress.companyId, companyId)),
    ]);

    const adminCount = userRows.filter((u) => u.role === "admin" && u.isActive).length;
    const officeCount = userRows.filter((u) => u.role === "office" && u.isActive).length;
    const technicianCount = userRows.filter((u) => u.role === "technician" && u.isActive).length;

    const counts: StepCounts = {
      adminCount,
      officeCount,
      technicianCount,
      customerCount,
      siteCount,
      partsCatalogCount,
      inventoryCount,
      importCount,
      kbCount,
      hasCompanyName: !!company?.name,
      hasCompanyEmail: !!company?.email,
      hasDisplayName: !!settings?.companyDisplayName,
      hasLabourRate: Number(settings?.technicianLabourRate ?? 0) > 0,
      hasInvoicePrefix:
        !!settings?.invoiceNumberPrefix && settings.invoiceNumberPrefix !== "INV",
      hasSageSettings: !!settings?.sageDefaultGlCode,
      hasReportFooter: !!settings?.reportFooterText,
    };

    const manualStatusMap: Partial<Record<SetupStepKey, SetupStepStatus>> = {};
    for (const row of stepRows) {
      manualStatusMap[row.stepKey as SetupStepKey] = row.status as SetupStepStatus;
    }

    const steps = SETUP_STEP_KEYS.map((key) => {
      const manualStatus = manualStatusMap[key] ?? "not_started";
      const autoComplete = computeAutoComplete(key, counts);
      let effectiveStatus: SetupStepStatus;
      if (manualStatus === "completed" || manualStatus === "skipped") {
        effectiveStatus = manualStatus;
      } else if (autoComplete) {
        effectiveStatus = "completed";
      } else {
        effectiveStatus = manualStatus;
      }
      const meta = STEP_META.find((m) => m.key === key)!;
      return {
        key,
        label: meta.label,
        description: meta.description,
        effectiveStatus,
        manualStatus,
        autoComplete,
      };
    });

    const completedCount = steps.filter(
      (s) => s.effectiveStatus === "completed" || s.effectiveStatus === "skipped",
    ).length;
    const totalSteps = steps.length;

    return {
      counts: {
        adminCount,
        officeCount,
        technicianCount,
        customerCount,
        siteCount,
        partsCatalogCount,
        inventoryCount,
        importCount,
        kbCount,
        totalUsers: userRows.length,
        activeUsers: userRows.filter((u) => u.isActive).length,
      },
      company: {
        name: company?.name ?? null,
        email: company?.email ?? null,
        displayName: settings?.companyDisplayName ?? null,
      },
      settings: {
        invoicePrefix: settings?.invoiceNumberPrefix ?? null,
        invoiceDueDays: settings?.invoiceDueDays ?? null,
        techLabourRate: settings?.technicianLabourRate ?? null,
        sageGlCode: settings?.sageDefaultGlCode ?? null,
        reportFooter: settings?.reportFooterText ?? null,
      },
      steps,
      completedCount,
      totalSteps,
      isComplete: completedCount === totalSteps,
    };
  }),

  updateStepStatus: adminProcedure
    .input(z.object({ stepKey: stepKeySchema, status: statusSchema, notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const completedAt =
        input.status === "completed" || input.status === "skipped" ? new Date() : null;

      await drizzle
        .insert(setupProgress)
        .values({
          companyId,
          stepKey: input.stepKey,
          status: input.status,
          completedAt: completedAt ?? undefined,
          completedById: completedAt ? ctx.user.id : undefined,
          notes: input.notes ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: sql`VALUES(status)`,
            completedAt: sql`VALUES(completedAt)`,
            completedById: sql`VALUES(completedById)`,
            notes: sql`VALUES(notes)`,
            updatedAt: new Date(),
          },
        });

      if (input.status === "completed" || input.status === "skipped") {
        void logActivity({
          ctx,
          entityType: "setup",
          entityId: companyId,
          eventType: `setup_step_${input.status}`,
          title: `Setup step "${input.stepKey}" marked as ${input.status}`,
        });
      }

      return { ok: true };
    }),
});
