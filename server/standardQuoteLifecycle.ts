import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  approvedWork,
  jobs,
  quotes,
  workOrders,
  type ApprovedWork,
  type Job,
  type Quote,
  type QuoteLineItem,
  type WorkOrder,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";
import { runWithDb } from "./db/client";
import * as db from "./db";
import { assertQuoteAvailableForDecision } from "./standardQuoteIntegrity";

type Authorization =
  | { token: string }
  | { customerOrgId: number; name: string; email: string }
  | { companyId: number; name: string; email: string };
function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function scopeTitle(quote: Quote) {
  return quote.quoteNumber
    ? `Quote ${quote.quoteNumber}`
    : `Quote #${quote.id}`;
}
function compatible(
  record: {
    companyId: number;
    siteId: number | null;
    customerOrgId: number | null;
  },
  quote: Quote
) {
  return (
    record.companyId === quote.companyId &&
    record.siteId === quote.siteId &&
    record.customerOrgId === quote.customerOrgId
  );
}

/** Acceptance and its execution/approval snapshots commit as one operation.
 * Original inspection jobs, work orders and deficiencies remain provenance. */
const EXECUTION_LINKS_CHANGED =
  "The execution links changed. Reload and retry the same decision.";
export async function approveStandardQuoteFromCustomer(
  candidate: Quote,
  authorization: Authorization,
  ctx?: TrpcContext
): Promise<{ success: true; alreadyAccepted: boolean }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await approveStandardQuoteOnce(candidate, authorization, ctx);
    } catch (error) {
      // Another acceptance may have created a new execution while this request
      // waited for its source locks. Roll back, rediscover, and reuse that scope.
      if (
        attempt >= 2 ||
        !(error instanceof TRPCError) ||
        error.message !== EXECUTION_LINKS_CHANGED
      )
        throw error;
    }
  }
}
async function approveStandardQuoteOnce(
  candidate: Quote,
  authorization: Authorization,
  ctx?: TrpcContext
): Promise<{ success: true; alreadyAccepted: boolean }> {
  if (candidate.quoteType === "repair")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use the repair quote approval workflow",
    });
  const buildingOrigin =
    candidate.quoteType === "building" && candidate.jobId === 0;
  if (candidate.quoteType === "building" && !buildingOrigin)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This building quote has an inconsistent source job. Office staff must reconcile it before acceptance.",
    });
  if (
    !Number.isSafeInteger(candidate.siteId) ||
    candidate.siteId <= 0 ||
    !Number.isSafeInteger(candidate.customerOrgId) ||
    candidate.customerOrgId <= 0 ||
    (!buildingOrigin &&
      (!Number.isSafeInteger(candidate.jobId) || candidate.jobId <= 0))
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Link this quote to a real company, site and customer before accepting it. Office staff must reconcile its source links.",
    });
  }
  const database = await db.getDb();
  if (!database)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const candidateOrders = await database
    .select()
    .from(workOrders)
    .where(eq(workOrders.quoteId, candidate.id));
  const candidateApprovals = await database
    .select()
    .from(approvedWork)
    .where(eq(approvedWork.quoteId, candidate.id));
  const jobIds = Array.from(
    new Set([
      ...(candidate.jobId > 0 ? [candidate.jobId] : []),
      ...candidateOrders.map(order => order.jobId),
      ...candidateApprovals.flatMap(record =>
        record.jobId && record.jobId > 0 ? [record.jobId] : []
      ),
    ])
  ).sort((a, b) => a - b);
  const mutate = async (tx: Db) => {
    const lockedJobs = new Map<number, Job>();
    for (const id of jobIds) {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, id))
        .for("update");
      if (!job || !compatible(job, candidate))
        conflict(
          "The quote execution links are inconsistent. Office staff must reconcile them before accepting."
        );
      lockedJobs.set(id, job);
    }
    const [quote] = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.id, candidate.id))
      .for("update");
    if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
    if (
      quote.quoteType !== candidate.quoteType ||
      quote.jobId !== candidate.jobId ||
      !compatible(quote, candidate)
    )
      conflict("The quote links changed. Reload and retry the same decision.");
    const alreadyAccepted = quote.status === "accepted";
    if ("token" in authorization) {
      if (quote.acceptToken !== authorization.token)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quote not found or link has expired.",
        });
      if (
        !alreadyAccepted &&
        quote.acceptTokenExpiresAt &&
        new Date(quote.acceptTokenExpiresAt) < new Date()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This quote link has expired. Please contact us for a new quote.",
        });
    } else if (
      "customerOrgId" in authorization
        ? authorization.customerOrgId !== quote.customerOrgId
        : authorization.companyId !== quote.companyId
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    if (!alreadyAccepted) await assertQuoteAvailableForDecision(quote, tx);
    const orders = await tx
      .select()
      .from(workOrders)
      .where(eq(workOrders.quoteId, quote.id))
      .for("update");
    const approvals = await tx
      .select()
      .from(approvedWork)
      .where(eq(approvedWork.quoteId, quote.id))
      .for("update");
    if (
      orders.some(order => !lockedJobs.has(order.jobId)) ||
      approvals.some(
        record =>
          record.jobId && record.jobId > 0 && !lockedJobs.has(record.jobId)
      )
    )
      conflict(EXECUTION_LINKS_CHANGED);
    if (
      approvals.length > 1 ||
      approvals.some(record => record.quoteItemId != null)
    )
      conflict(
        "Approved work already overlaps this quote scope. Office staff must reconcile it."
      );
    const [site, customer] = await Promise.all([
      db.getSiteById(quote.siteId),
      db.getCustomerOrgById(quote.customerOrgId),
    ]);
    if (
      !site ||
      !customer ||
      site.companyId !== quote.companyId ||
      customer.companyId !== quote.companyId ||
      site.customerOrgId !== quote.customerOrgId
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "The quote site/customer links need reconciliation before acceptance.",
      });
    }
    const source = quote.jobId > 0 ? lockedJobs.get(quote.jobId) : undefined;
    if (!buildingOrigin && !source)
      conflict(
        "The original quote job is missing. Office staff must reconcile this quote."
      );
    const executionOrders = orders.filter(
      order => buildingOrigin || order.jobId !== quote.jobId
    );
    if (executionOrders.length > 1)
      conflict(
        "Multiple execution work orders represent this quote. Office staff must reconcile them."
      );
    const originalLines = quote.lineItems;
    if (
      !Array.isArray(originalLines) ||
      !originalLines.length ||
      originalLines.some(
        item =>
          !item ||
          typeof item.description !== "string" ||
          !Number.isFinite(item.qty) ||
          item.qty <= 0 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice < 0
      ) ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(quote.total))
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "The quote has missing or inconsistent approved scope/amount. Office staff must reconcile it.",
      });
    }
    const subtotal = originalLines.reduce(
      (sum, item) =>
        sum +
        (quote.quoteType === "building" && item.type === "labour"
          ? Number(item.hours) * Number(item.rate)
          : item.qty * item.unitPrice),
      0
    );
    const discount =
      quote.quoteType === "building" ? Number(quote.discount ?? 0) : 0;
    const expectedTotal = subtotal * (1 - discount / 100);
    if (
      !Number.isFinite(expectedTotal) ||
      discount < 0 ||
      discount > 100 ||
      Number(expectedTotal.toFixed(2)) !== Number(quote.total)
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "The quote line items do not match its approved amount. Office staff must reconcile it before acceptance.",
      });
    for (const item of originalLines) {
      if (item.deficiencyId == null) continue;
      if (
        buildingOrigin ||
        !Number.isSafeInteger(item.deficiencyId) ||
        item.deficiencyId <= 0
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The quote has invalid source deficiency links. Office staff must reconcile them.",
        });
      const deficiency = await db.getDeficiencyById(item.deficiencyId);
      if (!deficiency || deficiency.jobId !== quote.jobId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The quote deficiency does not belong to its source job. Office staff must reconcile it.",
        });
    }
    // A new execution scope does not reuse mutable inspection deficiency IDs.
    const lineItems: QuoteLineItem[] = originalLines.map(item => ({
      ...item,
      deficiencyId: null,
    }));
    let order: WorkOrder | undefined = executionOrders[0];
    let executionJob: Job | undefined = order
      ? lockedJobs.get(order.jobId)
      : undefined;
    const decisionAt =
      quote.approvedAt ??
      quote.acceptedAt ??
      (alreadyAccepted ? null : new Date());
    const recordedApprovalSource =
      quote.approvalSource === "portal_later"
        ? "portal"
        : quote.approvalSource === "internal_entry"
          ? "internal"
          : quote.approvalSource;
    const existing = approvals[0];
    if (existing?.deficiencyId != null)
      conflict(
        "This aggregate approval has a direct deficiency link that is inconsistent with separate execution. Office staff must reconcile it."
      );
    if (
      existing &&
      (!compatible(existing, quote) ||
        Number(existing.approvedAmount) !== Number(quote.total) ||
        existing.approvedScope !== scopeTitle(quote))
    )
      conflict(
        "The recorded approval snapshot differs from this quote. Office staff must reconcile it."
      );
    if (order) {
      if (
        !executionJob ||
        !compatible(order, quote) ||
        executionJob.jobType !==
          (quote.quoteType === "building" ? "annual" : "repair") ||
        order.workType !==
          (quote.quoteType === "building" ? "inspection" : "repair") ||
        Number(order.total) !== Number(quote.total) ||
        !isDeepStrictEqual(order.lineItems, lineItems)
      )
        conflict(
          "The existing execution scope differs from this quote. Office staff must reconcile it."
        );
    } else {
      if (
        existing &&
        (existing.workOrderId != null ||
          (existing.jobId != null &&
            existing.jobId !== quote.jobId &&
            existing.jobId !== 0))
      )
        conflict(
          "The approved work execution links are inconsistent. Office staff must reconcile them."
        );
      executionJob = (await db.createJob({
        companyId: quote.companyId,
        siteId: quote.siteId,
        customerOrgId: quote.customerOrgId,
        jobNumber: `JOB-${randomUUID().slice(0, 12).toUpperCase()}`,
        title: `${quote.quoteType === "building" ? "Inspection" : "Repair"} — ${scopeTitle(quote)}`,
        description: originalLines.map(item => item.description).join("\n"),
        scopeOfWork: originalLines.map(item => item.description).join("\n"),
        jobType: quote.quoteType === "building" ? "annual" : "repair",
        status: "pending",
        priority: "medium",
      })) as Job;
      order = await db.createWorkOrder({
        companyId: quote.companyId,
        siteId: quote.siteId,
        customerOrgId: quote.customerOrgId,
        jobId: executionJob.id,
        quoteId: quote.id,
        workOrderNumber: `WO-${randomUUID().slice(0, 12).toUpperCase()}`,
        title: executionJob.title,
        workType: quote.quoteType === "building" ? "inspection" : "repair",
        status: "pending",
        priority: "medium",
        assignedTechnicianIds: [],
        total: quote.total,
        lineItems,
      });
    }
    if (
      (executionJob!.finalizedAt || order.finalizedAt) &&
      (!existing ||
        existing.jobId !== executionJob!.id ||
        existing.workOrderId !== order.id)
    )
      conflict(
        "Finalized execution work is missing its original approval links. Office staff must reconcile them."
      );
    if (existing) {
      if (
        existing.workOrderId !== order.id ||
        existing.jobId !== executionJob!.id
      ) {
        // A legacy aggregate may be missing its execution links, but invoiced or
        // already-started work cannot be silently rewritten during retry recovery.
        if (
          existing.status !== "approved" ||
          existing.invoiceNumber ||
          existing.startedAt ||
          existing.completedAt ||
          (await db.getInvoiceByApprovedWork(existing.id))
        )
          conflict(
            "Existing approved work has progressed. Office staff must reconcile its execution links."
          );
        await tx
          .update(approvedWork)
          .set({ jobId: executionJob!.id, workOrderId: order.id })
          .where(eq(approvedWork.id, existing.id));
      }
    } else {
      await db.createApprovedWork({
        companyId: quote.companyId,
        siteId: quote.siteId,
        customerOrgId: quote.customerOrgId,
        jobId: executionJob!.id,
        workOrderId: order.id,
        quoteId: quote.id,
        type: quote.quoteType === "building" ? "job_order" : "repair_order",
        status: "approved",
        approvedScope: scopeTitle(quote),
        approvedAmount: quote.total,
        approvedAt: decisionAt,
        approvalSource: alreadyAccepted
          ? recordedApprovalSource
          : "token" in authorization
            ? "email"
            : "companyId" in authorization
              ? "internal"
              : "portal",
        approvedByName:
          alreadyAccepted || "token" in authorization
            ? quote.approvedByName
            : authorization.name,
        approvedByEmail:
          alreadyAccepted || "token" in authorization
            ? quote.approvedByEmail
            : authorization.email,
        createdById: ctx?.user?.id ?? quote.createdById ?? undefined,
      });
    }
    if (!alreadyAccepted)
      await tx
        .update(quotes)
        .set({
          status: "accepted",
          acceptedAt: quote.acceptedAt ?? decisionAt ?? new Date(),
          approvedAt: quote.approvedAt ?? decisionAt ?? new Date(),
          finalizedAt: quote.finalizedAt ?? new Date(),
          approvalSource:
            "token" in authorization
              ? "email"
              : "companyId" in authorization
                ? "internal_entry"
                : "portal_later",
          ...(!("token" in authorization) && {
            approvedByName: authorization.name,
            approvedByEmail: authorization.email,
          }),
        })
        .where(eq(quotes.id, quote.id));
    return { success: true as const, alreadyAccepted };
  };
  if (ctx?.user)
    return db.withAudit(ctx, "quote.customerStandardApproval", mutate);
  return database.transaction(async tx =>
    runWithDb(tx as unknown as Db, () => mutate(tx as unknown as Db))
  );
}
