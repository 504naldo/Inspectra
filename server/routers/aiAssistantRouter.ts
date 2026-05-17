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
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { logActivity } from "../activityLogger";

// ── System prompt ─────────────────────────────────────────────────────────────

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
});
