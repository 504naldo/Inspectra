import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_SIZES,
  PDF_SPACING,
  drawLogo,
  drawEnhancedCoverPage,
  drawTable,
  drawSectionHeader,
  applyFootersToAllPages,
  drawDeficiencySummaryPage,
  drawSignatureTable,
} from './pdfSharedStyles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DeviceSummary {
  deviceType: string;
  total: number;
  passed: number;
  failed: number;
  na: number;
}

interface Deficiency {
  id: number;
  title: string;
  severity: string;
  status: string;
  description?: string | null;
  correctiveAction?: string | null;
  deviceType?: string;
  location?: string;
  estimatedCost?: string | null; // MySQL decimal returns string from Drizzle
  systemCategory?: 'FIRE_ALARM' | 'SMOKE_ALARM' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHTING' | 'SPRINKLER' | null;
}

interface InspectionResult {
  deviceId: number;
  deviceType: string;
  location?: string | null;
  serialNumber?: string | null;
  result: string;
  notes?: string | null;
}

interface ReportData {
  jobNumber: string;
  jobTitle: string;
  siteName: string;
  siteAddress: string;
  siteCity: string;
  siteState: string;
  customerName: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerPostalCode?: string;
  attentionTo?: string;
  attentionEmail?: string;
  inspectionDate: Date;
  completedDate?: Date | null;
  technicianName?: string;
  technicianTitle?: string;
  technicianCertNumber?: string;
  technicianEmail?: string;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyLogo?: string;
  summary?: string;
  deviceSummaries: DeviceSummary[];
  deficiencies: Deficiency[];
  inspectionResults: InspectionResult[];
  missingLocationDeficiencies?: Array<{ id: number; description: string; severity: string }>;
}

// ─── Colours ────────────────────────────────────────────────────────────────
const navyBlue   = '#003366';
const white      = '#FFFFFF';
const black      = '#000000';
const grayText   = '#4a5568';
const lightGray  = '#e5e7eb';
const dangerColor = '#dc2626';
const warningColor = '#f59e0b';

/**
 * Draws the repeating page header for FirePro content pages.
 * Returns the Y position where body content should start.
 */
function drawFireProPageHeader(doc: any, data: ReportData): number {
  const margin = 50;
  const pageWidth = 612;
  const contentWidth = pageWidth - 2 * margin;

  drawLogo(doc, margin, margin, 100);

  const barX = 260;
  const barWidth = pageWidth - barX - margin;
  const barY = margin;

  doc.fontSize(8).font('Helvetica-Bold').fillColor(black)
     .text(data.siteName, barX, barY, { width: barWidth });

  doc.fontSize(7).font('Helvetica')
     .text(data.siteAddress, barX, barY + 14, { width: barWidth });

  // City / province / postal — avoid duplicating province if already in city string
  const cityParts: string[] = [];
  if (data.siteCity) cityParts.push(data.siteCity);
  if (data.siteState && !data.siteCity?.includes(data.siteState)) cityParts.push(data.siteState);
  doc.text(cityParts.filter(Boolean).join(', '), barX, barY + 28, { width: barWidth });

  doc.fontSize(7).font('Helvetica-Bold')
     .text(`Job #: ${data.jobNumber}`, barX, barY + 46, { width: barWidth, align: 'right' });
  doc.font('Helvetica')
     .text(data.inspectionDate.toLocaleDateString(), barX, barY + 58, { width: barWidth, align: 'right' });

  const separatorY = margin + 116;
  doc.moveTo(margin, separatorY).lineTo(margin + contentWidth, separatorY)
     .lineWidth(0.5).stroke('#cccccc');

  return separatorY + 8;
}

/**
 * Draw a professional EWF After Service Letter.
 * hasDeficiencies drives two variants: completion (0 defs) vs deficiency (>0 defs).
 */
function drawAfterServiceLetter(
  doc: any,
  data: ReportData,
  hasDeficiencies: boolean
): void {
  const margin = 50;
  const contentWidth = 512;
  const dateStr = data.inspectionDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  let y = drawFireProPageHeader(doc, data);

  // ── Date line ────────────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica').fillColor(black)
     .text(dateStr, margin, y);
  y += 22;

  // ── Recipient block ──────────────────────────────────────────────────────
  if (data.siteName) {
    doc.text(data.siteName.toUpperCase(), margin, y);
    y += 14;
  }
  if (data.customerName) {
    doc.text(data.customerName.toUpperCase(), margin, y);
    y += 14;
  }
  if (data.customerAddress) {
    doc.text(data.customerAddress, margin, y);
    y += 14;
  }
  if (data.customerCity) {
    // Build city line, deduplicating province
    const parts: string[] = [data.customerCity];
    if (data.customerState && !data.customerCity.includes(data.customerState)) {
      parts.push(data.customerState);
    }
    if (data.customerPostalCode) parts.push(data.customerPostalCode);
    doc.text(parts.join(', '), margin, y);
    y += 14;
  }
  if (data.attentionTo) {
    y += 4;
    doc.font('Helvetica-Bold').text(`ATTENTION: ${data.attentionTo.toUpperCase()}`, margin, y);
    doc.font('Helvetica');
    y += 14;
  }
  if (data.attentionEmail) {
    doc.text(`EMAIL: ${data.attentionEmail}`, margin, y);
    y += 14;
  }

  // ── RE line ──────────────────────────────────────────────────────────────
  y += 10;
  const reSubject = hasDeficiencies
    ? `Fire Protection Inspection — Deficiencies Identified`
    : `Fire Protection Inspection — No Deficiencies Found`;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(navyBlue)
     .text(`RE: ${reSubject}`, margin, y, { width: contentWidth });
  y += 14;
  doc.text(`${data.siteName} — ${data.siteAddress}`, margin, y, { width: contentWidth });
  y += 14;

  const jobLine = `Job #${data.jobNumber}  |  Service Date: ${dateStr}`;
  doc.text(jobLine, margin, y, { width: contentWidth });
  y += 18;

  // Thin rule below RE block
  doc.moveTo(margin, y).lineTo(margin + contentWidth, y)
     .lineWidth(0.5).stroke('#cccccc');
  y += 14;

  // ── Salutation ───────────────────────────────────────────────────────────
  const salutation = data.attentionTo ? `Dear ${data.attentionTo},` : 'Dear Property Manager,';
  doc.fontSize(10).font('Helvetica').fillColor(black)
     .text(salutation, margin, y, { width: contentWidth });
  y += 18;

  // ── Opening paragraph ────────────────────────────────────────────────────
  const techPhrase = data.technicianName
    ? `, ${data.technicianName},`
    : '';
  const openingPara =
    `On ${dateStr}, our certified technician${techPhrase} conducted the annual fire protection ` +
    `inspection at ${data.siteName}, located at ${data.siteAddress}, in accordance with the applicable ` +
    `standards including CAN/ULC S536:2019 and the BC Fire Code.`;
  doc.text(openingPara, margin, y, { width: contentWidth, lineGap: 3 });
  y = doc.y + 12;

  // ── Status paragraph ─────────────────────────────────────────────────────
  if (!hasDeficiencies) {
    const noPara =
      `We are pleased to report that all systems and devices inspected were found to be in satisfactory ` +
      `working order. No deficiencies were identified at the time of service. All required documentation ` +
      `has been completed and is available upon request.`;
    doc.text(noPara, margin, y, { width: contentWidth, lineGap: 3 });
    y = doc.y + 12;
  } else {
    const defCount = data.deficiencies.length;
    const defWord = defCount === 1 ? 'deficiency was' : 'deficiencies were';
    const defPara =
      `During our inspection, ${defCount} ${defWord} identified that require your attention. ` +
      `The full details, including corrective action recommendations and associated costs, are outlined ` +
      `in the enclosed Deficiency Report.`;
    doc.text(defPara, margin, y, { width: contentWidth, lineGap: 3 });
    y = doc.y + 12;

    // Severity summary
    const critCount = data.deficiencies.filter(d => d.severity === 'critical').length;
    const majCount  = data.deficiencies.filter(d => d.severity === 'major').length;
    const minCount  = data.deficiencies.filter(d => d.severity === 'minor').length;

    if (critCount + majCount + minCount > 0) {
      doc.text('Deficiency breakdown:', margin, y, { width: contentWidth });
      y = doc.y + 4;
      const sevRows = [
        { label: 'Critical', count: critCount, color: '#dc2626' },
        { label: 'Major',    count: majCount,  color: '#ea580c' },
        { label: 'Minor',    count: minCount,  color: '#ca8a04' },
      ].filter(r => r.count > 0);

      sevRows.forEach(row => {
        doc.fontSize(10).font('Helvetica').fillColor(row.color)
           .text(`  •  ${row.label}: ${row.count}`, margin, y, { width: contentWidth });
        y = doc.y + 2;
      });
      doc.fillColor(black);
      y += 10;
    }
  }

  // ── Systems inspected ────────────────────────────────────────────────────
  if (data.deviceSummaries.length > 0) {
    doc.fontSize(10).font('Helvetica').fillColor(black)
       .text('Systems and devices inspected during this service visit included:', margin, y, { width: contentWidth });
    y = doc.y + 6;

    data.deviceSummaries.forEach(ds => {
      const passRate = ds.total > 0 ? `${ds.passed} of ${ds.total} pass` : `${ds.total} inspected`;
      doc.text(`  •  ${ds.deviceType}: ${passRate}`, margin, y, { width: contentWidth });
      y = doc.y + 2;
    });
    y += 12;
  }

  // ── Call to action (deficiency variant) ──────────────────────────────────
  if (hasDeficiencies) {
    const ctaPara =
      `To authorize the corrective work, please sign and return the enclosed approval form. ` +
      `All quoted prices are valid for 30 days from the date of this letter. ` +
      `Please note that prompt attention to the identified deficiencies is important to maintain ` +
      `the safety and compliance of the fire protection systems at your property.`;
    doc.text(ctaPara, margin, y, { width: contentWidth, lineGap: 3 });
    y = doc.y + 12;
  }

  // ── Closing ───────────────────────────────────────────────────────────────
  doc.text(
    'If you have any questions or require additional information, please do not hesitate to contact us.',
    margin, y, { width: contentWidth, lineGap: 3 }
  );
  y = doc.y + 16;

  doc.text('Regards,', margin, y);
  y = doc.y + 14;

  doc.font('Helvetica-Bold').text(data.companyName, margin, y);
  y = doc.y + 20;

  doc.font('Helvetica-Oblique').fillColor(grayText);
  if (data.technicianName) {
    doc.text(data.technicianName, margin, y);
    y = doc.y + 12;
  }
  if (data.technicianTitle) {
    doc.text(data.technicianTitle, margin, y);
    y = doc.y + 12;
  }
  if (data.companyPhone) {
    doc.fillColor(black).font('Helvetica').text(data.companyPhone, margin, y);
    y = doc.y + 12;
  }
  if (data.technicianEmail || data.companyEmail) {
    doc.fillColor('#0000EE')
       .text(data.technicianEmail || data.companyEmail || '', margin, y);
  }
}

export function generateInspectionReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 70, left: 50, right: 50 },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const hasDeficiencies = data.deficiencies.length > 0;

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER
      // ══════════════════════════════════════════════════════════════════════
      drawEnhancedCoverPage(doc, {
        reportTitle: hasDeficiencies ? 'Deficiency Report' : 'Inspection Summary Report',
        propertyName: data.siteName,
        propertyAddress: data.siteAddress,
        propertyCity: data.siteCity,
        propertyPostalCode: undefined,
        inspectionDate: data.inspectionDate,
        companyName: data.companyName,
        companyPhone: data.companyPhone || '604-299-1030',
        companyEmail: data.companyEmail || 'info@ewf.ca',
      });

      // ══════════════════════════════════════════════════════════════════════
      // DEFICIENCY PACKAGE (>0 deficiencies)
      // ══════════════════════════════════════════════════════════════════════
      if (hasDeficiencies) {

        // ── PAGE 2: Executive Summary ───────────────────────────────────────
        doc.addPage();
        const execStartY = drawFireProPageHeader(doc, data);
        drawDeficiencySummaryPage(doc, data.deficiencies, execStartY);

        // ── PAGE 3: After Service Deficiency Letter ─────────────────────────
        doc.addPage();
        drawAfterServiceLetter(doc, data, true);

        // ── Warning banner (admin override / test mode) ─────────────────────
        if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
          doc.addPage();
          let warnY = drawFireProPageHeader(doc, data);
          const warnH = 40;
          doc.rect(50, warnY, 512, warnH).fillAndStroke(warningColor, warningColor);
          doc.fontSize(10).fillColor(white).font('Helvetica-Bold')
             .text('⚠ WARNING: TEST MODE REPORT', 60, warnY + 8);
          doc.fontSize(9).font('Helvetica')
             .text(
               `${data.missingLocationDeficiencies.length} deficiency/deficiencies missing location information. See appendix for details.`,
               60, warnY + 24, { width: 492, lineGap: 3 }
             );
          warnY += warnH + 10;
        }

        // ── PAGE 4+: Deficiency tables ──────────────────────────────────────
        doc.addPage();
        let defY = drawFireProPageHeader(doc, data);

        const deficienciesBySystem: Record<string, Array<typeof data.deficiencies[0]>> = {
          'Fire Alarm Deficiencies':        [],
          'Smoke Alarm Deficiencies':       [],
          'Fire Extinguisher Deficiencies': [],
          'Emergency Lighting Deficiencies':[],
          'Sprinkler Deficiencies':         [],
        };

        data.deficiencies.forEach((def) => {
          let cat = 'Fire Alarm Deficiencies';
          if (def.systemCategory) {
            const map: Record<string, string> = {
              FIRE_ALARM:         'Fire Alarm Deficiencies',
              SMOKE_ALARM:        'Smoke Alarm Deficiencies',
              FIRE_EXTINGUISHER:  'Fire Extinguisher Deficiencies',
              EMERGENCY_LIGHTING: 'Emergency Lighting Deficiencies',
              SPRINKLER:          'Sprinkler Deficiencies',
            };
            cat = map[def.systemCategory] || cat;
          } else {
            const t = (def.deviceType || '').toLowerCase();
            if (t.includes('smoke alarm'))  cat = 'Smoke Alarm Deficiencies';
            else if (t.includes('extinguisher')) cat = 'Fire Extinguisher Deficiencies';
            else if (t.includes('emergency') || t.includes('light')) cat = 'Emergency Lighting Deficiencies';
            else if (t.includes('sprinkler') || t.includes('fdc') || t.includes('standpipe')) cat = 'Sprinkler Deficiencies';
          }
          deficienciesBySystem[cat].push(def);
        });

        const subtotal = data.deficiencies.reduce(
          (sum, def) => sum + (typeof def.estimatedCost === 'string' ? parseFloat(def.estimatedCost) : (def.estimatedCost || 0)),
          0
        );
        const taxRate    = 0.12;
        const taxAmount  = subtotal * taxRate;
        const grandTotal = subtotal + taxAmount;

        const defColWidths = [40, 280, 100, 92];
        const defTableWidth = defColWidths.reduce((a, b) => a + b, 0);

        const drawDefTableHeader = (yPos: number): number => {
          doc.rect(50, yPos, defTableWidth, 20).fill(black);
          doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
          let dx = 55;
          doc.text('Item #', dx, yPos + 6);
          dx += defColWidths[0];
          doc.text('Description', dx, yPos + 6);
          dx += defColWidths[1];
          doc.text('Device', dx, yPos + 6);
          dx += defColWidths[2];
          doc.text('Total Labour & Material', dx, yPos + 6, { width: defColWidths[3] - 10 });
          return yPos + 20;
        };

        for (const [systemName, sysDefs] of Object.entries(deficienciesBySystem)) {
          if (sysDefs.length === 0) continue;

          if (defY > 680) {
            doc.addPage();
            defY = drawFireProPageHeader(doc, data);
          }

          doc.fontSize(14).fillColor(navyBlue).font('Helvetica-Bold')
             .text(systemName, 50, defY);
          defY += 25;

          defY = drawDefTableHeader(defY);

          doc.font('Helvetica').fontSize(8);

          sysDefs.forEach((def) => {
            if (defY > 680) {
              doc.addPage();
              defY = drawFireProPageHeader(doc, data);
              defY = drawDefTableHeader(defY);
            }

            const rowH = 40;
            doc.rect(50, defY, defTableWidth, rowH).stroke(lightGray);
            doc.fillColor(black).font('Helvetica').fontSize(8);
            let dx = 55;

            doc.text(def.id.toString(), dx, defY + 5, { width: defColWidths[0] - 10, align: 'center' });
            dx += defColWidths[0];

            let descText = def.description || def.title;
            descText = def.location
              ? `Location: ${def.location}. ${descText}`
              : `Location: TBD. ${descText}`;
            doc.text(descText, dx, defY + 5, { width: defColWidths[1] - 10, lineGap: 2 });
            dx += defColWidths[1];

            doc.text(def.deviceType || '-', dx, defY + 5, { width: defColWidths[2] - 10, lineGap: 2 });
            dx += defColWidths[2];

            const cost = typeof def.estimatedCost === 'string'
              ? parseFloat(def.estimatedCost)
              : (def.estimatedCost || 0);
            doc.text(`$${cost.toFixed(2)}`, dx, defY + 5, { width: defColWidths[3] - 10, align: 'right' });

            defY += rowH;
          });

          defY += 15;
        }

        // ── Pricing totals ──────────────────────────────────────────────────
        if (defY > 650) {
          doc.addPage();
          defY = drawFireProPageHeader(doc, data);
        }
        defY += 10;

        const tX  = 380;
        const tLW = 100;
        const tVW = 70;

        doc.fontSize(10).fillColor(black).font('Helvetica-Bold');
        doc.text('Subtotal:', tX, defY, { width: tLW, align: 'right' })
           .text(`$${subtotal.toFixed(2)}`, tX + tLW + 10, defY, { width: tVW, align: 'right' });
        defY += 20;

        doc.text(`Tax (${(taxRate * 100).toFixed(0)}%):`, tX, defY, { width: tLW, align: 'right' })
           .text(`$${taxAmount.toFixed(2)}`, tX + tLW + 10, defY, { width: tVW, align: 'right' });
        defY += 20;

        doc.moveTo(tX, defY - 5).lineTo(tX + tLW + tVW + 10, defY - 5).stroke(black);
        defY += 5;

        doc.fontSize(12)
           .text('Total:', tX, defY, { width: tLW, align: 'right' })
           .text(`$${grandTotal.toFixed(2)}`, tX + tLW + 10, defY, { width: tVW, align: 'right' });
        defY += 30;

        // ── Terms & Conditions ──────────────────────────────────────────────
        const terms = [
          `The proposed quote is valid for 30 days from the date of receipt of this report. Please be aware that, upon approval of the quoted materials, any cancellation will incur a 25% restocking fee.`,
          `Any proposal Scope of Work is based on the information provided in the initial quote. Work orders may be issued for additional costs once the bill is processed. Costs for engineering, permits, fees, drawings, aerial lift equipment, sub-trades, equipment or tool rentals, third-party verification, accommodations, meal allowances, and subcontractors will incur extra charges. Drywall repairs, fire-stopping, fire watch, pipe insulation, and painting are not included. There will be no attempts to access units for sprinkler head replacements.`,
          `GST and PST taxes will be applied to materials only, while GST will be applied to labour. Taxes are not included in the quoted price.`,
          `All quoted prices are based on work completed within regular business hours (8:00 AM – 4:30 PM). An environmental disposal fee of $7.00 per battery will be charged for each battery removed from the site. Travel time is included in the quoted costs if the majority of the repairs are approved simultaneously.`,
          `Please note that prices are based on a single trip. Additional trips required to complete repairs due to access issues may incur extra charges. No additional travel charges will apply for trips needed due to stocking issues.`,
          `A vehicle service charge of $88.00 will be applied.`,
        ];

        doc.fontSize(8).fillColor(grayText).font('Helvetica-Oblique');
        terms.forEach(term => {
          if (defY > 660) {
            doc.addPage();
            defY = drawFireProPageHeader(doc, data);
          }
          doc.text(term, 50, defY, { width: 512, align: 'justify', lineGap: 3 });
          defY = doc.y + 10;
        });

        // ── ASTTBC Signature Table ──────────────────────────────────────────
        if (data.technicianName) {
          if (defY > 560) {
            doc.addPage();
            defY = drawFireProPageHeader(doc, data);
          } else {
            defY += 20;
          }

          const pageCount = doc.bufferedPageRange().count;
          defY = drawSignatureTable(
            doc, defY, pageCount,
            data.technicianName,
            data.technicianCertNumber || '',
            data.inspectionDate,
            data.companyName,
            undefined, undefined,
            50, 512
          );
        }

        // ── Missing Locations Appendix ──────────────────────────────────────
        if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
          if (defY > 650) {
            doc.addPage();
            defY = drawFireProPageHeader(doc, data);
          } else {
            defY += 30;
          }

          doc.fontSize(16).fillColor(dangerColor).font('Helvetica-Bold')
             .text('APPENDIX: Missing Location Information', 50, defY);
          defY += 30;

          doc.fontSize(10).fillColor(black).font('Helvetica')
             .text(
               'The following deficiencies are missing location information and must be updated before final report submission:',
               50, defY, { width: 512, lineGap: 4 }
             );
          defY += 30;

          const appColWidths = [50, 350, 112];
          const appTableWidth = appColWidths.reduce((a, b) => a + b, 0);

          const drawAppHeader = (yPos: number): number => {
            doc.rect(50, yPos, appTableWidth, 20).fill(dangerColor);
            doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
            let ax = 55;
            doc.text('ID', ax, yPos + 6);
            ax += appColWidths[0];
            doc.text('Description', ax, yPos + 6);
            ax += appColWidths[1];
            doc.text('Severity', ax, yPos + 6);
            return yPos + 20;
          };

          defY = drawAppHeader(defY);

          doc.font('Helvetica').fontSize(8);
          data.missingLocationDeficiencies.forEach((def) => {
            if (defY > 680) {
              doc.addPage();
              defY = drawFireProPageHeader(doc, data);
              defY = drawAppHeader(defY);
            }
            const rowH = 30;
            doc.rect(50, defY, appTableWidth, rowH).stroke(lightGray);
            doc.fillColor(black).font('Helvetica').fontSize(8);
            let ax = 55;
            doc.text(def.id.toString(), ax, defY + 5, { width: appColWidths[0] - 10, lineGap: 2 });
            ax += appColWidths[0];
            doc.text(def.description, ax, defY + 5, { width: appColWidths[1] - 10, lineGap: 2 });
            ax += appColWidths[1];
            doc.text(def.severity.toUpperCase(), ax, defY + 5, { width: appColWidths[2] - 10, lineGap: 2 });
            defY += rowH;
          });
        }

      } else {
        // ══════════════════════════════════════════════════════════════════
        // NO-DEFICIENCY PACKAGE (0 deficiencies)
        // ══════════════════════════════════════════════════════════════════

        // ── PAGE 2: After Service Completion Letter ─────────────────────
        doc.addPage();
        drawAfterServiceLetter(doc, data, false);
      }

      // ══════════════════════════════════════════════════════════════════════
      // FOOTERS ON ALL PAGES
      // ══════════════════════════════════════════════════════════════════════
      const pages = doc.bufferedPageRange();
      const totalPages = pages.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);

        const footerY = 770;
        doc.fontSize(8).fillColor('#6b7280').font('Helvetica');

        doc.text(data.companyName, 50, footerY, { lineBreak: false });

        const pageText = `Page ${i + 1} of ${totalPages}`;
        const pageTextWidth = doc.widthOfString(pageText);
        doc.text(pageText, (612 - pageTextWidth) / 2, footerY, { lineBreak: false });

        const jobText = `JOB-${data.jobNumber}`;
        const jobTextWidth = doc.widthOfString(jobText);
        doc.text(jobText, 612 - 50 - jobTextWidth, footerY, { lineBreak: false });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
