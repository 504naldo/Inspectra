import { TRPCError } from "@trpc/server";
import type { ConfirmedInvoiceTax, Invoice } from "../drizzle/schema";

export const QUOTE_ITEM_INVOICE_EVENT = "billing.quoteItemInvoice.v1";

export function exactInvoiceCents(raw: unknown): bigint | null {
  if (typeof raw !== "string" || !/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(raw)) return null;
  return BigInt(raw.replace(".", ""));
}
export function exactInvoiceMoney(cents: bigint): string {
  if (cents < BigInt(0) || cents > BigInt(9_999_999_999))
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment exceeds invoice amount precision." });
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}

type TaxInvoice = Pick<Invoice, "confirmedTax" | "quoteId" | "approvedWorkId" | "subtotal" | "taxAmount" | "total" | "taxRate">;
export type TaxLine = { quantity: unknown; unitPrice: unknown; total: unknown; taxable: unknown; description: unknown };
export function verifiedInvoiceTax(invoice: TaxInvoice, lines?: TaxLine[]): ConfirmedInvoiceTax | null {
  const tax = invoice.confirmedTax;
  if (tax === null) return null; // legacy/ordinary invoices retain existing treatment
  const fail = (): never => {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirmed invoice tax does not match its saved approval. Review it before proceeding." });
  };
  if (!tax || tax.version !== 1 || tax.currency !== "CAD" || tax.kind !== "repair_quote_item" ||
      tax.quoteId !== invoice.quoteId || tax.approvedWorkId !== invoice.approvedWorkId ||
      ![tax.quoteId, tax.quoteItemId, tax.approvedWorkId].every(id => Number.isSafeInteger(id) && id > 0) ||
      !/^[a-f0-9]{64}$/.test(tax.approvalFingerprint) || !tax.description)
    return fail();
  const net = exactInvoiceCents(tax.subtotal);
  const gst = exactInvoiceCents(tax.gst);
  const pst = exactInvoiceCents(tax.pst);
  const gross = exactInvoiceCents(tax.gross);
  if (net == null || gst == null || pst == null || gross == null || gross <= BigInt(0) || net + gst + pst !== gross ||
      exactInvoiceCents(invoice.subtotal) !== net || exactInvoiceCents(invoice.taxAmount) !== gst + pst ||
      exactInvoiceCents(invoice.total) !== gross || invoice.taxRate !== "0.0000")
    return fail();
  if (lines && (lines.length !== 1 || exactInvoiceCents(lines[0].quantity) !== BigInt(100) ||
      exactInvoiceCents(lines[0].unitPrice) !== net || exactInvoiceCents(lines[0].total) !== net ||
      lines[0].taxable !== false || lines[0].description !== tax.description))
    return fail();
  return tax;
}

export function requireConfirmedTaxReceipt(
  invoice: Pick<Invoice, "confirmedTax" | "approvedWorkId">,
  receipts: Array<{ metadata: unknown; relatedEntityId: number | null }>,
): void {
  const tax = invoice.confirmedTax;
  const matched = receipts.map(r => ({
    approvedWorkId: r.relatedEntityId,
    value: (r.metadata as { confirmedTaxV1?: unknown } | null)?.confirmedTaxV1,
  }));
  const confirmed = matched.filter(r => r.value !== undefined);
  if (tax === null && confirmed.length === 0 && receipts.length <= 1) return; // actual historic NULL
  const fields: Array<keyof ConfirmedInvoiceTax> = [
    "version", "currency", "kind", "quoteId", "quoteItemId", "approvedWorkId",
    "approvalFingerprint", "description", "subtotal", "gst", "pst", "gross",
  ];
  const rm = confirmed[0]?.value as Partial<ConfirmedInvoiceTax> | undefined;
  if (!tax || receipts.length !== 1 || confirmed.length !== 1 ||
      confirmed[0].approvedWorkId !== invoice.approvedWorkId || !rm ||
      fields.some(key => rm[key] !== tax[key]))
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirmed invoice tax is missing or does not match its conversion receipt." });
}

export function assertSageSupported(invoice: Pick<Invoice, "confirmedTax">): void {
  if (invoice.confirmedTax != null) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sage export is unavailable until a mapping that preserves this invoice’s exact GST and PST is verified.",
    });
  }
}
