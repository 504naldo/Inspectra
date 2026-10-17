import { describe, expect, it } from "vitest";
import type { Invoice, InvoiceLineItem } from "../drizzle/schema";
import { assertSageInvoiceTotals, calculateInvoiceLineTotal, calculateInvoiceTotals } from "./invoiceIntegrity";

const line = { quantity: "1.00", unitPrice: "20.10", total: "20.10", taxable: true } as InvoiceLineItem;
const invoice = { invoiceNumber: "INV-1", taxRate: "0.0500", amountPaid: "0.00", subtotal: "20.10", taxAmount: "1.01", total: "21.11", balanceDue: "21.11" } as Invoice;

describe("Invoice accounting evidence", () => {
  it("rounds a half-cent tax in exact decimal cents", () => {
    expect(calculateInvoiceTotals(invoice, [line])).toEqual({ subtotal: "20.10", taxAmount: "1.01", total: "21.11", balanceDue: "21.11" });
    expect(() => assertSageInvoiceTotals(invoice, [line])).not.toThrow();
  });

  it("rounds each fractional-quantity line once before adding invoice tax", () => {
    expect(calculateInvoiceLineTotal("0.50", "2.01")).toBe("1.01");
    expect(calculateInvoiceTotals({ taxRate: "0.0500", amountPaid: "0.00" }, [
      { total: "1.01", taxable: true }, { total: "1.01", taxable: true },
    ])).toEqual({ subtotal: "2.02", taxAmount: "0.10", total: "2.12", balanceDue: "2.12" });
  });

  it("preserves cumulative paid amounts and clamps an overpaid balance at zero", () => {
    const paid = { ...invoice, amountPaid: "25.00", balanceDue: "0.00" };
    expect(calculateInvoiceTotals(paid, [line]).balanceDue).toBe("0.00");
    expect(() => assertSageInvoiceTotals(paid, [line])).not.toThrow();
    expect(paid.amountPaid).toBe("25.00");
  });

  it("taxes only the recorded taxable lines", () => {
    expect(calculateInvoiceTotals(invoice, [{ ...line, taxable: false }])).toEqual({ subtotal: "20.10", taxAmount: "0.00", total: "20.10", balanceDue: "20.10" });
  });

  it.each(["subtotal", "taxAmount", "total", "balanceDue"] as const)("rejects an inconsistent recorded %s without rewriting evidence", field => {
    const invalid = { ...invoice, [field]: "2.00" };
    expect(() => assertSageInvoiceTotals(invalid, [line])).toThrow(/Reconcile/);
    expect(invalid[field]).toBe("2.00");
  });

  it("rejects header-only summary invoices instead of synthesizing accounting detail", () => {
    expect(() => assertSageInvoiceTotals(invoice, [])).toThrow(/Reconcile/);
  });

  it.each(["NaN", "Infinity", "-1.00", "1.001", "1e2", null])("rejects malformed/negative/overprecision line amounts %s", total => {
    expect(() => assertSageInvoiceTotals(invoice, [{ ...line, total }])).toThrow(/Reconcile/);
  });

  it("rejects line amounts that disagree with the recorded quantity and price", () => {
    expect(() => assertSageInvoiceTotals(invoice, [{ ...line, quantity: "2.00" }])).toThrow(/Reconcile/);
  });
});
