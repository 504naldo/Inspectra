import { TRPCError } from "@trpc/server";

/** Parse recorded two-place decimals without floating-point rounding. */
function cents(value: number | string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || (match[2]?.length ?? 0) > 2) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Repair prices, rates, hours and fees must use at most two decimal places." });
  }
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}

export function isRepairDecimal(value: number): boolean {
  try { cents(value); return true; } catch { return false; }
}

function amount(value: bigint): number {
  if (value > BigInt(9999999999)) throw new TRPCError({ code: "BAD_REQUEST", message: "Repair amount exceeds the supported quote limit." });
  return Number(value) / 100;
}

function rounded(value: bigint, denominator: number): bigint {
  return (value + BigInt(denominator / 2)) / BigInt(denominator);
}

export type RepairPricingInput = {
  quantity: number;
  partUnitPrice: number;
  techHours: number;
  fitterHours: number;
  techLabourRate: number;
  fitterLabourRate: number;
  fuelCharge: number;
  backflowReportFee: number;
};

/** Round each stored monetary component first; taxes use those same cents. */
export function calculateRepairItem(input: RepairPricingInput) {
  const part = cents(input.partUnitPrice) * BigInt(input.quantity);
  const labour = rounded(cents(input.techHours) * cents(input.techLabourRate) + cents(input.fitterHours) * cents(input.fitterLabourRate), 100);
  const fuel = cents(input.fuelCharge), report = cents(input.backflowReportFee);
  const gst = rounded((part + labour + report) * BigInt(5), 100);
  const pst = rounded(part * BigInt(7), 100);
  const subtotal = part + labour + fuel + report;
  return { partTotal: amount(part), labourTotal: amount(labour), lineSubtotal: amount(subtotal), gst: amount(gst), pst: amount(pst), total: amount(subtotal + gst + pst) };
}

type RecordedItem = { partTotal: number | string | null; labourTotal: number | string | null; fuelCharge: number | string | null; backflowReportFee: number | string | null; gst: number | string | null; pst: number | string | null; total: number | string | null };

/** Parent and artifact totals must agree with the exact cents already recorded. */
export function calculateRepairQuoteTotals(items: RecordedItem[]) {
  let subtotal = BigInt(0), gst = BigInt(0), pst = BigInt(0), total = BigInt(0);
  for (const item of items) {
    const part = recorded(item.partTotal), labour = recorded(item.labourTotal), fuel = recorded(item.fuelCharge), report = recorded(item.backflowReportFee);
    const itemGst = recorded(item.gst), itemPst = recorded(item.pst), itemTotal = recorded(item.total);
    const itemSubtotal = part + labour + fuel + report;
    if (itemTotal !== itemSubtotal + itemGst + itemPst) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recorded repair item totals are inconsistent. Reconcile the draft pricing before sealing or issuing the quote." });
    }
    subtotal += itemSubtotal; gst += itemGst; pst += itemPst; total += itemTotal;
  }
  return { subtotal: amount(subtotal), gst: amount(gst), pst: amount(pst), total: amount(total) };
}

function recorded(value: number | string | null): bigint {
  if (value === null) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Repair pricing evidence is missing. Reconcile it before issuing the quote." });
  return cents(value);
}

export function assertRecordedRepairTotal(quote: { total: string; subtotal: string | null; gst: string | null; pst: string | null }, items: RecordedItem[]): void {
  if (!items.length) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The repair quote total does not match its recorded items. Reconcile it before sending or converting the quote." });
  }
  const totals = calculateRepairQuoteTotals(items);
  for (const key of ["subtotal", "gst", "pst", "total"] as const) {
    if (recorded(quote[key]) !== cents(totals[key])) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The repair quote totals do not match its recorded items. Reconcile them before sending or converting the quote." });
    }
  }
}
