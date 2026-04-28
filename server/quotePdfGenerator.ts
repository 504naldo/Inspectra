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
