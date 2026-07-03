import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { assertAttachmentCompany } from "../tenantGuards";
import { logActivity } from "../activityLogger";
import { eq, and, inArray, desc, isNotNull, like, or } from "drizzle-orm";
import {
  reports, jobs, sites, customerOrgs, attachments, quotes, knowledgeBase,
} from "../../drizzle/schema";

async function getRawDb() {
  return db.getDb ? db.getDb() : null;
}

const DOC_TYPES = ["all", "report", "attachment", "quote", "knowledge_base"] as const;

type DocItem = {
  id: string;
  docType: "report" | "attachment" | "quote" | "knowledge_base";
  title: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  siteName: string | null;
  customerName: string | null;
  jobId: number | null;
  jobNumber: string | null;
  entityType: string | null;
  status: string | null;
  date: Date;
  href: string;
};

export const documentCenterRouter = router({
  list: officeProcedure
    .input(z.object({
      search: z.string().max(200).default(""),
      docType: z.enum(DOC_TYPES).default("all"),
      limit: z.number().int().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const rawDb = await getRawDb();

      const emptyCounts = { all: 0, report: 0, attachment: 0, quote: 0, knowledge_base: 0 };
      if (!rawDb) return { items: [], counts: emptyCounts };

      const sp = input.search ? `%${input.search}%` : null;
      const { docType, limit } = input;

      // Get all company job IDs (shared scoping)
      const companyJobRows = await rawDb
        .select({ id: jobs.id, jobNumber: jobs.jobNumber, siteId: jobs.siteId, customerOrgId: jobs.customerOrgId })
        .from(jobs)
        .where(eq(jobs.companyId, companyId));
      const companyJobIds = companyJobRows.map((j) => j.id);

      // Get all company site IDs (for site-scoped attachments)
      const companySiteRows = await rawDb
        .select({ id: sites.id, name: sites.name, customerOrgId: sites.customerOrgId })
        .from(sites)
        .where(eq(sites.companyId, companyId));
      const companySiteIds = companySiteRows.map((s) => s.id);

      const items: DocItem[] = [];

      // ── 1. Reports ─────────────────────────────────────────────────────────
      if ((docType === "all" || docType === "report") && companyJobIds.length > 0) {
        const baseWhere = and(inArray(reports.jobId, companyJobIds), isNotNull(reports.fileUrl));
        const where = sp
          ? and(baseWhere, or(like(reports.title, sp), like(reports.reportNumber, sp)))
          : baseWhere;

        const rows = await rawDb
          .select({
            id: reports.id,
            title: reports.title,
            reportNumber: reports.reportNumber,
            fileUrl: reports.fileUrl,
            status: reports.status,
            createdAt: reports.createdAt,
            jobId: jobs.id,
            jobNumber: jobs.jobNumber,
            siteName: sites.name,
            customerName: customerOrgs.name,
          })
          .from(reports)
          .innerJoin(jobs, eq(reports.jobId, jobs.id))
          .leftJoin(sites, eq(jobs.siteId, sites.id))
          .leftJoin(customerOrgs, eq(jobs.customerOrgId, customerOrgs.id))
          .where(where)
          .orderBy(desc(reports.createdAt))
          .limit(limit);

        for (const r of rows) {
          items.push({
            id: `report_${r.id}`,
            docType: "report",
            title: r.title,
            fileName: `${r.reportNumber}.pdf`,
            fileUrl: r.fileUrl ?? null,
            mimeType: "application/pdf",
            fileSize: null,
            siteName: r.siteName ?? null,
            customerName: r.customerName ?? null,
            jobId: r.jobId,
            jobNumber: r.jobNumber,
            entityType: null,
            status: r.status,
            date: r.createdAt,
            href: `/admin/report-qa`,
          });
        }
      }

      // ── 2. Attachments ─────────────────────────────────────────────────────
      if (docType === "all" || docType === "attachment") {
        const hasJobIds = companyJobIds.length > 0;
        const hasSiteIds = companySiteIds.length > 0;

        if (hasJobIds || hasSiteIds) {
          const scopeWhere = or(
            hasJobIds ? inArray(attachments.jobId, companyJobIds) : undefined,
            hasSiteIds ? inArray(attachments.siteId, companySiteIds) : undefined,
          );
          const where = sp ? and(scopeWhere, like(attachments.fileName, sp)) : scopeWhere;

          const rows = await rawDb
            .select({
              id: attachments.id,
              fileName: attachments.fileName,
              fileUrl: attachments.fileUrl,
              mimeType: attachments.mimeType,
              fileSize: attachments.fileSize,
              entityType: attachments.entityType,
              caption: attachments.caption,
              jobId: attachments.jobId,
              siteId: attachments.siteId,
              createdAt: attachments.createdAt,
            })
            .from(attachments)
            .where(where)
            .orderBy(desc(attachments.createdAt))
            .limit(limit);

          // Build quick lookup maps for context
          const jobMap = new Map(companyJobRows.map((j) => [j.id, j]));
          const siteMap = new Map(companySiteRows.map((s) => [s.id, s]));

          for (const r of rows) {
            const jobInfo = r.jobId ? jobMap.get(r.jobId) : null;
            const siteInfo = r.siteId ? siteMap.get(r.siteId) : null;
            const resolvedSiteName = siteInfo?.name ?? null;
            const resolvedJobNumber = jobInfo?.jobNumber ?? null;

            items.push({
              id: `attachment_${r.id}`,
              docType: "attachment",
              title: r.caption ?? r.fileName,
              fileName: r.fileName,
              fileUrl: r.fileUrl,
              mimeType: r.mimeType ?? null,
              fileSize: r.fileSize ?? null,
              siteName: resolvedSiteName,
              customerName: null,
              jobId: r.jobId ?? null,
              jobNumber: resolvedJobNumber,
              entityType: r.entityType,
              status: null,
              date: r.createdAt,
              href: r.jobId ? `/admin/jobs/${r.jobId}` : (r.siteId ? `/admin/sites/${r.siteId}/files` : `/admin/documents`),
            });
          }
        }
      }

      // ── 3. Quotes (PDF only) ───────────────────────────────────────────────
      if (docType === "all" || docType === "quote") {
        const baseWhere = and(eq(quotes.companyId, companyId), isNotNull(quotes.pdfUrl));
        const where = sp ? and(baseWhere, like(quotes.quoteNumber, sp)) : baseWhere;

        const rows = await rawDb
          .select({
            id: quotes.id,
            quoteNumber: quotes.quoteNumber,
            quoteType: quotes.quoteType,
            pdfUrl: quotes.pdfUrl,
            status: quotes.status,
            total: quotes.total,
            sentAt: quotes.sentAt,
            createdAt: quotes.createdAt,
            siteName: sites.name,
            customerName: customerOrgs.name,
            jobId: quotes.jobId,
          })
          .from(quotes)
          .leftJoin(sites, eq(quotes.siteId, sites.id))
          .leftJoin(customerOrgs, eq(quotes.customerOrgId, customerOrgs.id))
          .where(where)
          .orderBy(desc(quotes.createdAt))
          .limit(limit);

        // Build job number map for quotes
        const quoteJobIds = Array.from(new Set(rows.map((r) => r.jobId).filter((id): id is number => id != null)));
        const jobNumMap = new Map<number, string>();
        if (quoteJobIds.length > 0) {
          const qjRows = await rawDb.select({ id: jobs.id, jobNumber: jobs.jobNumber }).from(jobs).where(inArray(jobs.id, quoteJobIds));
          for (const j of qjRows) jobNumMap.set(j.id, j.jobNumber);
        }

        for (const r of rows) {
          const qNum = r.quoteNumber ?? `Q-${r.id}`;
          items.push({
            id: `quote_${r.id}`,
            docType: "quote",
            title: `Quote ${qNum}${r.quoteType === "repair" ? " (Repair)" : ""}`,
            fileName: `${qNum}.pdf`,
            fileUrl: r.pdfUrl ?? null,
            mimeType: "application/pdf",
            fileSize: null,
            siteName: r.siteName ?? null,
            customerName: r.customerName ?? null,
            jobId: r.jobId,
            jobNumber: r.jobId ? (jobNumMap.get(r.jobId) ?? null) : null,
            entityType: r.quoteType,
            status: r.status,
            date: r.sentAt ?? r.createdAt,
            href: `/admin/repair-quotes/${r.id}`,
          });
        }
      }

      // ── 4. Knowledge base ──────────────────────────────────────────────────
      if (docType === "all" || docType === "knowledge_base") {
        const baseWhere = and(
          eq(knowledgeBase.companyId, companyId),
          isNotNull(knowledgeBase.fileUrl),
          eq(knowledgeBase.isActive, true), // deactivated (removed) docs drop out of the center
        );
        const where = sp
          ? and(baseWhere, like(knowledgeBase.title, sp))
          : baseWhere;

        const rows = await rawDb
          .select({
            id: knowledgeBase.id,
            title: knowledgeBase.title,
            category: knowledgeBase.category,
            fileUrl: knowledgeBase.fileUrl,
            createdAt: knowledgeBase.createdAt,
          })
          .from(knowledgeBase)
          .where(where)
          .orderBy(desc(knowledgeBase.createdAt))
          .limit(limit);

        for (const r of rows) {
          items.push({
            id: `kb_${r.id}`,
            docType: "knowledge_base",
            title: r.title,
            fileName: null,
            fileUrl: r.fileUrl ?? null,
            mimeType: null,
            fileSize: null,
            siteName: null,
            customerName: null,
            jobId: null,
            jobNumber: null,
            entityType: r.category,
            status: null,
            date: r.createdAt,
            href: `/admin/documents`,
          });
        }
      }

      // Sort all items by date desc, then apply limit
      items.sort((a, b) => b.date.getTime() - a.date.getTime());
      const limited = items.slice(0, limit);

      const counts = {
        all: items.length,
        report: items.filter((i) => i.docType === "report").length,
        attachment: items.filter((i) => i.docType === "attachment").length,
        quote: items.filter((i) => i.docType === "quote").length,
        knowledge_base: items.filter((i) => i.docType === "knowledge_base").length,
      };

      return { items: limited, counts };
    }),

  /**
   * Remove a document from the Document Center.
   *
   * Only attachments and knowledge-base documents are removable here (reports and
   * quotes are business records managed from their own pages and are rejected).
   *   - attachment     → hard-deleted (blocked if it belongs to a finalized job)
   *   - knowledge_base → deactivated (reversible; manage from the Knowledge Base page)
   *
   * `id` is the composite Document Center id, e.g. "attachment_45" or "kb_89".
   */
  remove: officeProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const match = /^(attachment|kb)_(\d+)$/.exec(input.id);
      if (!match) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only attachments and knowledge base documents can be removed here. Manage reports and quotes from their own pages.",
        });
      }
      const kind = match[1];
      const id = Number(match[2]);

      if (kind === "attachment") {
        const attachment = await assertAttachmentCompany(id, companyId);
        if (attachment.jobId) {
          const job = await db.getJobById(attachment.jobId);
          if (job?.finalizedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This file belongs to a finalized job and cannot be removed.",
            });
          }
        }
        await db.deleteAttachment(id);
        void logActivity({
          ctx, entityType: "attachment", entityId: id, eventType: "attachment.deleted",
          title: `Document removed: ${attachment.fileName ?? `attachment ${id}`}`, metadata: {},
        });
        return { success: true as const, removed: "attachment" as const };
      }

      // knowledge_base: soft-delete (deactivate) — reversible from the Knowledge Base page.
      const kb = await db.getKnowledgeBaseById(id);
      if (!kb || kb.companyId !== companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "NOT_FOUND" });
      await db.updateKnowledgeBaseEntry(id, { isActive: false });
      void logActivity({
        ctx, entityType: "knowledge_base", entityId: id, eventType: "knowledge_base.deactivated",
        title: `Document removed from center: ${kb.title}`, metadata: {},
      });
      return { success: true as const, removed: "knowledge_base" as const };
    }),
});
