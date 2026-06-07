/**
 * aiAssistantRouter — Internal AI assistant for admin/office users.
 *
 * Rules:
 * - All procedures are officeProcedure (admin + office only)
 * - companyId always comes from ctx.user.companyId — never trusted from client
 * - No destructive mutations — read and draft only
 * - Never expose cross-company data
 * - Never send emails, approve quotes, or close records
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { logActivity } from "../activityLogger";

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Inspectra AI, an internal assistant for fire protection inspection companies.
You help admin and office staff work faster by summarizing records, drafting text, and recommending next actions.

Rules you must always follow:
- Only report facts from the data provided. Never invent record details.
- Do not claim something was sent, approved, or paid unless the record data says so.
- Do not provide legal or code compliance guarantees as final authority.
- Always label generated customer text as a draft requiring human review.
- Recommend actions but do not perform them.
- Be concise. Prefer bullet points over long paragraphs.
- You are not a public chatbot. Only respond to fire protection operations questions.
- Use knowledge base content as internal reference material. If it is missing or unclear, say so instead of inventing.`;

const FIELD_COPILOT_SYSTEM_PROMPT = `You are Inspectra AI Field Copilot, an assistant for fire protection technicians working in the field.

Rules you must always follow:
- Only report facts from the data provided. Never invent device serial numbers, locations, or test results.
- Do not claim a job is complete or compliant unless the data clearly supports it.
- Do not tell a technician to skip any required inspection steps.
- Do not guarantee code compliance or pass/fail outcomes.
- Label any drafted text as a draft requiring review before saving.
- Be brief. Technicians are on-site on mobile — short clear answers only.
- Recommend actions but do not perform them.
- When data is missing, say so explicitly rather than guessing.
- Remind technicians to verify information before saving or submitting.
- You are not a public chatbot. Only respond to fire protection field operations questions.`;

const ADMIN_COPILOT_SYSTEM_PROMPT = `You are Inspectra AI Admin Copilot, an assistant for fire protection company office and admin staff.

Rules you must always follow:
- Only report facts from the data provided. Never invent record counts, IDs, or status values.
- Do not approve reports, quotes, or invoices. Do not close deficiencies.
- Do not send emails, create records, or mark anything as paid or exported.
- Recommend actions but do not perform them.
- Be concise. Prefer bullet points over long paragraphs.
- Always label customer-facing text as drafts requiring human review before sending.
- Flag compliance risks as requiring human judgment — you are not the final authority.
- You are not a public chatbot. Only respond to fire protection operations questions.
- Use knowledge base content as internal reference material.`;

// ── Context builders ──────────────────────────────────────────────────────────

async function buildJobContext(jobId: number, companyId: number): Promise<string> {
  const job = await db.getJobById(jobId);
  if (!job || job.companyId !== companyId) return "(job not found or access denied)";

  const [site, stats, deficiencies, reports] = await Promise.all([
    db.getSiteById(job.siteId),
    db.getInspectionStats(jobId),
    db.getDeficienciesByJob(jobId),
    db.getReportsByJob(jobId),
  ]);

  const openDefs = deficiencies.filter(d => d.status === "open" || d.status === "in_progress");
  const critDefs = openDefs.filter(d => d.severity === "critical");
  const report = reports[0];

  return [
    `JOB: ${job.jobNumber} — ${job.title}`,
    `Type: ${job.jobType} | Status: ${job.status} | Priority: ${job.priority}`,
    `Site: ${site?.name ?? "Unknown"}, ${site?.address ?? ""}`,
    `Customer: ${site?.city ?? ""} | Building ID: ${site?.buildingId ?? "none"}`,
    `Scheduled: ${job.scheduledDate ? new Date(job.scheduledDate).toDateString() : "not set"}`,
    `Completed: ${job.completedAt ? new Date(job.completedAt).toDateString() : "not yet"}`,
    `Devices: ${stats.total} total, ${stats.pass} pass, ${stats.fail} fail, ${stats.notTested} not tested`,
    `Deficiencies: ${deficiencies.length} total, ${openDefs.length} open, ${critDefs.length} critical`,
    `Report: ${report ? `${report.reportNumber} (${report.status})` : "no report yet"}`,
  ].join("\n");
}

async function buildSiteContext(siteId: number, companyId: number): Promise<string> {
  const site = await db.getSiteById(siteId);
  if (!site || site.companyId !== companyId) return "(site not found or access denied)";

  const [org, wsi] = await Promise.all([
    site.customerOrgId ? db.getCustomerOrgById(site.customerOrgId) : Promise.resolve(null),
    db.getWorkSiteInfoBySiteId(siteId),
  ]);

  return [
    `SITE: ${site.name}`,
    `Address: ${site.address ?? ""}, ${site.city ?? ""}`,
    `Customer Org: ${org?.name ?? "none"}`,
    `Building ID: ${site.buildingId ?? "none"} | File #: ${site.fileNumber ?? "none"}`,
    wsi?.accessNotes ? `Access notes: ${wsi.accessNotes}` : "",
    wsi?.fireAlarmPanelLocation ? `FA Panel: ${wsi.fireAlarmPanelLocation}` : "",
    wsi?.monitoringCompany ? `Monitoring: ${wsi.monitoringCompany} / ${wsi.monitoringPhone ?? "?"}` : "",
  ].filter(Boolean).join("\n");
}

async function buildDeficiencyContext(defId: number, companyId: number): Promise<string> {
  const result = await db.getDeficiencyById(defId);
  if (!result) return "(deficiency not found)";
  const def = (result as any).deficiency ?? result;
  const job = await db.getJobById(def.jobId);
  if (!job || job.companyId !== companyId) return "(access denied)";

  const device = def.deviceId ? await db.getDeviceById(def.deviceId) : null;

  return [
    `DEFICIENCY: ${def.title}`,
    `Severity: ${def.severity} | Status: ${def.status}`,
    `System: ${def.systemCategory ?? "unspecified"}`,
    device ? `Device: ${device.deviceType} at ${device.location ?? "unknown location"}` : "",
    def.observedIssue ? `Observed: ${def.observedIssue}` : "",
    def.description ? `Description: ${def.description.slice(0, 300)}` : "",
    def.correctiveAction ? `Corrective action: ${def.correctiveAction.slice(0, 200)}` : "",
    def.customerExplanation ? `Customer explanation: ${def.customerExplanation.slice(0, 200)}` : "",
  ].filter(Boolean).join("\n");
}

async function buildInvoiceContext(invoiceId: number, companyId: number): Promise<string> {
  const invoice = await db.getInvoiceById(invoiceId);
  if (!invoice || invoice.companyId !== companyId) return "(invoice not found or access denied)";

  const lineItems = (invoice.lineItems as any[] | null) ?? [];
  const itemSummary = lineItems.slice(0, 8).map((li: any) => `  - ${li.description ?? "item"}: $${li.total ?? li.amount ?? "?"}`).join("\n");

  return [
    `INVOICE: ${invoice.invoiceNumber}`,
    `Status: ${invoice.status} | Total: $${invoice.total ?? "?"}`,
    `Due: ${invoice.dueDate ? new Date(invoice.dueDate).toDateString() : "not set"}`,
    `Sage: ${(invoice as any).sageStatus ?? "not exported"}`,
    `Line items (${lineItems.length}):`,
    itemSummary || "  (none)",
    invoice.notes ? `Notes: ${(invoice.notes as string).slice(0, 200)}` : "",
  ].filter(Boolean).join("\n");
}

async function buildRepairQuoteContext(quoteId: number, companyId: number): Promise<string> {
  const quote = await db.getQuoteById(quoteId);
  if (!quote || quote.companyId !== companyId) return "(quote not found or access denied)";

  const [items, site, customer] = await Promise.all([
    db.getRepairQuoteItemsByQuote(quoteId),
    db.getSiteById(quote.siteId),
    db.getCustomerOrgById(quote.customerOrgId),
  ]);

  const itemSummary = items.slice(0, 8).map((i: any) =>
    `  - ${i.description ?? "item"}: qty ${i.quantity ?? 1} @ $${i.unitPrice ?? "?"}`
  ).join("\n");

  return [
    `REPAIR QUOTE: ${(quote as any).quoteNumber ?? quoteId}`,
    `Status: ${(quote as any).status ?? "draft"} | Total: $${(quote as any).total ?? "?"}`,
    `Site: ${site?.name ?? "unknown"}, ${site?.address ?? ""}`,
    `Customer: ${customer?.name ?? "unknown"}`,
    `Items (${items.length}):`,
    itemSummary || "  (none)",
    (quote as any).scopeWording ? `Scope: ${(quote as any).scopeWording.slice(0, 300)}` : "",
    (quote as any).notes ? `Notes: ${(quote as any).notes.slice(0, 200)}` : "",
  ].filter(Boolean).join("\n");
}

async function buildApprovedWorkContext(awId: number, companyId: number): Promise<string> {
  const aw = await db.getApprovedWorkById(awId);
  if (!aw || aw.companyId !== companyId) return "(approved work not found or access denied)";

  const site = aw.siteId ? await db.getSiteById(aw.siteId) : null;
  const customer = aw.customerOrgId ? await db.getCustomerOrgById(aw.customerOrgId) : null;

  return [
    `APPROVED WORK: ${aw.title}`,
    `Type: ${aw.type} | Status: ${aw.status}`,
    `Site: ${site?.name ?? "unknown"}`,
    `Customer: ${customer?.name ?? "unknown"}`,
    `Scheduled: ${aw.scheduledDate ? new Date(aw.scheduledDate).toDateString() : "not set"}`,
    aw.description ? `Description: ${aw.description.slice(0, 300)}` : "",
  ].filter(Boolean).join("\n");
}

type ContextType = "job" | "site" | "deficiency" | "report" | "repair_quote" | "approved_work" | "work_order" | "invoice" | "compliance";

// ── Admin briefing context builder ────────────────────────────────────────────
// Converts getOperationsSummary into a compact text block for AI context.
// Excludes secrets, raw DB dumps, and cross-company data.

async function buildAdminBriefingContext(companyId: number): Promise<string> {
  const ops = await db.getOperationsSummary(companyId);
  if (!ops) return "(operations data unavailable)";

  const { snapshot, attentionQueue, invoiceSummary, approvedWorkByStatus, dataQuality } = ops;

  const topItems = attentionQueue.slice(0, 10).map(item =>
    `  [${item.type.replace(/_/g, " ").toUpperCase()}] ${item.title}${item.siteName ? ` — ${item.siteName}` : ""}${item.severity ? ` — ${item.severity}` : ""} — ${item.ageInDays}d old — ${item.status}`
  ).join("\n");

  const awSummary = Object.entries(approvedWorkByStatus)
    .filter(([, n]) => (n as number) > 0)
    .map(([k, n]) => `${k.replace(/_/g, " ")}: ${n}`)
    .join(", ");

  const invSummary = Object.entries(invoiceSummary)
    .filter(([, n]) => (n as number) > 0)
    .map(([k, n]) => `${k}: ${n}`)
    .join(", ");

  const dqLines: string[] = [];
  if (dataQuality.sitesMissingBuildingId > 0) dqLines.push(`  - ${dataQuality.sitesMissingBuildingId} sites missing Building ID`);
  if (dataQuality.sitesMissingFileNumber > 0) dqLines.push(`  - ${dataQuality.sitesMissingFileNumber} sites missing File Number`);
  if (dataQuality.sitesMissingCustomerOrg > 0) dqLines.push(`  - ${dataQuality.sitesMissingCustomerOrg} sites missing Customer Org`);

  return [
    `OPERATIONS SUMMARY — ${new Date().toDateString()}`,
    "---",
    "SNAPSHOT:",
    `  Jobs today: ${snapshot.jobsToday}`,
    `  Overdue jobs: ${snapshot.overdueJobs}`,
    `  Reports pending QA review: ${snapshot.reportsPendingReview}`,
    `  Open deficiencies: ${snapshot.openDeficiencies}`,
    `  Approved work ready to schedule: ${snapshot.approvedWorkReadyToSchedule}`,
    `  Repair quotes pending: ${snapshot.repairQuotesPending}`,
    `  Invoices ready for Sage export: ${snapshot.invoicesReadyForExport}`,
    `  Completed this week: ${snapshot.completedThisWeek}`,
    "",
    `ATTENTION QUEUE (${attentionQueue.length} total items, showing top 10):`,
    topItems || "  (none)",
    "",
    `INVOICE SUMMARY: ${invSummary || "none"}`,
    `APPROVED WORK STATUS: ${awSummary || "none"}`,
    dqLines.length > 0 ? `DATA QUALITY ISSUES:\n${dqLines.join("\n")}` : "DATA QUALITY: no issues detected",
    "",
    `TOTALS: ${ops.totalSites} sites, ${ops.totalJobs} jobs`,
  ].join("\n");
}

async function fetchContext(type: ContextType, id: number, companyId: number): Promise<string> {
  switch (type) {
    case "job": return buildJobContext(id, companyId);
    case "site": return buildSiteContext(id, companyId);
    case "deficiency": return buildDeficiencyContext(id, companyId);
    case "invoice": return buildInvoiceContext(id, companyId);
    case "repair_quote": return buildRepairQuoteContext(id, companyId);
    case "approved_work": return buildApprovedWorkContext(id, companyId);
    default: return `(context type '${type}' not supported — summarize based on the question alone)`;
  }
}

// ── Technician-safe context builder ──────────────────────────────────────────
// Excludes: invoices, pricing, Sage data, admin-only notes, customer billing

async function buildTechnicianJobContext(jobId: number, companyId: number): Promise<string> {
  const job = await db.getJobById(jobId);
  if (!job || job.companyId !== companyId) return "(job not found or access denied)";

  const [site, wsi, stats, deficiencies, technicians] = await Promise.all([
    db.getSiteById(job.siteId),
    db.getWorkSiteInfoBySiteId(job.siteId),
    db.getInspectionStats(jobId),
    db.getDeficienciesByJob(jobId),
    db.getJobTechnicians(jobId),
  ]);

  const devices = await db.getDevicesBySite(job.siteId);
  const openDefs = deficiencies.filter(d => d.status === "open" || d.status === "in_progress");
  const critDefs = openDefs.filter(d => d.severity === "critical");

  // Previous deficiencies from last finalized job at this site
  let prevDefSummary = "";
  const lastJob = await db.getLastCompletedJobForSite(job.siteId);
  if (lastJob && lastJob.id !== jobId) {
    const prevDefs = await db.getDeficienciesByJob(lastJob.id);
    const unresolvedPrev = prevDefs.filter(d => d.status !== "resolved" && d.status !== "closed");
    if (unresolvedPrev.length > 0) {
      prevDefSummary = `Previous unresolved deficiencies (from ${lastJob.jobNumber}): ${unresolvedPrev.length} — ${unresolvedPrev.slice(0, 3).map(d => d.title).join("; ")}`;
    }
  }

  const keyInfo = [
    wsi?.keyNumber ? `Key #${wsi.keyNumber}` : "",
    wsi?.keyLocation ? `at ${wsi.keyLocation}` : "",
    wsi?.lockboxCode ? `lockbox: ${wsi.lockboxCode}` : "",
  ].filter(Boolean).join(", ");

  return [
    `JOB: ${job.jobNumber} — ${job.title}`,
    `Type: ${job.jobType} | Status: ${job.status}`,
    `Scheduled: ${job.scheduledDate ? new Date(job.scheduledDate).toDateString() : "not scheduled"}`,
    `Site: ${site?.name ?? "Unknown"}, ${site?.address ?? ""}, ${site?.city ?? ""}`,
    site?.contactPhone ? `Site phone: ${site.contactPhone}` : "",
    wsi?.accessNotes ? `Access notes: ${wsi.accessNotes}` : "",
    keyInfo ? `Key/access info: ${keyInfo}` : "",
    wsi?.fireAlarmPanelLocation ? `FA panel: ${wsi.fireAlarmPanelLocation}${wsi.annunciatorLocation ? ` · Annunciator: ${wsi.annunciatorLocation}` : ""}` : "",
    wsi?.monitoringCompany ? `Monitoring: ${wsi.monitoringCompany}${wsi.monitoringPhone ? ` (${wsi.monitoringPhone})` : ""}` : "",
    wsi?.sprinklerNotes ? `Sprinkler notes: ${wsi.sprinklerNotes}` : "",
    wsi?.emergencyLightingNotes ? `Emergency lighting: ${wsi.emergencyLightingNotes}` : "",
    `Devices at site: ${devices.length} total`,
    `Inspection progress: ${stats.pass + stats.fail + stats.na}/${devices.length} tested (${stats.pass} pass, ${stats.fail} fail, ${stats.na} N/A, ${stats.notTested} not tested)`,
    `Open deficiencies: ${openDefs.length} (${critDefs.length} critical)`,
    openDefs.length > 0 ? `Open deficiency list: ${openDefs.slice(0, 5).map(d => `[${d.severity}] ${d.title}`).join("; ")}` : "",
    prevDefSummary,
    technicians.lead ? `Lead technician: ${technicians.lead.name}` : "",
  ].filter(Boolean).join("\n");
}

// ── Job access verification for field copilot ─────────────────────────────────

async function verifyJobAccessForCopilot(jobId: number, userId: number, role: string, companyId: number) {
  const job = await db.getJobById(jobId);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  if (job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  if (role === "admin" || role === "office") return job;
  const assigned = await db.isUserAssignedToJob(jobId, userId);
  if (!assigned) throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this job" });
  return job;
}

// ── Helper: extract text from LLM response ────────────────────────────────────

function extractText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return content.map((c: any) => ("text" in c ? c.text : "")).join("");
}

// ── Router ────────────────────────────────────────────────────────────────────

export const aiAssistantRouter = router({

  /**
   * ask — General-purpose assistant endpoint.
   * Supports optional record context for grounded answers.
   */
  ask: officeProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      mode: z.enum(["general", "summarize", "deficiency_help", "report_qa", "repair_quote", "invoice", "compliance", "workflow_help"]).default("general"),
      contextType: z.enum(["job", "site", "deficiency", "report", "repair_quote", "approved_work", "work_order", "invoice", "compliance"]).optional(),
      contextId: z.number().int().positive().optional(),
      useKnowledgeBase: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      let contextBlock = "";
      if (input.contextType && input.contextId) {
        contextBlock = await fetchContext(input.contextType, input.contextId, companyId);
      }

      // Fetch relevant knowledge base snippets if enabled
      const KB_ELIGIBLE_MODES = new Set(["deficiency_help", "report_qa", "repair_quote", "invoice", "compliance", "workflow_help", "general"]);
      let knowledgeSnippets: Array<{ id: number; title: string; category: string; systemType: string | null; excerpt: string }> = [];
      if (input.useKnowledgeBase && KB_ELIGIBLE_MODES.has(input.mode)) {
        knowledgeSnippets = await db.getRelevantKnowledgeContext(companyId, input.message, {
          mode: input.mode,
          limit: 3,
        });
      }

      const modeHints: Record<string, string> = {
        summarize: "Summarize the provided context in 3-5 bullet points. Be factual.",
        deficiency_help: "Help write professional deficiency text for fire inspection reports.",
        report_qa: "Review report completeness and suggest corrections. Flag missing data.",
        repair_quote: "Help draft scope wording, customer-facing descriptions, and line item clarity.",
        invoice: "Help draft invoice notes, payment reminders, and customer explanations.",
        compliance: "Summarize compliance risk and recommend priority actions.",
        workflow_help: "Explain Inspectra workflows and where to find modules.",
        general: "",
      };

      const modeInstruction = modeHints[input.mode] ?? "";

      const kbBlock = knowledgeSnippets.length > 0
        ? `\n\nINTERNAL KNOWLEDGE BASE REFERENCE:\n${knowledgeSnippets.map(s =>
            `[${s.title} | ${s.category}${s.systemType ? ` | ${s.systemType}` : ""}]\n${s.excerpt}`
          ).join("\n\n")}`
        : "";

      const userMessage = [
        modeInstruction ? `[Mode: ${input.mode}] ${modeInstruction}` : "",
        contextBlock ? `\n\nCONTEXT DATA:\n${contextBlock}` : "",
        kbBlock,
        `\n\nUSER QUESTION:\n${input.message}`,
      ].filter(Boolean).join("");

      const result = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        maxTokens: 800,
      });

      const answer = extractText(result);
      if (!answer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });

      void logActivity({
        ctx,
        entityType: input.contextType ?? "assistant",
        entityId: input.contextId ?? 0,
        eventType: "ai_assistant.ask",
        title: `AI assistant used (mode: ${input.mode})`,
        metadata: {
          mode: input.mode,
          contextType: input.contextType,
          contextId: input.contextId,
          kbItemsUsed: knowledgeSnippets.map(s => s.id),
        },
      });

      return {
        answer,
        mode: input.mode,
        contextUsed: input.contextType && input.contextId ? `${input.contextType}:${input.contextId}` : null,
        knowledgeUsed: knowledgeSnippets.map(s => ({ id: s.id, title: s.title, category: s.category, systemType: s.systemType })),
      };
    }),

  /**
   * getContextSummary — Returns a text summary of a record for display in the assistant UI.
   */
  getContextSummary: officeProcedure
    .input(z.object({
      contextType: z.enum(["job", "site", "deficiency", "report", "repair_quote", "approved_work", "work_order", "invoice", "compliance"]),
      contextId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const summary = await fetchContext(input.contextType, input.contextId, companyId);
      return { summary, contextType: input.contextType, contextId: input.contextId };
    }),

  /**
   * draftCustomerMessage — Generates a draft customer-facing message.
   * Returns draft only — never sends automatically.
   */
  draftCustomerMessage: officeProcedure
    .input(z.object({
      type: z.enum(["report_ready", "repair_quote", "invoice", "deficiency_followup", "compliance_notice"]),
      entityId: z.number().int().positive(),
      tone: z.enum(["professional", "friendly", "urgent"]).default("professional"),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      const contextTypeMap: Record<string, ContextType> = {
        report_ready: "report",
        repair_quote: "repair_quote",
        invoice: "invoice",
        deficiency_followup: "deficiency",
        compliance_notice: "site",
      };

      const contextType = contextTypeMap[input.type] as ContextType;
      const contextBlock = await fetchContext(contextType, input.entityId, companyId);

      const typeInstructions: Record<string, string> = {
        report_ready: "Write a professional email notifying the customer that their inspection report is ready for review. Include key findings summary if data is available.",
        repair_quote: "Write a professional email presenting a repair quote to the customer. Summarize the scope and total. Encourage them to review and approve.",
        invoice: "Write a professional invoice accompaniment email. Include invoice number, total, and due date. Be courteous and clear.",
        deficiency_followup: "Write a professional follow-up email about an outstanding fire safety deficiency. Be factual about the severity and corrective action required.",
        compliance_notice: "Write a professional compliance notice to the site contact. Be factual about outstanding issues.",
      };

      const instruction = typeInstructions[input.type] ?? "Draft a professional customer communication.";

      const result = await invokeLLM({
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\nYou are drafting customer-facing communications for a fire protection company. Tone: ${input.tone}. Always label outputs as drafts.` },
          { role: "user", content: `${instruction}\n\nCONTEXT:\n${contextBlock}\n\nProvide: subject line and email body. Start subject with "Subject: ". Start body on a new line after "---".` },
        ],
        maxTokens: 600,
      });

      const raw = extractText(result);
      const subjectMatch = raw.match(/Subject:\s*(.+)/);
      const bodyMatch = raw.split("---")[1]?.trim();

      void logActivity({
        ctx,
        entityType: contextType,
        entityId: input.entityId,
        eventType: "ai_assistant.draftCustomerMessage",
        title: `AI draft customer message (type: ${input.type})`,
        metadata: { type: input.type, tone: input.tone },
      });

      return {
        subject: subjectMatch ? subjectMatch[1].trim() : "Inspection Update",
        body: bodyMatch ?? raw,
        isDraft: true,
        disclaimer: "Review before sending. AI-generated draft.",
      };
    }),

  /**
   * draftDeficiencyText — Structured deficiency writing assistant.
   * Thin wrapper around the existing generateDeficiencyNarrative pattern
   * with additional severity suggestion.
   */
  draftDeficiencyText: officeProcedure
    .input(z.object({
      title: z.string().min(1),
      notes: z.string().optional(),
      systemCategory: z.string().optional(),
      severity: z.string().optional(),
      deviceType: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\nYou are a fire alarm inspection expert. Generate professional deficiency text.` },
          {
            role: "user", content: `Draft a professional deficiency record for the following:

Title: ${input.title}
${input.deviceType ? `Device: ${input.deviceType}` : ""}
${input.location ? `Location: ${input.location}` : ""}
${input.systemCategory ? `System: ${input.systemCategory}` : ""}
${input.severity ? `Reported severity: ${input.severity}` : ""}
${input.notes ? `Notes: ${input.notes}` : ""}

Provide:
1. Professional technical description
2. Customer-friendly explanation
3. Recommended corrective action
4. Severity suggestion (critical/major/minor/observation) with brief rationale

Respond as JSON: {description, customerExplanation, correctiveAction, severitySuggestion, severityRationale}`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "deficiency_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                description: { type: "string" },
                customerExplanation: { type: "string" },
                correctiveAction: { type: "string" },
                severitySuggestion: { type: "string", enum: ["critical", "major", "minor", "observation"] },
                severityRationale: { type: "string" },
              },
              required: ["description", "customerExplanation", "correctiveAction", "severitySuggestion", "severityRationale"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 700,
      });

      const content = extractText(result);
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response empty" });
      return { ...JSON.parse(content), isDraft: true };
    }),

  // ── Report QA AI Review ───────────────────────────────────────────────────

  /**
   * runReportQAReview — LLM-powered structured inspection review.
   * Builds full inspection context, calls AI, stores result in ai_reviews.
   * Never modifies job/report/deficiency records.
   */
  runReportQAReview: officeProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
      reportId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      // 1. Verify job ownership
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      // 2. Build inspection context package — wsi/technician don't depend on site result
      const [site, stats, deficiencies, reports, inspectionResults, wsi, technician] = await Promise.all([
        db.getSiteById(job.siteId),
        db.getInspectionStats(input.jobId),
        db.getDeficienciesByJob(input.jobId),
        db.getReportsByJob(input.jobId),
        db.getInspectionResultsByJob(input.jobId),
        db.getWorkSiteInfoBySiteId(job.siteId),
        job.leadTechnicianId ? db.getUserById(job.leadTechnicianId) : Promise.resolve(undefined),
      ]);

      const customer = site?.customerOrgId
        ? await db.getCustomerOrgById(site.customerOrgId)
        : null;

      const report = input.reportId
        ? reports.find(r => r.id === input.reportId) ?? reports[0]
        : reports[0];

      // Build missing flags
      const missingFlags: string[] = [];
      if (stats.notTested > 0) missingFlags.push(`${stats.notTested} device(s) not tested`);

      const deficiencyDeviceIds = new Set(deficiencies.map(d => d.deviceId).filter(Boolean));
      const failedWithoutDef = inspectionResults.filter(r => r.result === "fail" && !deficiencyDeviceIds.has(r.deviceId));
      if (failedWithoutDef.length > 0) {
        missingFlags.push(`${failedWithoutDef.length} failed device(s) with no deficiency record`);
      }

      const defsWithoutDesc = deficiencies.filter(d => !d.description?.trim());
      const defsWithoutAction = deficiencies.filter(d => !d.correctiveAction?.trim());
      const defsWithoutExplanation = deficiencies.filter(d => !d.customerExplanation?.trim());
      if (defsWithoutDesc.length > 0) missingFlags.push(`${defsWithoutDesc.length} deficienc(ies) missing description`);
      if (defsWithoutAction.length > 0) missingFlags.push(`${defsWithoutAction.length} deficienc(ies) missing corrective action`);
      if (defsWithoutExplanation.length > 0) missingFlags.push(`${defsWithoutExplanation.length} deficienc(ies) missing customer explanation`);
      if (!report) missingFlags.push("No report generated yet");
      if (!technician) missingFlags.push("No technician assigned");

      const openDefs = deficiencies.filter(d => d.status === "open" || d.status === "in_progress");
      const critDefs = openDefs.filter(d => d.severity === "critical");

      // Build context text
      const defLines = deficiencies.map(d =>
        `- [${d.severity?.toUpperCase() ?? "?"}] ${d.systemCategory ?? "General"}: ${d.title}\n` +
        `  Description: ${d.description?.slice(0, 150) || "(missing)"}\n` +
        `  Corrective action: ${d.correctiveAction?.slice(0, 150) || "(missing)"}\n` +
        `  Customer explanation: ${d.customerExplanation?.slice(0, 100) || "(missing)"}\n` +
        `  Status: ${d.status}`
      ).join("\n");

      const contextText = [
        `JOB: ${job.jobNumber} — ${job.title}`,
        `Type: ${job.jobType} | Status: ${job.status} | Priority: ${job.priority ?? "normal"}`,
        `Site: ${site?.name ?? "Unknown"}, ${site?.address ?? ""}, ${site?.city ?? ""}`,
        `Building ID: ${site?.buildingId ?? "none"} | File #: ${site?.fileNumber ?? "none"}`,
        `Customer: ${customer?.name ?? "Unknown"}`,
        `Technician: ${technician?.name ?? "Not assigned"}`,
        `Scheduled: ${job.scheduledDate ? new Date(job.scheduledDate).toDateString() : "not set"}`,
        `Completed: ${job.completedAt ? new Date(job.completedAt).toDateString() : "not completed"}`,
        "",
        `INSPECTION PROGRESS:`,
        `Total devices: ${stats.total}`,
        `Tested: ${stats.total - stats.notTested} (${stats.total > 0 ? Math.round((stats.total - stats.notTested) / stats.total * 100) : 0}%)`,
        `Not tested: ${stats.notTested}`,
        `Pass: ${stats.pass} | Fail: ${stats.fail} | N/A: ${stats.na}`,
        "",
        `DEFICIENCIES (${deficiencies.length} total, ${openDefs.length} open, ${critDefs.length} critical):`,
        deficiencies.length > 0 ? defLines : "(none)",
        "",
        `REPORT: ${report ? `${report.reportNumber ?? "no number"} — status: ${report.status}` : "(not generated)"}`,
        "",
        `MISSING FLAGS:`,
        missingFlags.length > 0 ? missingFlags.map(f => `- ${f}`).join("\n") : "(none identified)",
      ].join("\n");

      // 3. Fetch relevant KB snippets
      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, "report qa inspection review", {
        mode: "report_qa",
        limit: 2,
      });
      const kbBlock = kbSnippets.length > 0
        ? `\nINTERNAL REFERENCE:\n${kbSnippets.map(s => `[${s.title}]: ${s.excerpt}`).join("\n\n")}`
        : "";

      // 4. Call LLM
      const reviewResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are reviewing a fire inspection package for QA. Analyze the data carefully and identify issues that need office attention. Be specific. Do not invent data not present. State clearly when information is missing. Use knowledge base content as internal reference. This is an internal advisory review — not a compliance certificate.`,
          },
          {
            role: "user",
            content: `Review this inspection package for QA:\n\n${contextText}${kbBlock}\n\nReturn a structured JSON review.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "inspection_qa_review",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      severity: { type: "string", enum: ["info", "warning", "blocker"] },
                      category: { type: "string", enum: ["completion", "deficiency", "report", "compliance", "other"] },
                      issue: { type: "string" },
                    },
                    required: ["severity", "category", "issue"],
                    additionalProperties: false,
                  },
                },
                suggestedQaNote: { type: "string" },
                suggestedActions: { type: "array", items: { type: "string" } },
                missingDataWarnings: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "riskLevel", "findings", "suggestedQaNote", "suggestedActions", "missingDataWarnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 1000,
      });

      const raw = extractText(reviewResult);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI review response was empty" });

      let parsed: {
        summary: string;
        riskLevel: "low" | "medium" | "high" | "critical";
        findings: Array<{ severity: string; category: string; issue: string }>;
        suggestedQaNote: string;
        suggestedActions: string[];
        missingDataWarnings: string[];
      };

      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response could not be parsed" });
      }

      // 5. Save to ai_reviews
      const review = await db.createAiReview({
        jobId: input.jobId,
        issues: [],
        modelUsed: "gpt-4o-mini",
        companyId,
        reviewType: "report_qa",
        status: "completed",
        summary: parsed.summary,
        riskLevel: parsed.riskLevel,
        suggestedQaNote: parsed.suggestedQaNote,
        findingsJson: parsed.findings as any,
        suggestedActions: parsed.suggestedActions as any,
        createdById: ctx.user.id,
      } as any);

      // 6. Log activity
      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "ai_review.generated",
        title: `AI QA review generated (risk: ${parsed.riskLevel})`,
        metadata: { reviewId: review.id, riskLevel: parsed.riskLevel, findingCount: parsed.findings.length },
      });

      // 7. Notify office if high/critical risk
      if (parsed.riskLevel === "high" || parsed.riskLevel === "critical") {
        const dedupeKey = `ai-review-${input.jobId}-${parsed.riskLevel}`;
        const alreadyNotified = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!alreadyNotified) {
          await db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "job",
            entityId: input.jobId,
            type: "ai_review_high_risk",
            severity: parsed.riskLevel === "critical" ? "critical" : "warning",
            title: `AI Review: ${parsed.riskLevel === "critical" ? "Critical" : "High"} risk — ${job.jobNumber}`,
            message: parsed.summary.slice(0, 300),
            href: "/admin/report-qa",
            dedupeKey,
          } as any);
        }
      }

      return {
        reviewId: review.id,
        riskLevel: parsed.riskLevel,
        summary: parsed.summary,
        findings: parsed.findings,
        suggestedQaNote: parsed.suggestedQaNote,
        suggestedActions: parsed.suggestedActions,
        missingDataWarnings: parsed.missingDataWarnings,
      };
    }),

  /**
   * getReviewsForEntity — Returns stored AI reviews for a job.
   */
  getReviewsForEntity: officeProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const job = await db.getJobById(input.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
      return db.getAiReviewsByJobScoped(input.jobId, companyId, "report_qa");
    }),

  /**
   * dismissReview — Marks a review as dismissed. Does not change any record.
   */
  dismissReview: officeProcedure
    .input(z.object({ reviewId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const review = await db.getAiReviewById(input.reviewId);
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      if ((review as any).companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      await db.updateAiReview(input.reviewId, { status: "dismissed" } as any);

      void logActivity({
        ctx,
        entityType: "job",
        entityId: review.jobId,
        eventType: "ai_review.dismissed",
        title: "AI QA review dismissed",
        metadata: { reviewId: input.reviewId },
      });

      return { success: true as const };
    }),

  // ── AI Deficiency + Quote Assistant ──────────────────────────────────────────

  /**
   * draftDeficiencyFromNotes — Turns raw technician field notes into professional deficiency text.
   * Accessible to admin, office, and technicians.
   * Never auto-saves. Output is a draft for human review.
   */
  draftDeficiencyFromNotes: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive().optional(),
      deviceId: z.number().int().positive().optional(),
      siteId: z.number().int().positive().optional(),
      systemCategory: z.string().optional(),
      severity: z.string().optional(),
      rawTechnicianNotes: z.string().min(1).max(3000),
      observedIssue: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      const contextLines: string[] = [
        `TECHNICIAN NOTES: ${input.rawTechnicianNotes}`,
      ];
      if (input.observedIssue) contextLines.push(`OBSERVED ISSUE: ${input.observedIssue}`);
      if (input.location) contextLines.push(`LOCATION: ${input.location}`);
      if (input.systemCategory) contextLines.push(`SYSTEM CATEGORY: ${input.systemCategory}`);
      if (input.severity) contextLines.push(`REPORTED SEVERITY: ${input.severity}`);

      const fetches: Promise<void>[] = [];

      if (input.deviceId) {
        fetches.push(
          db.getDeviceById(input.deviceId).then(device => {
            if (!device) return;
            contextLines.push(`DEVICE: ${device.deviceType}${device.location ? ` at ${device.location}` : ""}`);
            if (device.model) contextLines.push(`Model: ${device.model}`);
          })
        );
      }

      if (input.jobId) {
        fetches.push(
          db.getJobById(input.jobId).then(job => {
            if (!job || job.companyId !== companyId) return;
            contextLines.push(`JOB: ${job.jobNumber} (${job.jobType ?? "inspection"})`);
          })
        );
      }

      if (input.siteId) {
        fetches.push(
          db.getSiteById(input.siteId).then(site => {
            if (!site || site.companyId !== companyId) return;
            contextLines.push(`SITE: ${site.name}, ${site.city ?? ""}`);
          })
        );
      }

      await Promise.all(fetches);

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, input.rawTechnicianNotes, {
        mode: "deficiency_help",
        limit: 2,
      });
      const kbBlock = kbSnippets.length > 0
        ? `\nINTERNAL REFERENCE:\n${kbSnippets.map(s => `[${s.title}]: ${s.excerpt}`).join("\n\n")}`
        : "";

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are a fire protection inspection expert. Turn raw technician field notes into professional, clear deficiency text. Be specific and factual. Do not invent device details not in the notes. When information is missing, note it in warnings.`,
          },
          {
            role: "user",
            content: `Convert these field notes into a professional deficiency record:\n\n${contextLines.join("\n")}${kbBlock}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "deficiency_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestedTitle: { type: "string" },
                suggestedSeverity: { type: "string", enum: ["critical", "major", "minor", "observation"] },
                systemCategory: { type: "string", enum: ["FIRE_ALARM", "SMOKE_ALARM", "FIRE_EXTINGUISHER", "EMERGENCY_LIGHTING", "SPRINKLER", "OTHER"] },
                professionalDescription: { type: "string" },
                customerExplanation: { type: "string" },
                correctiveAction: { type: "string" },
                internalNotes: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["suggestedTitle", "suggestedSeverity", "systemCategory", "professionalDescription", "customerExplanation", "correctiveAction", "internalNotes", "confidence", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 700,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "deficiency",
        entityId: input.jobId ?? 0,
        eventType: "ai_assistant.draftDeficiencyFromNotes",
        title: "AI deficiency draft generated from field notes",
        metadata: { jobId: input.jobId, deviceId: input.deviceId, confidence: parsed.confidence },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI draft — review before saving." };
    }),

  /**
   * analyzeDeficiencyPhoto — Vision-based analysis of an inspection photo.
   * Looks at the actual image (not just typed notes) and suggests an observed
   * issue, title, and severity grounded in what's visible. Output is a draft —
   * never auto-saved or applied without technician review.
   */
  analyzeDeficiencyPhoto: technicianProcedure
    .input(z.object({
      photoUrl: z.string().url(),
      deviceType: z.string().optional(),
      location: z.string().optional(),
      systemCategory: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const contextLines: string[] = [];
      if (input.deviceType) contextLines.push(`Device type: ${input.deviceType}`);
      if (input.location) contextLines.push(`Location: ${input.location}`);
      if (input.systemCategory) contextLines.push(`System category: ${input.systemCategory}`);
      const contextBlock = contextLines.length > 0 ? `\n\nKnown context:\n${contextLines.join("\n")}` : "";

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${FIELD_COPILOT_SYSTEM_PROMPT}\n\nYou are looking at a photo taken during a fire protection inspection. Describe only what is visibly present in the image — do not assume details that aren't shown. If the photo doesn't clearly show a deficiency, say so plainly.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Analyze this inspection photo and describe what it shows.${contextBlock}\n\nReturn JSON only.` },
              { type: "image_url", image_url: { url: input.photoUrl, detail: "auto" } },
            ],
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "photo_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                visualFindings: { type: "array", items: { type: "string" }, description: "Specific things visible in the photo (condition, damage, labels, readings, etc.)" },
                suggestedObservedIssue: { type: "string", description: "One or two sentence description of the issue shown, grounded only in what's visible" },
                suggestedTitle: { type: "string" },
                suggestedSeverity: { type: "string", enum: ["critical", "major", "minor", "observation", "unclear"] },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["visualFindings", "suggestedObservedIssue", "suggestedTitle", "suggestedSeverity", "confidence", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 500,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "deficiency",
        entityId: 0,
        eventType: "ai_assistant.analyzeDeficiencyPhoto",
        title: "AI photo analysis generated",
        metadata: { confidence: parsed.confidence },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI photo analysis — verify against what you observed in person before applying." };
    }),

  /**
   * improveDeficiencyText — Rewrites existing deficiency text fields to be more professional.
   * Accessible to admin, office, and technicians.
   */
  improveDeficiencyText: technicianProcedure
    .input(z.object({
      deficiencyId: z.number().int().positive(),
      currentTitle: z.string().min(1),
      currentDescription: z.string().optional(),
      currentObservedIssue: z.string().optional(),
      currentCorrectiveAction: z.string().optional(),
      currentCustomerExplanation: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      const defResult = await db.getDeficiencyById(input.deficiencyId);
      if (!defResult) throw new TRPCError({ code: "NOT_FOUND" });
      const def = (defResult as any).deficiency ?? defResult;
      const job = await db.getJobById(def.jobId);
      if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      const device = def.deviceId ? await db.getDeviceById(def.deviceId) : null;

      const contextLines = [
        `DEFICIENCY: ${input.currentTitle}`,
        `Severity: ${def.severity} | System: ${def.systemCategory ?? "unspecified"}`,
        device ? `Device: ${device.deviceType}${device.location ? ` at ${device.location}` : ""}` : "",
        input.currentObservedIssue ? `Observed issue: ${input.currentObservedIssue}` : "",
        input.currentDescription ? `Current description: ${input.currentDescription}` : "",
        input.currentCorrectiveAction ? `Current corrective action: ${input.currentCorrectiveAction}` : "",
        input.currentCustomerExplanation ? `Current customer explanation: ${input.currentCustomerExplanation}` : "",
      ].filter(Boolean).join("\n");

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are editing fire inspection deficiency text to be more professional, clear, and complete. Preserve all facts. Improve clarity and professional tone. Do not change technical details.`,
          },
          {
            role: "user",
            content: `Improve this deficiency text:\n\n${contextLines}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "deficiency_improve",
            strict: true,
            schema: {
              type: "object",
              properties: {
                improvedTitle: { type: "string" },
                improvedDescription: { type: "string" },
                improvedObservedIssue: { type: "string" },
                improvedCorrectiveAction: { type: "string" },
                improvedCustomerExplanation: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["improvedTitle", "improvedDescription", "improvedObservedIssue", "improvedCorrectiveAction", "improvedCustomerExplanation", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 700,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "deficiency",
        entityId: input.deficiencyId,
        eventType: "ai_assistant.improveDeficiencyText",
        title: "AI deficiency wording improvement generated",
        metadata: { deficiencyId: input.deficiencyId },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI draft — review before saving." };
    }),

  /**
   * suggestRepairScope — Suggests repair scope, recommended work, and parts search terms
   * based on a deficiency record.
   */
  suggestRepairScope: officeProcedure
    .input(z.object({
      deficiencyId: z.number().int().positive(),
      siteId: z.number().int().positive().optional(),
      systemCategory: z.string().optional(),
      severity: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const contextBlock = await buildDeficiencyContext(input.deficiencyId, companyId);
      if (contextBlock.startsWith("(")) throw new TRPCError({ code: "NOT_FOUND", message: contextBlock });

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, contextBlock, {
        mode: "repair_quote",
        limit: 2,
      });
      const kbBlock = kbSnippets.length > 0
        ? `\nINTERNAL REFERENCE:\n${kbSnippets.map(s => `[${s.title}]: ${s.excerpt}`).join("\n\n")}`
        : "";

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are a fire protection repair expert helping office staff scope repair work. Suggest realistic scope, work items, and parts for the described deficiency. Do not guarantee pricing or code compliance. Note any assumptions.`,
          },
          {
            role: "user",
            content: `Suggest repair scope for this deficiency:\n\n${contextBlock}${kbBlock}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "repair_scope",
            strict: true,
            schema: {
              type: "object",
              properties: {
                scopeSummary: { type: "string" },
                recommendedWork: { type: "array", items: { type: "string" } },
                recommendedPartsSearchTerms: { type: "array", items: { type: "string" } },
                estimatedLabourNotes: { type: "string" },
                customerFacingExplanation: { type: "string" },
                internalPricingNotes: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["scopeSummary", "recommendedWork", "recommendedPartsSearchTerms", "estimatedLabourNotes", "customerFacingExplanation", "internalPricingNotes", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 800,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "deficiency",
        entityId: input.deficiencyId,
        eventType: "ai_assistant.suggestRepairScope",
        title: "AI repair scope suggested",
        metadata: { deficiencyId: input.deficiencyId },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI draft — review scope and pricing carefully before quoting." };
    }),

  /**
   * draftRepairQuoteSummary — Drafts executive summary, scope of work, and customer approval note
   * for a repair quote.
   */
  draftRepairQuoteSummary: officeProcedure
    .input(z.object({
      repairQuoteId: z.number().int().positive().optional(),
      deficiencyIds: z.array(z.number().int().positive()).optional(),
      customerOrgId: z.number().int().positive().optional(),
      siteId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      let contextBlock = "";
      if (input.repairQuoteId) {
        contextBlock = await buildRepairQuoteContext(input.repairQuoteId, companyId);
      }

      const defContexts: string[] = [];
      for (const defId of (input.deficiencyIds ?? [])) {
        const c = await buildDeficiencyContext(defId, companyId);
        if (!c.startsWith("(")) defContexts.push(c);
      }
      if (defContexts.length > 0) {
        contextBlock += `\n\nDEFICIENCIES TO QUOTE:\n${defContexts.join("\n---\n")}`;
      }

      if (!contextBlock.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No context available. Provide repairQuoteId or deficiencyIds." });
      }

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are writing customer-facing repair quote documents for a fire protection company. Write clearly and professionally. Do not exaggerate urgency. Label all outputs as drafts. Do not make pricing guarantees.`,
          },
          {
            role: "user",
            content: `Draft a summary for this repair quote:\n\n${contextBlock}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "quote_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                quoteTitle: { type: "string" },
                executiveSummary: { type: "string" },
                scopeOfWork: { type: "string" },
                customerApprovalNote: { type: "string" },
                exclusionsOrAssumptions: { type: "string" },
                recommendedNextStep: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["quoteTitle", "executiveSummary", "scopeOfWork", "customerApprovalNote", "exclusionsOrAssumptions", "recommendedNextStep", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 800,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "repair_quote",
        entityId: input.repairQuoteId ?? 0,
        eventType: "ai_assistant.draftRepairQuoteSummary",
        title: "AI repair quote summary drafted",
        metadata: { repairQuoteId: input.repairQuoteId, deficiencyIds: input.deficiencyIds },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI draft — review before sending to customer." };
    }),

  /**
   * suggestPartsFromDeficiency — Generates parts search terms from a deficiency,
   * then searches the parts catalog for matches.
   * Never auto-adds parts to a quote.
   */
  suggestPartsFromDeficiency: officeProcedure
    .input(z.object({
      deficiencyId: z.number().int().positive(),
      searchText: z.string().optional(),
      systemCategory: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const contextBlock = await buildDeficiencyContext(input.deficiencyId, companyId);
      if (contextBlock.startsWith("(")) throw new TRPCError({ code: "NOT_FOUND", message: contextBlock });

      const searchHint = input.searchText ? `\nAdditional search hint: ${input.searchText}` : "";

      const termResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nYou are helping search a fire protection parts catalog. Generate 3-6 specific part search terms based on the deficiency. Use product-level terms (e.g., "smoke detector", "sprinkler head", "pull station", "control module").`,
          },
          {
            role: "user",
            content: `Generate search terms for parts needed to repair this deficiency:\n\n${contextBlock}${searchHint}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "parts_search",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestedPartsSearchTerms: { type: "array", items: { type: "string" } },
                notes: { type: "string" },
              },
              required: ["suggestedPartsSearchTerms", "notes"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 300,
      });

      const raw = extractText(termResult);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const { suggestedPartsSearchTerms, notes } = JSON.parse(raw);

      const matchingParts = await db.searchPartsCatalogByKeywords(companyId, suggestedPartsSearchTerms, 8);

      void logActivity({
        ctx,
        entityType: "deficiency",
        entityId: input.deficiencyId,
        eventType: "ai_assistant.suggestPartsFromDeficiency",
        title: "AI parts suggestions generated",
        metadata: { deficiencyId: input.deficiencyId, termsGenerated: suggestedPartsSearchTerms.length, partsFound: matchingParts.length },
      });

      return {
        suggestedPartsSearchTerms,
        matchingParts: matchingParts.map(p => ({
          id: p.id,
          productName: p.productName,
          category: p.category,
          description: p.description,
          unitPrice: p.unitPrice,
          defaultLabourHours: p.defaultLabourHours,
          sku: p.sku,
        })),
        notes,
        disclaimer: "AI suggestions — verify against current catalog pricing before adding to quote.",
      };
    }),

  // ── Field Copilot (technician-safe) ────────────────────────────────────────

  /**
   * askFieldCopilot — General-purpose Q&A for technicians in the field.
   * Builds technician-safe job context (no pricing, no invoices).
   * Verifies the calling technician is assigned to the job.
   */
  askFieldCopilot: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
      message: z.string().min(1).max(1000),
      contextType: z.enum(["job", "device", "deficiency", "work_site_info", "inspection_progress"]).optional(),
      contextId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await verifyJobAccessForCopilot(input.jobId, ctx.user.id, ctx.user.role, companyId);

      const jobCtx = await buildTechnicianJobContext(input.jobId, companyId);

      let extraCtx = "";
      if (input.contextType === "deficiency" && input.contextId) {
        extraCtx = "\n\n" + await buildDeficiencyContext(input.contextId, companyId);
      }

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, input.message, { limit: 2, visibilities: ["technician", "ai_only"] } as any);
      const kbBlock = kbSnippets.length > 0
        ? `\n\nKNOWLEDGE BASE:\n${kbSnippets.map(k => `[${k.title}]: ${k.excerpt}`).join("\n\n")}`
        : "";

      const result = await invokeLLM({
        messages: [
          { role: "system", content: FIELD_COPILOT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `JOB CONTEXT:\n${jobCtx}${extraCtx}${kbBlock}\n\nTECHNICIAN QUESTION: ${input.message}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "copilot_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
                suggestedActions: { type: "array", items: { type: "string" } },
                contextUsed: { type: "string" },
              },
              required: ["answer", "warnings", "suggestedActions", "contextUsed"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 500,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "ai_assistant.fieldCopilotAsked",
        title: "Field copilot question asked",
        metadata: { jobId: input.jobId, contextType: input.contextType },
      });

      return parsed as { answer: string; warnings: string[]; suggestedActions: string[]; contextUsed: string };
    }),

  /**
   * summarizeJobForTechnician — Returns a structured job briefing for the technician.
   * Includes access notes, open deficiencies, and inspection progress.
   * Excludes all pricing, invoices, and admin-only data.
   */
  summarizeJobForTechnician: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      await verifyJobAccessForCopilot(input.jobId, ctx.user.id, ctx.user.role, companyId);

      const contextBlock = await buildTechnicianJobContext(input.jobId, companyId);

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, "job summary site access technician preparation", { limit: 2, visibilities: ["technician", "ai_only"] } as any);
      const kbBlock = kbSnippets.length > 0
        ? `\n\nKNOWLEDGE:\n${kbSnippets.map(k => k.excerpt).join("\n---\n")}`
        : "";

      const result = await invokeLLM({
        messages: [
          { role: "system", content: FIELD_COPILOT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Summarize this job for the technician arriving on site:\n\n${contextBlock}${kbBlock}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "job_summary",
            strict: true,
            schema: {
              type: "object",
              properties: {
                jobSummary: { type: "string" },
                accessNotes: { type: "string" },
                importantSiteInfo: { type: "string" },
                openDeficiencies: { type: "array", items: { type: "string" } },
                inspectionProgress: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["jobSummary", "accessNotes", "importantSiteInfo", "openDeficiencies", "inspectionProgress", "warnings"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 600,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "ai_assistant.jobSummarized",
        title: "Job summarized for technician",
        metadata: { jobId: input.jobId },
      });

      return { ...parsed, isDraft: true as const, disclaimer: "AI summary — verify all access details before entering the site." };
    }),

  /**
   * checkBeforeSubmitForQA — Pre-flight check before submitting a job for QA.
   * Computes readiness from real data (no LLM). Fast and reliable.
   * Does NOT submit for QA — that requires explicit technician action.
   */
  checkBeforeSubmitForQA: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const job = await verifyJobAccessForCopilot(input.jobId, ctx.user.id, ctx.user.role, companyId);

      const [devices, stats, deficiencies] = await Promise.all([
        db.getDevicesBySite(job.siteId),
        db.getInspectionStats(input.jobId),
        db.getDeficienciesByJob(input.jobId),
      ]);

      const testedCount = stats.pass + stats.fail + stats.na;
      const untestedDevicesCount = devices.length - testedCount;
      const openDefs = deficiencies.filter(d => d.status !== "resolved" && d.status !== "closed");
      const deficiencyCount = openDefs.length;
      const criticalDefs = openDefs.filter(d => d.severity === "critical");

      const missingItems: string[] = [];
      if (job.status !== "in_progress") {
        missingItems.push(`Job must be in_progress to submit (current status: ${job.status})`);
      }
      if (untestedDevicesCount > 0) {
        missingItems.push(`${untestedDevicesCount} device${untestedDevicesCount !== 1 ? "s" : ""} not yet tested`);
      }

      const criticalWarnings: string[] = [];
      if (criticalDefs.length > 0) {
        criticalWarnings.push(`${criticalDefs.length} critical deficiency${criticalDefs.length !== 1 ? "ies" : "y"} open — ensure each is fully documented`);
      }
      if ((job as any).finalizedAt) {
        criticalWarnings.push("Job is already finalized — no further changes allowed");
      }

      const suggestedNextSteps: string[] = [];
      if (untestedDevicesCount > 0) suggestedNextSteps.push(`Test the remaining ${untestedDevicesCount} device${untestedDevicesCount !== 1 ? "s" : ""}`);
      if (criticalDefs.length > 0) suggestedNextSteps.push("Review and fully document all critical deficiencies");
      if (openDefs.some(d => !d.description || !d.correctiveAction)) {
        suggestedNextSteps.push("Complete description and corrective action for all open deficiencies");
      }
      if (missingItems.length === 0 && criticalWarnings.length === 0) {
        suggestedNextSteps.push("All checks passed — tap 'Submit for QA' when ready");
      }

      const readyForQA = missingItems.length === 0;

      void logActivity({
        ctx,
        entityType: "job",
        entityId: input.jobId,
        eventType: "ai_assistant.preQAChecked",
        title: "Pre-QA check run",
        metadata: { jobId: input.jobId, readyForQA, untestedDevicesCount, deficiencyCount },
      });

      return { readyForQA, missingItems, untestedDevicesCount, deficiencyCount, criticalWarnings, suggestedNextSteps };
    }),

  // ── Admin Copilot (office/admin only) ──────────────────────────────────────

  /**
   * getAdminBriefing — Generates a structured daily operations briefing.
   * Uses getOperationsSummary as context. Never modifies records.
   */
  getAdminBriefing: officeProcedure
    .input(z.object({
      timeframe: z.enum(["today", "week", "overdue", "all"]).default("today"),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const contextBlock = await buildAdminBriefingContext(companyId);

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, "operations priorities follow up scheduling", { limit: 2 });
      const kbBlock = kbSnippets.length > 0
        ? `\n\nKNOWLEDGE BASE:\n${kbSnippets.map(k => `[${k.title}]: ${k.excerpt}`).join("\n\n")}`
        : "";

      const timeframeGuide: Record<string, string> = {
        today: "Focus on what needs attention TODAY — overdue items, today's jobs, critical deficiencies, pending reports.",
        week: "Summarize this week's priorities — upcoming jobs, pending reviews, approvals needed, invoices.",
        overdue: "Focus specifically on OVERDUE items — jobs past schedule, outstanding invoices, unreviewed reports.",
        all: "Give a comprehensive operations overview — all open items, risks, and recommended priorities.",
      };

      const VALID_HREFS = ["/admin/jobs", "/admin/report-qa", "/admin/approved-work", "/admin/invoices", "/admin/compliance", "/admin/data-quality", "/admin/repair-quotes", "/admin/sites", "/admin/schedule"];

      const result = await invokeLLM({
        messages: [
          { role: "system", content: ADMIN_COPILOT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Generate an admin briefing. Timeframe focus: ${input.timeframe}. ${timeframeGuide[input.timeframe]}\n\n${contextBlock}${kbBlock}\n\nFor relatedLinks.href only use: ${VALID_HREFS.join(", ")}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "admin_briefing",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                topPriorities: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                suggestedActions: { type: "array", items: { type: "string" } },
                relatedLinks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      href: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["label", "href", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "topPriorities", "risks", "suggestedActions", "relatedLinks"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 800,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "company",
        entityId: companyId,
        eventType: "ai_assistant.adminBriefingGenerated",
        title: "Admin briefing generated",
        metadata: { timeframe: input.timeframe },
      });

      return parsed as {
        summary: string;
        topPriorities: string[];
        risks: string[];
        suggestedActions: string[];
        relatedLinks: { label: string; href: string; reason: string }[];
      };
    }),

  /**
   * askAdminCopilot — Admin Q&A with full operations context built in.
   * Always grounded in the live getOperationsSummary snapshot.
   */
  askAdminCopilot: officeProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      mode: z.enum(["daily_briefing", "follow_up", "compliance", "reports", "invoices", "approved_work", "scheduling", "data_quality", "customer_message", "workflow_help"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const contextBlock = await buildAdminBriefingContext(companyId);

      const kbSnippets = await db.getRelevantKnowledgeContext(companyId, input.message, { limit: 3 });
      const kbBlock = kbSnippets.length > 0
        ? `\n\nKNOWLEDGE BASE:\n${kbSnippets.map(k => `[${k.title}]: ${k.excerpt}`).join("\n\n")}`
        : "";

      const VALID_HREFS = ["/admin/jobs", "/admin/report-qa", "/admin/approved-work", "/admin/invoices", "/admin/compliance", "/admin/data-quality", "/admin/repair-quotes", "/admin/sites", "/admin/schedule", "/admin/ai-assistant"];

      const result = await invokeLLM({
        messages: [
          { role: "system", content: ADMIN_COPILOT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `OPERATIONS CONTEXT:\n${contextBlock}${kbBlock}\n\nQUESTION: ${input.message}${input.mode ? `\n(Context mode: ${input.mode})` : ""}\n\nFor relatedRecords.href only use: ${VALID_HREFS.join(", ")}\n\nReturn JSON only.`,
          },
        ],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "admin_copilot_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                suggestedActions: { type: "array", items: { type: "string" } },
                relatedRecords: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      label: { type: "string" },
                      href: { type: "string" },
                    },
                    required: ["type", "label", "href"],
                    additionalProperties: false,
                  },
                },
                warnings: { type: "array", items: { type: "string" } },
                contextUsed: { type: "string" },
              },
              required: ["answer", "suggestedActions", "relatedRecords", "warnings", "contextUsed"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 600,
      });

      const raw = extractText(result);
      if (!raw) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI response was empty" });
      const parsed = JSON.parse(raw);

      void logActivity({
        ctx,
        entityType: "company",
        entityId: companyId,
        eventType: "ai_assistant.adminCopilotAsked",
        title: "Admin copilot asked",
        metadata: { mode: input.mode },
      });

      return parsed as {
        answer: string;
        suggestedActions: string[];
        relatedRecords: { type: string; label: string; href: string }[];
        warnings: string[];
        contextUsed: string;
      };
    }),

  /**
   * draftCustomerFollowUp — Drafts a customer-facing follow-up email by purpose.
   * Never sends. Uses existing record context builders.
   */
  draftCustomerFollowUp: officeProcedure
    .input(z.object({
      entityType: z.enum(["job", "site", "deficiency", "repair_quote", "invoice", "approved_work"]),
      entityId: z.number().int().positive(),
      purpose: z.enum(["report_ready", "quote_followup", "invoice_reminder", "deficiency_followup", "approved_work_scheduling", "compliance_notice"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      const ctxTypeMap: Record<string, ContextType> = {
        job: "job", site: "site", deficiency: "deficiency",
        repair_quote: "repair_quote", invoice: "invoice", approved_work: "approved_work",
      };
      const contextBlock = await fetchContext(ctxTypeMap[input.entityType] as ContextType, input.entityId, companyId);
      if (contextBlock.startsWith("(")) throw new TRPCError({ code: "NOT_FOUND", message: contextBlock });

      const purposeInstructions: Record<string, string> = {
        report_ready: "Write a professional email notifying the customer their inspection report is ready for review. Summarize key findings if data is available.",
        quote_followup: "Write a professional follow-up email about an outstanding repair quote awaiting customer approval. Summarize scope and total if available.",
        invoice_reminder: "Write a professional invoice reminder email. Mention the amount and due date if available. Be courteous.",
        deficiency_followup: "Write a professional follow-up about an outstanding fire safety deficiency requiring attention. Be factual about severity and corrective action.",
        approved_work_scheduling: "Write a professional email to coordinate scheduling of approved repair or inspection work.",
        compliance_notice: "Write a professional compliance notice about outstanding fire protection requirements at the site. Be factual, not alarmist.",
      };

      const result = await invokeLLM({
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\nDraft a customer-facing email. Be professional. Always label as a draft requiring review before sending.` },
          {
            role: "user",
            content: `${purposeInstructions[input.purpose]}\n\nCONTEXT:\n${contextBlock}\n\nFormat your response as:\nSubject: <subject line>\n---\n<email body>`,
          },
        ],
        maxTokens: 700,
      });

      const raw = extractText(result);
      const subjectMatch = raw.match(/Subject:\s*(.+)/);
      const bodyPart = raw.split("---").slice(1).join("---").trim() || raw;

      void logActivity({
        ctx,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: "ai_assistant.customerFollowUpDrafted",
        title: `AI customer follow-up drafted (${input.purpose})`,
        metadata: { entityType: input.entityType, purpose: input.purpose },
      });

      return {
        subject: subjectMatch ? subjectMatch[1].trim() : "Follow-up from Your Fire Protection Company",
        body: bodyPart,
        warnings: ["AI-generated draft. Review carefully before sending."],
        isDraft: true as const,
      };
    }),
});
