/**
 * quotePdfGenerator.ts
 *
 * Generates a branded quote PDF for a deficiency repair estimate.
 * Uses PDFKit (same as pdfGenerator.ts) and the shared styles.
 */

import PDFDocument from "pdfkit";
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_SIZES,
  PDF_SPACING,
  drawLogo,
  drawFooter,
} from "./pdfSharedStyles.js";

export interface QuoteLineItemDisplay {
  deficiencyId: number | null;
  description: string;
  unitPrice: number;
  qty: number;
}

export interface QuoteReportData {
  quoteId: number;
  jobNumber: string;
  siteName: string;
  siteAddress: string;
  customerName: string;
  customerEmail?: string | null;
  companyName: string;
  createdAt: Date;
  lineItems: QuoteLineItemDisplay[];
  total: number;
  notes?: string | null;
  acceptUrl: string;
  deficiencySummaries?: Array<{
    title: string;
    severity: string;
    description?: string | null;
    location?: string | null;
  }>;
}

export async function generateQuotePDF(data: QuoteReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: PDF_SIZES.margin,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = PDF_SIZES.margin;
    const contentWidth = PDF_SIZES.pageWidth - M * 2;

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PDF_SIZES.pageWidth, 70).fill(PDF_COLORS.brandNavy);

    // Logo (top-left inside band)
    drawLogo(doc, M, 12, 80);

    // Company name (right side of band)
    doc
      .font(PDF_FONTS.bold)
      .fontSize(16)
      .fillColor(PDF_COLORS.white)
      .text(data.companyName, M + 100, 25, {
        width: contentWidth - 100,
        align: "right",
      });

    doc.moveDown(0);

    // ── Quote title ──────────────────────────────────────────────────────────
    const titleY = 85;
    doc
      .font(PDF_FONTS.bold)
      .fontSize(20)
      .fillColor(PDF_COLORS.brandNavy)
      .text("DEFICIENCY REPAIR QUOTE", M, titleY);

    doc
      .font(PDF_FONTS.regular)
      .fontSize(10)
      .fillColor(PDF_COLORS.grayMedium)
      .text(
        `Quote #${data.quoteId}   ·   ${data.jobNumber}   ·   ${data.createdAt.toLocaleDateString("en-CA")}`,
        M,
        titleY + 26
      );

    // ── Site / Customer info block ────────────────────────────────────────────
    const infoY = 130;
    const col2 = M + contentWidth / 2;

    doc
      .font(PDF_FONTS.bold)
      .fontSize(9)
      .fillColor(PDF_COLORS.grayMedium)
      .text("PREPARED FOR", M, infoY)
      .text("SITE", col2, infoY);

    doc
      .font(PDF_FONTS.bold)
      .fontSize(11)
      .fillColor(PDF_COLORS.black)
      .text(data.customerName, M, infoY + 14)
      .text(data.siteName, col2, infoY + 14);

    if (data.customerEmail) {
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayDark)
        .text(data.customerEmail, M, infoY + 28);
    }

    if (data.siteAddress) {
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayDark)
        .text(data.siteAddress, col2, infoY + 28);
    }

    // ── Divider ───────────────────────────────────────────────────────────────
    const divY = infoY + 52;
    doc
      .moveTo(M, divY)
      .lineTo(M + contentWidth, divY)
      .lineWidth(1)
      .stroke(PDF_COLORS.grayLight);

    // ── Line items table ──────────────────────────────────────────────────────
    const tableY = divY + 10;
    const colW = {
      desc: contentWidth - 120 - 60 - 60,
      qty: 60,
      price: 80,
      total: 80,
    };
    const colX = {
      desc: M,
      qty: M + colW.desc,
      price: M + colW.desc + colW.qty,
      total: M + colW.desc + colW.qty + colW.price,
    };

    // Table header
    doc.rect(M, tableY, contentWidth, PDF_SPACING.headerHeight).fill(PDF_COLORS.brandNavy);

    doc
      .font(PDF_FONTS.bold)
      .fontSize(9)
      .fillColor(PDF_COLORS.white)
      .text("DESCRIPTION", colX.desc + 4, tableY + 8, { width: colW.desc - 8 })
      .text("QTY", colX.qty, tableY + 8, { width: colW.qty, align: "center" })
      .text("UNIT PRICE", colX.price, tableY + 8, { width: colW.price, align: "right" })
      .text("TOTAL", colX.total, tableY + 8, { width: colW.total, align: "right" });

    let rowY = tableY + PDF_SPACING.headerHeight;

    data.lineItems.forEach((item, i) => {
      const lineTotal = item.unitPrice * item.qty;
      const bg = i % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.grayLightest;

      // Measure description height
      const descHeight = doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .heightOfString(item.description, { width: colW.desc - 8 });
      const rowH = Math.max(20, descHeight + 10);

      doc.rect(M, rowY, contentWidth, rowH).fill(bg);

      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.black)
        .text(item.description, colX.desc + 4, rowY + 5, {
          width: colW.desc - 8,
        })
        .text(String(item.qty), colX.qty, rowY + 5, { width: colW.qty, align: "center" })
        .text(`$${item.unitPrice.toFixed(2)}`, colX.price, rowY + 5, {
          width: colW.price,
          align: "right",
        })
        .text(`$${lineTotal.toFixed(2)}`, colX.total, rowY + 5, {
          width: colW.total,
          align: "right",
        });

      rowY += rowH;
    });

    // Total row
    doc.rect(M, rowY, contentWidth, 24).fill(PDF_COLORS.brandNavy);
    doc
      .font(PDF_FONTS.bold)
      .fontSize(11)
      .fillColor(PDF_COLORS.white)
      .text("TOTAL", colX.price, rowY + 6, { width: colW.price, align: "right" })
      .text(`$${data.total.toFixed(2)}`, colX.total, rowY + 6, {
        width: colW.total,
        align: "right",
      });

    rowY += 24;

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (data.notes) {
      rowY += 16;
      doc
        .font(PDF_FONTS.bold)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayMedium)
        .text("NOTES", M, rowY);
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.black)
        .text(data.notes, M, rowY + 12, { width: contentWidth });
      rowY += 12 + doc.heightOfString(data.notes, { width: contentWidth }) + 4;
    }

    // ── Deficiency summary ────────────────────────────────────────────────────
    if (data.deficiencySummaries && data.deficiencySummaries.length > 0) {
      rowY += 16;
      doc
        .font(PDF_FONTS.bold)
        .fontSize(12)
        .fillColor(PDF_COLORS.brandNavy)
        .text("DEFICIENCY SUMMARY", M, rowY);
      rowY += 18;

      for (const def of data.deficiencySummaries) {
        const severityColor =
          def.severity === "critical"
            ? PDF_COLORS.dangerRed
            : def.severity === "major"
            ? PDF_COLORS.warningOrange
            : PDF_COLORS.warningYellow;

        doc
          .font(PDF_FONTS.bold)
          .fontSize(9)
          .fillColor(severityColor)
          .text(def.severity.toUpperCase(), M, rowY, { continued: true })
          .fillColor(PDF_COLORS.black)
          .text(`  ${def.title}`);
        rowY = doc.y + 2;

        if (def.description) {
          doc
            .font(PDF_FONTS.regular)
            .fontSize(9)
            .fillColor(PDF_COLORS.grayDark)
            .text(def.description, M + 10, rowY, { width: contentWidth - 10 });
          rowY = doc.y + 4;
        }
      }
    }

    // ── Accept link block ─────────────────────────────────────────────────────
    const acceptY = Math.max(rowY + 24, PDF_SIZES.pageHeight - 180);

    doc
      .moveTo(M, acceptY)
      .lineTo(M + contentWidth, acceptY)
      .lineWidth(1)
      .stroke(PDF_COLORS.grayLight);

    doc
      .rect(M, acceptY + 10, contentWidth, 60)
      .fillAndStroke(PDF_COLORS.grayLightest, PDF_COLORS.grayLight);

    doc
      .font(PDF_FONTS.bold)
      .fontSize(10)
      .fillColor(PDF_COLORS.brandNavy)
      .text("TO ACCEPT THIS QUOTE", M + 12, acceptY + 20);

    doc
      .font(PDF_FONTS.regular)
      .fontSize(9)
      .fillColor(PDF_COLORS.grayDark)
      .text(
        "Click the link below or copy it into your browser to approve this repair quote:",
        M + 12,
        acceptY + 34,
        { width: contentWidth - 24 }
      );

    doc
      .font(PDF_FONTS.bold)
      .fontSize(9)
      .fillColor(PDF_COLORS.brandNavyLight)
      .text(data.acceptUrl, M + 12, acceptY + 52, {
        width: contentWidth - 24,
        link: data.acceptUrl,
      });

    // ── Footer ────────────────────────────────────────────────────────────────
    drawFooter(doc, data.companyName, `Q-${data.quoteId}`, 1, 1);

    doc.end();
  });
}

// ─── Repair Quote PDF ─────────────────────────────────────────────────────────

export interface RepairQuoteItemDisplay {
  description: string;
  repairNotes?: string | null;
  systemType?: string | null;
  location?: string | null;
  quantity: number;
  partDescription?: string | null;
  partUnitPrice: number;
  partTotal: number;
  techHours: number;
  fitterHours: number;
  techLabourRate: number;
  fitterLabourRate: number;
  labourTotal: number;
  fuelCharge: number;
  backflowReportFee: number;
  gst: number;
  pst: number;
  total: number;
}

export interface RepairQuoteReportData {
  quoteId: number;
  quoteNumber: string;
  companyName: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  customerName: string;
  customerContactName?: string;
  siteName: string;
  siteAddress?: string;
  jobNumber: string;
  createdAt: Date;
  validUntil?: Date | null;
  items: RepairQuoteItemDisplay[];
  subtotal: number;
  gst: number;
  pst: number;
  total: number;
  notes?: string | null;
}

export async function generateRepairQuotePDF(data: RepairQuoteReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: PDF_SIZES.margin, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = PDF_SIZES.margin;
    const PW = PDF_SIZES.pageWidth;
    const contentWidth = PW - M * 2;

    // ── Header band ─────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 70).fill(PDF_COLORS.brandNavy);
    drawLogo(doc, M, 12, 80);
    doc.font(PDF_FONTS.bold).fontSize(16).fillColor(PDF_COLORS.white)
       .text(data.companyName, M + 100, 20, { width: contentWidth - 100, align: "right" });
    if (data.companyPhone || data.companyEmail) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayLight)
         .text([data.companyPhone, data.companyEmail].filter(Boolean).join("  ·  "), M + 100, 38, { width: contentWidth - 100, align: "right" });
    }

    // ── Title ───────────────────────────────────────────────────────────────
    const titleY = 82;
    doc.font(PDF_FONTS.bold).fontSize(18).fillColor(PDF_COLORS.brandNavy)
       .text("REPAIR QUOTE", M, titleY);
    doc.font(PDF_FONTS.regular).fontSize(9).fillColor(PDF_COLORS.grayMedium)
       .text(
         `${data.quoteNumber}   ·   Job ${data.jobNumber}   ·   ${data.createdAt.toLocaleDateString("en-CA")}` +
         (data.validUntil ? `   ·   Valid until ${data.validUntil.toLocaleDateString("en-CA")}` : ""),
         M, titleY + 22
       );

    // ── Info block ──────────────────────────────────────────────────────────
    const infoY = 122;
    const col2 = M + contentWidth / 2;

    doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.grayMedium)
       .text("PREPARED FOR", M, infoY)
       .text("SITE / JOB", col2, infoY);

    doc.font(PDF_FONTS.bold).fontSize(10).fillColor(PDF_COLORS.black)
       .text(data.customerName, M, infoY + 13)
       .text(data.siteName, col2, infoY + 13);

    let infoRowY = infoY + 26;
    if (data.customerContactName) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark)
         .text(`Attn: ${data.customerContactName}`, M, infoRowY);
    }
    if (data.siteAddress) {
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark)
         .text(data.siteAddress, col2, infoRowY);
    }

    // ── Divider ─────────────────────────────────────────────────────────────
    const divY = 168;
    doc.moveTo(M, divY).lineTo(M + contentWidth, divY).lineWidth(1).stroke(PDF_COLORS.grayLight);

    let curY = divY + 10;

    // ── Items table ──────────────────────────────────────────────────────────
    const COL = {
      desc:    contentWidth - 80 - 70 - 70 - 70,
      parts:   80,
      labour:  70,
      fees:    70,
      total:   70,
    };
    const colX = {
      desc:   M,
      parts:  M + COL.desc,
      labour: M + COL.desc + COL.parts,
      fees:   M + COL.desc + COL.parts + COL.labour,
      total:  M + COL.desc + COL.parts + COL.labour + COL.fees,
    };

    // Table header
    doc.rect(M, curY, contentWidth, PDF_SPACING.headerHeight).fill(PDF_COLORS.brandNavy);
    doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.white)
       .text("DESCRIPTION / REPAIR", colX.desc + 4, curY + 8, { width: COL.desc - 8 })
       .text("PARTS", colX.parts, curY + 8, { width: COL.parts - 4, align: "right" })
       .text("LABOUR", colX.labour, curY + 8, { width: COL.labour - 4, align: "right" })
       .text("FEES", colX.fees, curY + 8, { width: COL.fees - 4, align: "right" })
       .text("TOTAL", colX.total, curY + 8, { width: COL.total - 4, align: "right" });
    curY += PDF_SPACING.headerHeight;

    data.items.forEach((item, i) => {
      const lines: string[] = [item.description];
      if (item.location) lines.push(`Location: ${item.location}`);
      if (item.partDescription) lines.push(`Part: ${item.partDescription} × ${item.quantity} @ $${item.partUnitPrice.toFixed(2)}`);
      if (item.techHours || item.fitterHours) {
        const lParts: string[] = [];
        if (item.techHours) lParts.push(`Tech ${item.techHours}h @ $${item.techLabourRate.toFixed(2)}`);
        if (item.fitterHours) lParts.push(`Fitter ${item.fitterHours}h @ $${item.fitterLabourRate.toFixed(2)}`);
        lines.push(lParts.join("  ·  "));
      }
      if (item.repairNotes) lines.push(item.repairNotes);

      const descText = lines.join("\n");
      const descH = doc.font(PDF_FONTS.regular).fontSize(8).heightOfString(descText, { width: COL.desc - 8 });
      const rowH = Math.max(28, descH + 12);

      const bg = i % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.grayLightest;
      doc.rect(M, curY, contentWidth, rowH).fill(bg);

      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.black)
         .text(descText, colX.desc + 4, curY + 6, { width: COL.desc - 8 })
         .text(item.partTotal > 0 ? `$${item.partTotal.toFixed(2)}` : "—", colX.parts, curY + 6, { width: COL.parts - 4, align: "right" })
         .text(item.labourTotal > 0 ? `$${item.labourTotal.toFixed(2)}` : "—", colX.labour, curY + 6, { width: COL.labour - 4, align: "right" })
         .text((item.fuelCharge + item.backflowReportFee) > 0 ? `$${(item.fuelCharge + item.backflowReportFee).toFixed(2)}` : "—", colX.fees, curY + 6, { width: COL.fees - 4, align: "right" })
         .text(`$${item.total.toFixed(2)}`, colX.total, curY + 6, { width: COL.total - 4, align: "right" });

      curY += rowH;
    });

    // ── Totals block ─────────────────────────────────────────────────────────
    curY += 8;
    const totW = 200;
    const totX = M + contentWidth - totW;

    const drawTotRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular).fontSize(bold ? 10 : 8)
         .fillColor(PDF_COLORS.grayMedium)
         .text(label, totX, curY, { width: 110, align: "right" });
      doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular).fontSize(bold ? 10 : 8)
         .fillColor(PDF_COLORS.black)
         .text(value, totX + 118, curY, { width: totW - 118, align: "right" });
      curY += bold ? 16 : 13;
    };

    drawTotRow("Subtotal (before tax)", `$${data.subtotal.toFixed(2)}`);
    drawTotRow("GST (5%)", `$${data.gst.toFixed(2)}`);
    drawTotRow("PST (7% on parts)", `$${data.pst.toFixed(2)}`);

    doc.moveTo(totX, curY - 2).lineTo(M + contentWidth, curY - 2).lineWidth(0.5).stroke(PDF_COLORS.grayLight);
    curY += 4;

    // Total — navy background
    doc.rect(totX - 10, curY - 4, totW + 10, 26).fill(PDF_COLORS.brandNavy);
    doc.font(PDF_FONTS.bold).fontSize(11).fillColor(PDF_COLORS.white)
       .text("TOTAL", totX, curY + 3, { width: 110, align: "right" })
       .text(`$${data.total.toFixed(2)}`, totX + 118, curY + 3, { width: totW - 118, align: "right" });
    curY += 32;

    doc.font(PDF_FONTS.regular).fontSize(7).fillColor(PDF_COLORS.grayMedium)
       .text("All amounts in CAD. GST 5% on parts and labour. PST 7% on parts only.", totX - 10, curY, { width: totW + 10, align: "right" });
    curY += 16;

    // ── Notes ────────────────────────────────────────────────────────────────
    if (data.notes) {
      curY += 8;
      doc.font(PDF_FONTS.bold).fontSize(8).fillColor(PDF_COLORS.grayMedium).text("NOTES", M, curY);
      curY += 12;
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.black)
         .text(data.notes, M, curY, { width: contentWidth });
      curY = doc.y + 8;
    }

    // ── Approval / Signature block ────────────────────────────────────────────
    const sigY = Math.max(curY + 20, PDF_SIZES.pageHeight - 160);
    doc.moveTo(M, sigY).lineTo(M + contentWidth, sigY).lineWidth(1).stroke(PDF_COLORS.grayLight);

    doc.rect(M, sigY + 8, contentWidth, 80).fillAndStroke(PDF_COLORS.grayLightest, PDF_COLORS.grayLight);

    doc.font(PDF_FONTS.bold).fontSize(9).fillColor(PDF_COLORS.brandNavy)
       .text("CUSTOMER APPROVAL", M + 10, sigY + 16);
    doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_COLORS.grayDark)
       .text("By signing below, you authorize the listed repair work at the quoted price.", M + 10, sigY + 28, { width: contentWidth / 2 - 20 });

    // Signature lines
    const sigLineY = sigY + 56;
    doc.moveTo(M + 10, sigLineY).lineTo(M + contentWidth / 2 - 20, sigLineY).lineWidth(0.5).stroke(PDF_COLORS.grayMedium);
    doc.moveTo(M + contentWidth / 2 + 10, sigLineY).lineTo(M + contentWidth - 10, sigLineY).lineWidth(0.5).stroke(PDF_COLORS.grayMedium);

    doc.font(PDF_FONTS.regular).fontSize(7).fillColor(PDF_COLORS.grayMedium)
       .text("Authorized Signature & Date", M + 10, sigLineY + 4)
       .text("Print Name & Title", M + contentWidth / 2 + 10, sigLineY + 4);

    // ── Disclaimer ────────────────────────────────────────────────────────────
    const disclaimerY = sigY + 96;
    doc.font(PDF_FONTS.regular).fontSize(7).fillColor(PDF_COLORS.grayMedium)
       .text(
         `This quote is valid for ${data.validUntil ? `30 days` : "30 days"} from the date of issue. ` +
         "Prices are subject to change if scope of work changes upon inspection. " +
         "Additional deficiencies found during repair may be quoted separately.",
         M, disclaimerY, { width: contentWidth }
       );

    drawFooter(doc, data.companyName, data.quoteNumber, 1, 1);
    doc.end();
  });
}

// ─── Building Quote PDF ───────────────────────────────────────────────────────

export interface BuildingServiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  lineNotes?: string;
}

export interface BuildingLabourLine {
  labourType: string;
  hours: number;
  rate: number;
  lineNotes?: string;
}

export interface BuildingQuoteReportData {
  quoteId: number;
  companyName: string;
  createdAt: Date;
  buildingName?: string;
  buildingId?: string;
  address?: string;
  city?: string;
  backflowFeeCity?: string;
  serviceLines: BuildingServiceLine[];
  labourLines: BuildingLabourLine[];
  servicesSubtotal: number;
  labourSubtotal: number;
  subtotal: number;
  discount: number;
  discountAmount: number;
  discountReason?: string;
  total: number;
  comments?: string;
}

export async function generateBuildingQuotePDF(data: BuildingQuoteReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: PDF_SIZES.margin,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const M = PDF_SIZES.margin;
    const contentWidth = PDF_SIZES.pageWidth - M * 2;

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PDF_SIZES.pageWidth, 70).fill(PDF_COLORS.brandNavy);
    drawLogo(doc, M, 12, 80);
    doc
      .font(PDF_FONTS.bold)
      .fontSize(16)
      .fillColor(PDF_COLORS.white)
      .text(data.companyName, M + 100, 25, { width: contentWidth - 100, align: "right" });

    // ── Title ────────────────────────────────────────────────────────────────
    const titleY = 85;
    doc
      .font(PDF_FONTS.bold)
      .fontSize(20)
      .fillColor(PDF_COLORS.brandNavy)
      .text("BUILDING SERVICES QUOTE", M, titleY);

    doc
      .font(PDF_FONTS.regular)
      .fontSize(10)
      .fillColor(PDF_COLORS.grayMedium)
      .text(
        `Quote #${data.quoteId}   ·   ${data.createdAt.toLocaleDateString("en-CA")}`,
        M,
        titleY + 26
      );

    // ── Building info block ───────────────────────────────────────────────────
    const infoY = 130;
    doc
      .font(PDF_FONTS.bold)
      .fontSize(9)
      .fillColor(PDF_COLORS.grayMedium)
      .text("BUILDING", M, infoY);

    let infoLineY = infoY + 14;
    if (data.buildingName) {
      doc
        .font(PDF_FONTS.bold)
        .fontSize(11)
        .fillColor(PDF_COLORS.black)
        .text(data.buildingName, M, infoLineY);
      infoLineY += 16;
    }
    if (data.address) {
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayDark)
        .text(data.address, M, infoLineY);
      infoLineY += 13;
    }
    const cityLine = [data.city, data.backflowFeeCity ? `Backflow city: ${data.backflowFeeCity}` : null]
      .filter(Boolean)
      .join("   ·   ");
    if (cityLine) {
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayDark)
        .text(cityLine, M, infoLineY);
      infoLineY += 13;
    }
    if (data.buildingId) {
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayMedium)
        .text(`Building ID: ${data.buildingId}`, M, infoLineY);
    }

    // ── Divider ───────────────────────────────────────────────────────────────
    const divY = 188;
    doc
      .moveTo(M, divY)
      .lineTo(M + contentWidth, divY)
      .lineWidth(1)
      .stroke(PDF_COLORS.grayLight);

    let curY = divY + 12;

    // ── Helper: draw a table ───────────────────────────────────────────────────
    const drawTable = (
      title: string,
      headers: string[],
      colWidths: number[],
      rows: string[][],
    ) => {
      // Section title
      doc
        .font(PDF_FONTS.bold)
        .fontSize(11)
        .fillColor(PDF_COLORS.brandNavy)
        .text(title, M, curY);
      curY += 18;

      const totalW = colWidths.reduce((a, b) => a + b, 0);
      let colX = M;
      const colXs = colWidths.map((w) => { const x = colX; colX += w; return x; });

      // Header row
      doc.rect(M, curY, totalW, PDF_SPACING.headerHeight).fill(PDF_COLORS.brandNavy);
      headers.forEach((h, i) => {
        const align = i === 0 ? "left" : "right";
        doc
          .font(PDF_FONTS.bold)
          .fontSize(9)
          .fillColor(PDF_COLORS.white)
          .text(h, colXs[i] + 4, curY + 8, { width: colWidths[i] - 8, align });
      });
      curY += PDF_SPACING.headerHeight;

      // Data rows
      rows.forEach((row, ri) => {
        const bg = ri % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.grayLightest;
        const rowH = 22;
        doc.rect(M, curY, totalW, rowH).fill(bg);
        row.forEach((cell, ci) => {
          const align = ci === 0 ? "left" : "right";
          doc
            .font(PDF_FONTS.regular)
            .fontSize(9)
            .fillColor(PDF_COLORS.black)
            .text(cell, colXs[ci] + 4, curY + 6, { width: colWidths[ci] - 8, align });
        });
        curY += rowH;
      });

      curY += 12;
    };

    // ── Services table ────────────────────────────────────────────────────────
    if (data.serviceLines.length > 0) {
      const descW = contentWidth - 60 - 80 - 80;
      drawTable(
        "Services",
        ["Description", "Qty", "Unit Price", "Total"],
        [descW, 60, 80, 80],
        data.serviceLines.map((s) => [
          s.description + (s.lineNotes ? `\n${s.lineNotes}` : ""),
          String(s.qty),
          `$${s.unitPrice.toFixed(2)}`,
          `$${(s.qty * s.unitPrice).toFixed(2)}`,
        ])
      );
    }

    // ── Labour table ──────────────────────────────────────────────────────────
    if (data.labourLines.length > 0) {
      const descW = contentWidth - 60 - 80 - 80;
      drawTable(
        "Labour",
        ["Type", "Hours", "Rate / hr", "Total"],
        [descW, 60, 80, 80],
        data.labourLines.map((l) => [
          l.labourType + (l.lineNotes ? `\n${l.lineNotes}` : ""),
          String(l.hours),
          `$${l.rate.toFixed(2)}`,
          `$${(l.hours * l.rate).toFixed(2)}`,
        ])
      );
    }

    // ── Totals block ──────────────────────────────────────────────────────────
    const totalsX = M + contentWidth - 220;
    const totalsW = 220;

    const drawTotalRow = (label: string, value: string, bold = false, color = PDF_COLORS.black) => {
      doc
        .font(bold ? PDF_FONTS.bold : PDF_FONTS.regular)
        .fontSize(bold ? 11 : 9)
        .fillColor(PDF_COLORS.grayMedium)
        .text(label, totalsX, curY, { width: 130, align: "right" });
      doc
        .font(bold ? PDF_FONTS.bold : PDF_FONTS.regular)
        .fontSize(bold ? 11 : 9)
        .fillColor(color)
        .text(value, totalsX + 140, curY, { width: 80, align: "right" });
      curY += bold ? 18 : 15;
    };

    drawTotalRow("Services Subtotal", `$${data.servicesSubtotal.toFixed(2)}`);
    drawTotalRow("Labour Subtotal", `$${data.labourSubtotal.toFixed(2)}`);

    doc
      .moveTo(totalsX, curY - 3)
      .lineTo(M + contentWidth, curY - 3)
      .lineWidth(0.5)
      .stroke(PDF_COLORS.grayLight);

    drawTotalRow("Subtotal", `$${data.subtotal.toFixed(2)}`);

    if (data.discount > 0) {
      const discLabel = `Discount (${data.discount}%${data.discountReason ? ` — ${data.discountReason}` : ""})`;
      drawTotalRow(discLabel, `-$${data.discountAmount.toFixed(2)}`, false, PDF_COLORS.successGreen);
    }

    // Total row with navy background
    const totalRowH = 26;
    doc.rect(M + contentWidth - 220, curY - 4, 220, totalRowH).fill(PDF_COLORS.brandNavy);
    doc
      .font(PDF_FONTS.bold)
      .fontSize(12)
      .fillColor(PDF_COLORS.white)
      .text("TOTAL (before tax)", totalsX, curY + 3, { width: 130, align: "right" })
      .text(`$${data.total.toFixed(2)}`, totalsX + 140, curY + 3, { width: 80, align: "right" });
    curY += totalRowH + 4;

    doc
      .font(PDF_FONTS.regular)
      .fontSize(8)
      .fillColor(PDF_COLORS.grayMedium)
      .text("Amounts in CAD. Applicable taxes are extra.", M + contentWidth - 220, curY, {
        width: 220,
        align: "right",
      });
    curY += 20;

    // ── Comments ──────────────────────────────────────────────────────────────
    if (data.comments) {
      curY += 8;
      doc
        .font(PDF_FONTS.bold)
        .fontSize(9)
        .fillColor(PDF_COLORS.grayMedium)
        .text("COMMENTS", M, curY);
      curY += 12;
      doc
        .font(PDF_FONTS.regular)
        .fontSize(9)
        .fillColor(PDF_COLORS.black)
        .text(data.comments, M, curY, { width: contentWidth });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    drawFooter(doc, data.companyName, `BQ-${data.quoteId}`, 1, 1);

    doc.end();
  });
}
