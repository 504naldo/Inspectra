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
