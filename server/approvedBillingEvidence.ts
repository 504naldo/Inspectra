import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { ApprovedWork, Quote, RepairQuoteItem } from "../drizzle/schema";

export const BILLING_APPROVAL_EVENT = "billing.approvalEvidence.v1";
const MAX_CENTS = BigInt(9_999_999_999); // DECIMAL(10,2)
export function approvalMoneyCents(raw: unknown): bigint | null {
  if (typeof raw !== "string") return null;
  const parts = /^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(raw);
  if (!parts) return null;
  const cents = BigInt(parts[1]) * BigInt(100) + BigInt((parts[2] ?? "").padEnd(2, "0") || "0");
  return cents <= MAX_CENTS ? cents : null;
}
function money(cents: bigint): string {
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
export function billingRejected(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function canonMoney(raw: unknown): string {
  const cents = approvalMoneyCents(raw);
  if (cents == null)
    billingRejected("Approval pricing is incomplete or does not use exact cents. Review the source before invoicing.");
  return money(cents);
}
function normDate(date: unknown): number | null {
  return date instanceof Date && Number.isFinite(date.getTime()) ? Math.floor(date.getTime() / 1000) : null;
}

type WorkInput = Pick<ApprovedWork,
  "companyId" | "customerOrgId" | "siteId" | "jobId" | "deficiencyId" |
  "quoteId" | "quoteItemId" | "workOrderId" | "approvedAmount" |
  "approvedScope" | "createdById" | "type" | "approvalSource"
>;
type BillingPlan = {
  kind: "manual" | "quote_item";
  gross: string;
  split?: { subtotal: string; gst: string; pst: string };
  description: string;
  quoteId: number | null;
  quoteItemId: number | null;
  evidence: { version: 1; fingerprint: string; basis: "CAD_GROSS"; quoteId: number | null; quoteItemId: number | null };
};
function base(work: WorkInput) {
  const cents = approvalMoneyCents(work.approvedAmount);
  if (cents == null || cents === BigInt(0))
    billingRejected("A positive approved total in exact cents is required. No invoice was created.");
  if (typeof work.approvedScope !== "string" || work.approvedScope.trim().length === 0)
    billingRejected("A recorded approved scope is required before invoicing.");
  if (!Number.isSafeInteger(work.createdById) || !(Number(work.createdById) > 0))
    billingRejected("This approval has no recorded staff author. Confirm a new billing approval before invoicing.");
  return {
    gross: money(cents),
    description: work.approvedScope,
    identity: [
      work.companyId, work.customerOrgId ?? null, work.siteId ?? null, work.jobId ?? null,
      work.deficiencyId ?? null, work.quoteId ?? null, work.quoteItemId ?? null, work.workOrderId ?? null,
      work.createdById, work.type, work.approvalSource ?? null,
    ],
  };
}
function plan(kind: BillingPlan["kind"], work: WorkInput, stableSource: unknown): BillingPlan {
  const b = base(work);
  const quoteId = work.quoteId ?? null;
  const quoteItemId = work.quoteItemId ?? null;
  return {
    kind, gross: b.gross, description: b.description, quoteId, quoteItemId,
    evidence: {
      version: 1, basis: "CAD_GROSS", quoteId, quoteItemId,
      fingerprint: createHash("sha256").update(
        JSON.stringify([1, "CAD_GROSS", kind, b.identity, b.gross, b.description, stableSource])
      ).digest("hex"),
    },
  };
}

export function manualBillingPlan(work: WorkInput): BillingPlan {
  if (work.quoteId != null || work.quoteItemId != null || work.workOrderId != null || work.deficiencyId != null)
    billingRejected("This approval has a linked or ambiguous billing source. Confirm the source before invoicing.");
  return plan("manual", work, null);
}

export function quoteItemBillingPlan(work: WorkInput, quote: Quote, item: RepairQuoteItem): BillingPlan {
  if (work.workOrderId != null)
    billingRejected("A combined quote and work-order approval needs a reviewed billing source before invoicing.");
  const finalized = normDate(quote.finalizedAt);
  if (quote.quoteType !== "repair" || finalized == null ||
      !["approved", "accepted", "partially_approved", "converted_to_approved_work"].includes(quote.status))
    billingRejected("The repair quote must be finalized with an approved item before billing.");
  if (quote.id !== work.quoteId || quote.companyId !== work.companyId ||
      item.id !== work.quoteItemId || item.quoteId !== quote.id ||
      quote.customerOrgId !== work.customerOrgId || quote.siteId !== work.siteId || quote.jobId !== work.jobId ||
      (item.deficiencyId ?? null) !== (work.deficiencyId ?? null))
    billingRejected("The quoted item or approval links no longer agree. Review the approved source before invoicing.");
  if (!["approved", "converted_to_approved_work"].includes(item.approvalStatus))
    billingRejected("The selected quote item is not approved for billing.");
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
    billingRejected("The approved quote item has no reliable quantity. Review the source before invoicing.");
  if (approvalMoneyCents(quote.discount) !== BigInt(0))
    billingRejected("The quote discount cannot be allocated safely to this item. Review the approved total before invoicing.");

  // Persisted price components, never live catalog prices or binary floats.
  const components = [
    item.partTotal, item.labourTotal, item.fuelCharge, item.backflowReportFee, item.gst, item.pst,
  ].map(canonMoney);
  const gross = canonMoney(item.total);
  const expected = components.reduce((sum, component) => sum + approvalMoneyCents(component)!, BigInt(0));
  if (expected !== approvalMoneyCents(gross) || gross !== canonMoney(work.approvedAmount) ||
      item.description !== work.approvedScope)
    billingRejected("The selected line does not reconcile exactly to the approved scope and gross amount. No invoice was created.");
  // Fingerprint source operands as well as the reconciled gross; same-priced
  // edits to scope, quantity, terms, or taxes must not silently pass.
  const source = [
    quote.id, finalized, item.id, item.description, item.quantity,
    item.deficiencyId, item.repairNotes, item.systemType, item.location,
    item.partId, item.partDescription, canonMoney(item.partUnitPrice),
    canonMoney(item.techHours), canonMoney(item.fitterHours),
    canonMoney(item.techLabourRate), canonMoney(item.fitterLabourRate),
    components, gross,
  ];
  const subtotal = components.slice(0, 4).reduce((sum, value) => sum + approvalMoneyCents(value)!, BigInt(0));
  return { ...plan("quote_item", work, source), split: { subtotal: money(subtotal), gst: components[4], pst: components[5] } };
}

export function requireApprovalEvidence(value: unknown, prepared: BillingPlan): void {
  if (!value || typeof value !== "object")
    billingRejected("The billing approval evidence is missing. Confirm a new billing approval before invoicing.");
  const v = value as Partial<BillingPlan["evidence"]>;
  if (v.version !== 1 || v.basis !== "CAD_GROSS" || v.fingerprint !== prepared.evidence.fingerprint ||
      v.quoteId !== prepared.quoteId || v.quoteItemId !== prepared.quoteItemId)
    billingRejected("Approval terms changed or could not be verified. Confirm a new billing approval before invoicing.");
}
