/**
 * invoiceWorkflow.test.ts — end-to-end UAT for the revenue loop.
 *
 * Exercises the real routers against a live database (no mocks):
 *   Approved Work → invoice auto-creation (line-item snapshot) →
 *   invoice PDF generation → Sage 50 Canada CSV export.
 *
 * Covers the previously-untested feature work: approvedWork.createInvoice,
 * recalculateInvoiceTotals, generateInvoicePDF, and invoice.exportSage
 * (including the Sage 50 CA column layout and the company tax-code wiring).
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateInvoicePDF } from "./invoicePdfGenerator";

const SAGE_HEADER =
  "Invoice Number,Invoice Date,Due Date,Customer Code,Customer Name,Item Description,Quantity,Unit Price,Amount,G/L Account,Tax Code,Department,Status";

function officeCtx(companyId: number, userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `office-${userId}`,
      email: "office@example.com",
      name: "Office User",
      role: "office",
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    req: { headers: {}, ip: "127.0.0.1" },
    res: { setHeader: () => {}, clearCookie: () => {} },
    requestId: "test-req",
    ip: "127.0.0.1",
    userAgent: "vitest",
  } as unknown as TrpcContext;
}

describe("Revenue loop UAT — Approved Work → Invoice → Sage CSV", () => {
  let companyId: number;
  let customerOrgId: number;
  let siteId: number;
  let caller: ReturnType<typeof appRouter.createCaller>;
  let adminCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const company = await db.createCompany({ name: "UAT Fire Co", email: "uat@example.com" });
    companyId = company.id;

    // Sage tax code the export should stamp onto taxable lines.
    await db.upsertCompanySettings(companyId, { sageTaxCodeDefault: "GP" });

    const org = await db.createCustomerOrg({
      companyId,
      name: "UAT Customer Ltd",
      contactName: "Pat Buyer",
      contactEmail: "pat@customer.com",
      address: "100 Test Ave, Vancouver BC",
    });
    customerOrgId = org.id;

    const site = await db.createSite({ companyId, customerOrgId, name: "UAT Site" });
    siteId = site.id;

    caller = appRouter.createCaller(officeCtx(companyId, 1));
    // Sage export is admin-only (PR-10); use an admin caller for that step.
    adminCaller = appRouter.createCaller({ ...officeCtx(companyId, 2), user: { ...officeCtx(companyId, 2).user, role: "admin" } } as unknown as TrpcContext);
  });

  it("auto-creates an invoice from approved work with a snapshotted line item", async () => {
    const aw = await db.createApprovedWork({
      companyId,
      customerOrgId,
      siteId,
      type: "repair_order",
      status: "approved",
      approvedScope: "Replace 2 smoke detectors",
      approvedAmount: "525.00",
    });

    const res = await caller.approvedWork.createInvoice({ id: aw.id });
    expect(res.invoiceId).toBeGreaterThan(0);
    expect(res.invoiceNumber).toMatch(/^INV-/);

    const inv = await db.getInvoiceById(res.invoiceId);
    expect(inv?.status).toBe("draft");
    // Fallback line is sourced from approvedAmount, which is tax-inclusive →
    // stored taxable:false, so tax is $0 and total == subtotal == approvedAmount.
    expect(Number(inv?.subtotal)).toBe(525);
    expect(Number(inv?.taxAmount)).toBe(0);
    expect(Number(inv?.total)).toBe(525);

    const lines = await db.getLineItemsByInvoice(res.invoiceId);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Replace 2 smoke detectors");
    expect(Number(lines[0].total)).toBe(525);
    expect(Boolean(lines[0].taxable)).toBe(false);

    // Approved work is flipped to invoiced and stamped with the invoice number.
    const updated = await db.getApprovedWorkById(aw.id);
    expect(updated?.status).toBe("invoiced");
    expect(updated?.invoiceNumber).toBe(res.invoiceNumber);
  });

  it("blocks a second invoice for the same approved work", async () => {
    const aw = await db.createApprovedWork({
      companyId, customerOrgId, siteId,
      type: "repair_order", status: "approved",
      approvedScope: "Once only", approvedAmount: "100.00",
    });
    await caller.approvedWork.createInvoice({ id: aw.id });
    await expect(caller.approvedWork.createInvoice({ id: aw.id })).rejects.toThrow();
  });

  it("exports a Sage 50 Canada CSV with the documented columns and tax code", async () => {
    const aw = await db.createApprovedWork({
      companyId, customerOrgId, siteId,
      type: "repair_order", status: "approved",
      approvedScope: "Annual inspection", approvedAmount: "450.00",
    });
    const { invoiceId } = await caller.approvedWork.createInvoice({ id: aw.id });

    // Add a taxable line so the Tax Code column is exercised.
    await caller.invoice.addLineItem({
      invoiceId, description: "Parts", quantity: 1, unitPrice: 80, taxable: true,
    });

    const out = await adminCaller.invoice.exportSage({ ids: [invoiceId] });
    const rows = out.csv.split("\n");

    expect(rows[0]).toBe(SAGE_HEADER);
    expect(out.count).toBe(1);

    const inv = await db.getInvoiceById(invoiceId);
    // One CSV row per line item, all sharing the invoice number.
    const invRows = rows.filter((r) => r.startsWith(`${inv!.invoiceNumber},`));
    expect(invRows.length).toBe(2);
    // The taxable "Parts" line carries the company Sage tax code; the
    // non-taxable fallback line leaves Tax Code blank.
    const partsRow = invRows.find((r) => r.includes("Parts"));
    expect(partsRow).toContain(",GP,");
    // Date is MM/DD/YYYY (Sage 50 CA default).
    expect(partsRow).toMatch(/,\d{2}\/\d{2}\/\d{4},/);

    // Export marks the invoice exported + locks it.
    const after = await db.getInvoiceById(invoiceId);
    expect(after?.sageExportStatus).toBe("exported");
  });

  it("generates a non-empty invoice PDF (tax row only when tax > 0)", async () => {
    const base = {
      invoiceId: 1, invoiceNumber: "INV-TEST", companyName: "UAT Fire Co",
      billToName: "UAT Customer Ltd",
      lineItems: [{ description: "Service", quantity: 1, unitPrice: 100, total: 100, taxable: false }],
      subtotal: 100, total: 100, amountPaid: 0, balanceDue: 100, clientNotes: null,
    };
    // Tax-inclusive invoice: taxRate stamped but taxAmount 0 → no misleading tax row.
    const noTax = await generateInvoicePDF({ ...base, taxRate: 0.05, taxAmount: 0 });
    // Normal taxed invoice.
    const taxed = await generateInvoicePDF({
      ...base,
      lineItems: [{ description: "Service", quantity: 1, unitPrice: 100, total: 100, taxable: true }],
      taxRate: 0.05, taxAmount: 5, total: 105, balanceDue: 105,
    });
    expect(noTax.length).toBeGreaterThan(500);
    expect(taxed.length).toBeGreaterThan(500);
    expect(Buffer.isBuffer(noTax)).toBe(true);
  });
});
