import PDFDocument from "pdfkit";
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_SIZES,
  PDF_SPACING,
  drawLogo,
  drawFooter,
} from "./pdfSharedStyles.js";

export interface InvoiceLineItemDisplay {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable: boolean;
}

export interface InvoicePdfData {
  invoiceId: number;
  invoiceNumber: string;
  companyName: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  billToName?: string;
  billToAddress?: string;
  billToCity?: string;
  billToState?: string;
  billToPostalCode?: string;
  siteName?: string;
  siteAddress?: string;
  invoiceDate?: Date | null;
  dueDate?: Date | null;
  lineItems: InvoiceLineItemDisplay[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  clientNotes?: string | null;
}

const fmt = (n: number) =>
  `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

export async function generateInvoicePDF(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: PDF_SIZES.margin, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = PDF_SIZES.margin;
    const PW = PDF_SIZES.pageWidth;
    const contentWidth = PW - M * 2;

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 70).fill(PDF_COLORS.brandNavy);
    drawLogo(doc, M, 12, 80);
    doc.font(PDF_FONTS.bold).fontSize(16).fillColor(PDF_COLORS.white)
       .text(data.companyName, M + 100, 20, { width: contentWidth - 100, align: "right" });
    if (data.companyPhone || data.companyEmail) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayLight)
         .text([data.companyPhone, data.companyEmail].filter(Boolean).join("  ·  "), M + 100, 38, { width: contentWidth - 100, align: "right" });
    }
    if (data.companyAddress) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayLight)
         .text(data.companyAddress, M + 100, 50, { width: contentWidth - 100, align: "right" });
    }

    // ── Title row ────────────────────────────────────────────────────────────
    const titleY = 82;
    doc.font(PDF_FONTS.bold).fontSize(22).fillColor(PDF_COLORS.brandNavy)
       .text("INVOICE", M, titleY);

    const metaX = M + contentWidth * 0.55;
    const metaW = contentWidth * 0.45;
    const drawMeta = (label: string, value: string, y: number) => {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayMedium)
         .text(label, metaX, y, { width: metaW * 0.4 });
      doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.black)
         .text(value, metaX + metaW * 0.4, y, { width: metaW * 0.6 });
    };
    drawMeta("Invoice #", data.invoiceNumber, titleY);
    drawMeta("Date", fmtDate(data.invoiceDate), titleY + 13);
    drawMeta("Due", fmtDate(data.dueDate), titleY + 26);

    // ── Bill-to / Site info ──────────────────────────────────────────────────
    const infoY = 122;
    const col2 = M + contentWidth / 2;

    doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.grayMedium)
       .text("BILL TO", M, infoY);
    if (data.siteName) {
      doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.grayMedium)
         .text("SITE", col2, infoY);
    }

    doc.font(PDF_FONTS.bold).fontSize(10).fillColor(PDF_COLORS.black)
       .text(data.billToName ?? "", M, infoY + 13);
    if (data.siteName) {
      doc.font(PDF_FONTS.bold).fontSize(10).fillColor(PDF_COLORS.black)
         .text(data.siteName, col2, infoY + 13);
    }

    let addrY = infoY + 27;
    const billLines = [
      data.billToAddress,
      [data.billToCity, data.billToState, data.billToPostalCode].filter(Boolean).join(", "),
    ].filter(Boolean);
    for (const line of billLines) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark).text(line!, M, addrY);
      addrY += 11;
    }
    if (data.siteAddress) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark).text(data.siteAddress, col2, infoY + 27);
    }

    // ── Divider ──────────────────────────────────────────────────────────────
    const divY = 170;
    doc.moveTo(M, divY).lineTo(M + contentWidth, divY).lineWidth(0.5).stroke(PDF_COLORS.grayLight);

    let curY = divY + 10;

    // ── Line items table ─────────────────────────────────────────────────────
    const COL = { desc: contentWidth - 60 - 80 - 70, qty: 60, price: 80, total: 70 };
    const colX = {
      desc:  M,
      qty:   M + COL.desc,
      price: M + COL.desc + COL.qty,
      total: M + COL.desc + COL.qty + COL.price,
    };

    // Table header
    doc.rect(M, curY, contentWidth, PDF_SPACING.headerHeight).fill(PDF_COLORS.brandNavy);
    doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.white)
       .text("DESCRIPTION", colX.desc + 4, curY + 8, { width: COL.desc - 8 })
       .text("QTY", colX.qty, curY + 8, { width: COL.qty - 4, align: "right" })
       .text("UNIT PRICE", colX.price, curY + 8, { width: COL.price - 4, align: "right" })
       .text("TOTAL", colX.total, curY + 8, { width: COL.total - 4, align: "right" });
    curY += PDF_SPACING.headerHeight;

    data.lineItems.forEach((item, i) => {
      const desc = item.taxable ? `${item.description}  *` : item.description;
      const descH = doc.font(PDF_FONTS.regular).fontSize(8).heightOfString(desc, { width: COL.desc - 8 });
      const rowH = Math.max(24, descH + 12);

      doc.rect(M, curY, contentWidth, rowH).fill(i % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.grayLightest);
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.black)
         .text(desc, colX.desc + 4, curY + 6, { width: COL.desc - 8 })
         .text(String(item.quantity), colX.qty, curY + 6, { width: COL.qty - 4, align: "right" })
         .text(fmt(item.unitPrice), colX.price, curY + 6, { width: COL.price - 4, align: "right" })
         .text(fmt(item.total), colX.total, curY + 6, { width: COL.total - 4, align: "right" });
      curY += rowH;
    });

    // Taxable note
    if (data.lineItems.some((i) => i.taxable)) {
      curY += 4;
      doc.font(PDF_FONTS.italic).fontSize(7).fillColor(PDF_COLORS.grayMedium)
         .text("* Taxable", M, curY);
      curY += 12;
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    curY += 8;
    const totW = 200;
    const totX = M + contentWidth - totW;

    const drawTotRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        doc.rect(totX - 8, curY - 3, totW + 8, 20).fill(PDF_COLORS.brandNavy);
      }
      const color = highlight ? PDF_COLORS.white : bold ? PDF_COLORS.black : PDF_COLORS.grayMedium;
      doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular)
         .fontSize(bold ? 10 : 8).fillColor(color)
         .text(label, totX, curY, { width: 110, align: "right" });
      doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular)
         .fontSize(bold ? 10 : 8).fillColor(color)
         .text(value, totX + 110, curY, { width: totW - 110, align: "right" });
      curY += bold ? 22 : 16;
    };

    drawTotRow("Subtotal", fmt(data.subtotal));
    // Only render a tax line when tax was actually charged. Invoices sourced from
    // approved-work/repair quotes carry tax-inclusive line totals (taxable=false),
    // so they have a taxRate stamped but a $0 taxAmount — drawing the row there
    // would show a misleading "Tax (5%) $0.00" on the customer-facing PDF.
    if (data.taxAmount > 0) {
      drawTotRow(`Tax (${(data.taxRate * 100).toFixed(0)}%)`, fmt(data.taxAmount));
    }
    drawTotRow("TOTAL DUE", fmt(data.total), true, true);
    if (data.amountPaid > 0) {
      curY += 4;
      drawTotRow("Amount Paid", fmt(data.amountPaid));
      drawTotRow("Balance Due", fmt(data.balanceDue), true);
    }

    // ── Client notes ─────────────────────────────────────────────────────────
    if (data.clientNotes) {
      curY += 16;
      doc.moveTo(M, curY).lineTo(M + contentWidth, curY).lineWidth(0.5).stroke(PDF_COLORS.grayLight);
      curY += 8;
      doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.grayMedium).text("NOTES", M, curY);
      curY += 12;
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark)
         .text(data.clientNotes, M, curY, { width: contentWidth });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    drawFooter(doc, data.companyName, `Invoice ${data.invoiceNumber}`, 1, 1);

    doc.end();
  });
}
