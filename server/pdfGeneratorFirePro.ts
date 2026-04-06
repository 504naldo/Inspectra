import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  PDF_COLORS,
  PDF_FONTS,
  PDF_SIZES,
  drawLogo,
  drawEnhancedCoverPage,
  drawDeficiencySummaryPage,
  drawSignatureTable,
  drawInspectionSummaryPage,
  drawClientAuthorizationBlock,
  fetchImageBuffer,
  type SignatureOpts,
} from './pdfSharedStyles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────────

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
  estimatedCost?: string | null;
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

  // Signature capture (optional — populated after job completion)
  techSignatureUrl?: string;
  contactSignatureUrl?: string;
  contactName?: string;
  contactSignedAt?: Date;
}

// ─── Local constants ──────────────────────────────────────────────────────────
const NAVY      = '#003366';
const WHITE     = '#FFFFFF';
const BLACK     = '#000000';
const GRAY_TEXT = '#4a5568';
const LIGHT_GRAY = '#e5e7eb';
const DANGER    = '#dc2626';
const WARNING   = '#f59e0b';
const M         = 50;   // left/right margin
const CW        = 512;  // content width (612 - 2*50)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a Date to "Month D, YYYY" */
function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Builds a city/province/postal string without duplicating the province. */
function buildCityLine(city?: string, state?: string, postal?: string): string {
  const parts: string[] = [];
  if (city) parts.push(city);
  if (state && !city?.includes(state)) parts.push(state);
  if (postal) parts.push(postal);
  return parts.join(', ');
}

/**
 * Slim repeating page header used on all interior technical pages.
 * Returns the Y coordinate where body content may begin.
 */
function drawPageHeader(doc: any, data: ReportData): number {
  drawLogo(doc, M, M, 96);

  const barX = 258;
  const barW = 612 - barX - M;

  doc.fontSize(8).font('Helvetica-Bold').fillColor(BLACK)
     .text(data.siteName, barX, M, { width: barW });
  doc.fontSize(7).font('Helvetica')
     .text(data.siteAddress, barX, M + 14, { width: barW });
  doc.text(
    buildCityLine(data.siteCity, data.siteState),
    barX, M + 26, { width: barW }
  );
  doc.fontSize(7).font('Helvetica-Bold')
     .text(`Job #: ${data.jobNumber}`, barX, M + 44, { width: barW, align: 'right' });
  doc.font('Helvetica')
     .text(data.inspectionDate.toLocaleDateString(), barX, M + 55, { width: barW, align: 'right' });

  const sepY = M + 112;
  doc.moveTo(M, sepY).lineTo(M + CW, sepY).lineWidth(0.5).stroke('#cccccc');
  return sepY + 10;
}

/**
 * Full-width navy letterhead banner for letter pages.
 * Returns the Y coordinate below the banner where the letter body starts.
 */
function drawLetterheadBanner(doc: any, data: ReportData): number {
  const bannerH = 72;
  doc.rect(0, 0, 612, bannerH).fill(NAVY);

  // Logo — left side of banner
  drawLogo(doc, 22, 10, 130);

  // Company name + tagline — right side of banner
  const txtX = 380;
  const txtW = 612 - txtX - 20;
  doc.fontSize(13).font('Helvetica-Bold').fillColor(WHITE)
     .text(data.companyName, txtX, 18, { width: txtW, align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#93c5fd')
     .text('Fire Protection Services', txtX, 36, { width: txtW, align: 'right' });

  const contact = [data.companyPhone, data.companyEmail].filter(Boolean).join('  |  ');
  if (contact) {
    doc.fontSize(7).font('Helvetica').fillColor('#bfdbfe')
       .text(contact, txtX, 50, { width: txtW, align: 'right' });
  }

  // Thin accent stripe under banner
  doc.rect(0, bannerH, 612, 3).fill('#1d4ed8');

  return bannerH + 18;
}

/**
 * Draws the full After Service Letter (two variants: completion vs deficiency).
 * Uses drawLetterheadBanner for the top of the page.
 */
function drawAfterServiceLetter(doc: any, data: ReportData, hasDeficiencies: boolean): void {
  let y = drawLetterheadBanner(doc, data);

  // ── Date ─────────────────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica').fillColor(BLACK)
     .text(longDate(data.inspectionDate), M, y);
  y += 22;

  // ── Recipient block ───────────────────────────────────────────────────────
  const addLine = (text: string, bold = false) => {
    doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(BLACK)
       .text(text, M, y, { width: CW });
    y += 14;
  };

  if (data.siteName)       addLine(data.siteName.toUpperCase());
  if (data.customerName)   addLine(data.customerName.toUpperCase());
  if (data.customerAddress) addLine(data.customerAddress);
  const cityLine = buildCityLine(data.customerCity, data.customerState, data.customerPostalCode);
  if (cityLine) addLine(cityLine);

  if (data.attentionTo) {
    y += 4;
    addLine(`ATTENTION: ${data.attentionTo.toUpperCase()}`, true);
  }
  if (data.attentionEmail) addLine(`EMAIL: ${data.attentionEmail}`);

  // ── Horizontal rule ───────────────────────────────────────────────────────
  y += 8;
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).stroke('#cccccc');
  y += 12;

  // ── RE block ──────────────────────────────────────────────────────────────
  const reSubject = hasDeficiencies
    ? 'Fire Protection Inspection — Deficiencies Identified'
    : 'Fire Protection Inspection — No Deficiencies Found';

  doc.fontSize(10).font('Helvetica-Bold').fillColor(NAVY)
     .text(`RE:  ${reSubject}`, M, y, { width: CW });
  y = doc.y + 4;

  doc.fontSize(9).font('Helvetica').fillColor(GRAY_TEXT)
     .text(`${data.siteName}  —  ${data.siteAddress}`, M, y, { width: CW });
  y = doc.y + 3;

  doc.text(`Job #${data.jobNumber}   |   Service Date: ${longDate(data.inspectionDate)}`, M, y, { width: CW });
  y = doc.y + 14;

  // ── Salutation ────────────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica').fillColor(BLACK)
     .text(data.attentionTo ? `Dear ${data.attentionTo},` : 'Dear Property Manager,', M, y);
  y += 18;

  // ── Opening paragraph ─────────────────────────────────────────────────────
  const techRef = data.technicianName ? `, ${data.technicianName},` : '';
  doc.text(
    `On ${longDate(data.inspectionDate)}, our certified technician${techRef} conducted the annual ` +
    `fire protection inspection at ${data.siteName}, located at ${data.siteAddress}, in accordance ` +
    `with CAN/ULC S536:2019 and applicable BC Fire Code requirements.`,
    M, y, { width: CW, lineGap: 3 }
  );
  y = doc.y + 12;

  // ── Outcome paragraph ─────────────────────────────────────────────────────
  if (!hasDeficiencies) {
    doc.text(
      `We are pleased to report that all systems and devices inspected were found to be in satisfactory ` +
      `working order. No deficiencies were identified at the time of service. All required documentation ` +
      `has been completed and retained on file.`,
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 12;
  } else {
    const n = data.deficiencies.length;
    doc.text(
      `During our inspection, ${n} deficien${n === 1 ? 'cy was' : 'cies were'} identified that require ` +
      `corrective action. The full details, corrective action recommendations, and associated costs are ` +
      `outlined in the enclosed Deficiency Report.`,
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 10;

    // Severity pill summary
    const crit = data.deficiencies.filter(d => d.severity === 'critical').length;
    const maj  = data.deficiencies.filter(d => d.severity === 'major').length;
    const min  = data.deficiencies.filter(d => d.severity === 'minor').length;

    const pills: Array<{ label: string; color: string; bg: string }> = [];
    if (crit > 0) pills.push({ label: `${crit} Critical`, color: '#991b1b', bg: '#fee2e2' });
    if (maj  > 0) pills.push({ label: `${maj} Major`,    color: '#7c2d12', bg: '#ffedd5' });
    if (min  > 0) pills.push({ label: `${min} Minor`,    color: '#713f12', bg: '#fef9c3' });

    if (pills.length > 0) {
      let px = M;
      pills.forEach(p => {
        const pw = doc.widthOfString(p.label) + 14;
        doc.rect(px, y, pw, 16).fill(p.bg);
        doc.rect(px, y, pw, 16).lineWidth(0.5).stroke(p.color);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(p.color)
           .text(p.label, px + 7, y + 4);
        px += pw + 8;
      });
      y += 24;
    }
  }

  // ── Systems inspected ─────────────────────────────────────────────────────
  if (data.deviceSummaries.length > 0) {
    doc.fontSize(10).font('Helvetica').fillColor(BLACK)
       .text('Systems and devices included in this inspection:', M, y, { width: CW });
    y = doc.y + 6;

    data.deviceSummaries.forEach(ds => {
      const rate = ds.total > 0
        ? `${ds.passed}/${ds.total} pass${ds.failed > 0 ? `, ${ds.failed} fail` : ''}`
        : `${ds.total} inspected`;
      doc.fontSize(9).font('Helvetica').fillColor(GRAY_TEXT)
         .text(`•   ${ds.deviceType}: ${rate}`, M + 12, y, { width: CW - 12 });
      y = doc.y + 2;
    });
    y += 10;
  }

  // ── Deficiency-variant: authorization instruction ──────────────────────────
  if (hasDeficiencies) {
    doc.fontSize(10).font('Helvetica').fillColor(BLACK)
       .text(
         `To authorize the corrective work, please sign and return the enclosed authorization form. ` +
         `This quotation is valid for 30 days from the date of this letter. ` +
         `Verbal authorization is not accepted — a signed copy must be returned before work will be scheduled.`,
         M, y, { width: CW, lineGap: 3 }
       );
    y = doc.y + 12;
  }

  // ── Closing ───────────────────────────────────────────────────────────────
  doc.fontSize(10).font('Helvetica').fillColor(BLACK)
     .text(
       'If you have any questions or require additional information, please do not hesitate to contact our office.',
       M, y, { width: CW, lineGap: 3 }
     );
  y = doc.y + 16;

  doc.text('Sincerely,', M, y);
  y += 16;

  doc.font('Helvetica-Bold').text(data.companyName, M, y);
  y += 20;

  doc.font('Helvetica-Oblique').fillColor(GRAY_TEXT);
  if (data.technicianName) { doc.text(data.technicianName, M, y); y = doc.y + 2; }
  if (data.technicianTitle) { doc.text(data.technicianTitle, M, y); y = doc.y + 2; }
  doc.font('Helvetica').fillColor(BLACK);
  if (data.companyPhone) { doc.text(data.companyPhone, M, y); y = doc.y + 2; }
  if (data.technicianEmail || data.companyEmail) {
    doc.fillColor('#1d4ed8')
       .text(data.technicianEmail || data.companyEmail!, M, y);
  }

  // ── Disclaimer footer on letter page ─────────────────────────────────────
  const disclaimerY = 720;
  doc.moveTo(M, disclaimerY).lineTo(M + CW, disclaimerY).lineWidth(0.5).stroke('#cccccc');
  doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
     .text(
       'This letter is intended solely for the use of the addressee. Earth Wind & Fire Protection Services ' +
       'accepts no liability for any loss or damage arising from reliance on this document by any other party. ' +
       'All prices are in Canadian dollars and subject to applicable taxes.',
       M, disclaimerY + 6, { width: CW, lineGap: 2 }
     );
}

/** Draws the deficiency table header row and returns the new Y below it. */
function drawDefTableHeader(doc: any, y: number, colWidths: number[]): number {
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(M, y, tableW, 20).fill(BLACK);
  doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold');
  let dx = M + 5;
  ['#', 'Location & Description', 'System / Device', 'Cost'].forEach((h, i) => {
    doc.text(h, dx, y + 6, { width: colWidths[i] - 8, align: i === 3 ? 'right' : 'left' });
    dx += colWidths[i];
  });
  return y + 20;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateInspectionReportPDF(data: ReportData): Promise<Buffer> {
  // Pre-fetch signature images so the inner PDF callback stays synchronous
  const sigOpts: SignatureOpts = {};
  if (data.techSignatureUrl) {
    sigOpts.techSignatureBuffer = await fetchImageBuffer(data.techSignatureUrl);
  }
  if (data.contactSignatureUrl) {
    sigOpts.contactSignatureBuffer = await fetchImageBuffer(data.contactSignatureUrl);
    sigOpts.contactName = data.contactName;
    sigOpts.contactSignedAt = data.contactSignedAt;
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 70, left: 50, right: 50 },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const hasDeficiencies = data.deficiencies.length > 0;

      // ════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER
      // ════════════════════════════════════════════════════════════════════
      drawEnhancedCoverPage(doc, {
        reportTitle: hasDeficiencies ? 'Deficiency Report' : 'Inspection Summary Report',
        propertyName: data.siteName,
        propertyAddress: data.siteAddress,
        propertyCity: data.siteCity,
        inspectionDate: data.inspectionDate,
        companyName: data.companyName,
        companyPhone: data.companyPhone || '604-299-1030',
        companyEmail: data.companyEmail || 'info@ewf.ca',
      });

      // ════════════════════════════════════════════════════════════════════
      // PAGE 2 — INSPECTION SUMMARY (both packages)
      // ════════════════════════════════════════════════════════════════════
      doc.addPage();
      const summaryHeaderY = drawPageHeader(doc, data);
      drawInspectionSummaryPage(doc, {
        deviceSummaries: data.deviceSummaries,
        deficiencies: data.deficiencies,
        startY: summaryHeaderY,
        technicianName: data.technicianName,
        jobNumber: data.jobNumber,
        inspectionDate: data.inspectionDate,
      });

      // ════════════════════════════════════════════════════════════════════
      // DEFICIENCY PACKAGE (>0 deficiencies)
      // ════════════════════════════════════════════════════════════════════
      if (hasDeficiencies) {

        // ── PAGE 3: Executive Summary ───────────────────────────────────
        doc.addPage();
        const execY = drawPageHeader(doc, data);
        drawDeficiencySummaryPage(doc, data.deficiencies, execY);

        // ── PAGE 4: After Service Deficiency Letter ─────────────────────
        doc.addPage();
        drawAfterServiceLetter(doc, data, true);

        // ── PAGE 5+: Deficiency tables ──────────────────────────────────
        doc.addPage();
        let defY = drawPageHeader(doc, data);

        // Test-mode warning banner
        if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
          doc.rect(M, defY, CW, 36).fillAndStroke(WARNING, WARNING);
          doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
             .text('⚠  TEST MODE — Missing location data. See appendix.', M + 10, defY + 12);
          defY += 44;
        }

        // Group by system category
        const groups: Record<string, Deficiency[]> = {
          'Fire Alarm Deficiencies':         [],
          'Smoke Alarm Deficiencies':        [],
          'Fire Extinguisher Deficiencies':  [],
          'Emergency Lighting Deficiencies': [],
          'Sprinkler Deficiencies':          [],
        };
        const catMap: Record<string, string> = {
          FIRE_ALARM:         'Fire Alarm Deficiencies',
          SMOKE_ALARM:        'Smoke Alarm Deficiencies',
          FIRE_EXTINGUISHER:  'Fire Extinguisher Deficiencies',
          EMERGENCY_LIGHTING: 'Emergency Lighting Deficiencies',
          SPRINKLER:          'Sprinkler Deficiencies',
        };

        data.deficiencies.forEach(def => {
          let cat = 'Fire Alarm Deficiencies';
          if (def.systemCategory) {
            cat = catMap[def.systemCategory] || cat;
          } else {
            const t = (def.deviceType || '').toLowerCase();
            if (t.includes('smoke alarm'))               cat = 'Smoke Alarm Deficiencies';
            else if (t.includes('extinguisher'))         cat = 'Fire Extinguisher Deficiencies';
            else if (t.includes('emergency') || t.includes('light')) cat = 'Emergency Lighting Deficiencies';
            else if (t.includes('sprinkler') || t.includes('fdc') || t.includes('standpipe')) cat = 'Sprinkler Deficiencies';
          }
          groups[cat].push(def);
        });

        const colW = [32, 276, 112, 92];
        const tableW = colW.reduce((a, b) => a + b, 0);

        for (const [groupName, defs] of Object.entries(groups)) {
          if (defs.length === 0) continue;

          if (defY > 680) { doc.addPage(); defY = drawPageHeader(doc, data); }

          // Group title
          doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY)
             .text(groupName, M, defY);
          defY += 22;

          defY = drawDefTableHeader(doc, defY, colW);
          doc.font('Helvetica').fontSize(8).fillColor(BLACK);

          defs.forEach((def, i) => {
            if (defY > 680) {
              doc.addPage();
              defY = drawPageHeader(doc, data);
              defY = drawDefTableHeader(doc, defY, colW);
            }

            const rowH = 40;
            const bg = i % 2 === 0 ? WHITE : '#f9fafb';
            doc.rect(M, defY, tableW, rowH).fill(bg);
            doc.rect(M, defY, tableW, rowH).lineWidth(0.4).stroke(LIGHT_GRAY);

            // Severity colour stripe on left edge
            const sevColor = def.severity === 'critical' ? DANGER
              : def.severity === 'major' ? '#ea580c' : '#ca8a04';
            doc.rect(M, defY, 3, rowH).fill(sevColor);

            doc.fillColor(BLACK).fontSize(8).font('Helvetica');
            let dx = M + 5;

            doc.text(def.id.toString(), dx, defY + 5, { width: colW[0] - 8, align: 'center' });
            dx += colW[0];

            const desc = def.location
              ? `${def.location}. ${def.description || def.title}`
              : `Location: TBD. ${def.description || def.title}`;
            doc.text(desc, dx, defY + 5, { width: colW[1] - 8, lineGap: 2 });
            dx += colW[1];

            doc.text(def.deviceType || '—', dx, defY + 5, { width: colW[2] - 8, lineGap: 2 });
            dx += colW[2];

            const cost = typeof def.estimatedCost === 'string'
              ? parseFloat(def.estimatedCost)
              : (def.estimatedCost || 0);
            doc.text(`$${cost.toFixed(2)}`, dx, defY + 5, { width: colW[3] - 8, align: 'right' });

            defY += rowH;
          });

          defY += 12;
        }

        // ── Pricing totals ───────────────────────────────────────────────
        if (defY > 640) { doc.addPage(); defY = drawPageHeader(doc, data); }
        defY += 8;

        const subtotal   = data.deficiencies.reduce((s, d) =>
          s + (typeof d.estimatedCost === 'string' ? parseFloat(d.estimatedCost) : (d.estimatedCost || 0)), 0);
        const tax        = subtotal * 0.12;
        const grandTotal = subtotal + tax;

        const tX  = M + CW - 200;
        const tLW = 120;
        const tVW = 80;

        const drawTotalRow = (label: string, value: string, bold = false) => {
          doc.fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(BLACK)
             .text(label, tX, defY, { width: tLW, align: 'right' });
          doc.text(value, tX + tLW, defY, { width: tVW, align: 'right' });
          defY += 18;
        };

        drawTotalRow('Subtotal:', `$${subtotal.toFixed(2)}`);
        drawTotalRow('GST + PST (12%):', `$${tax.toFixed(2)}`);
        doc.moveTo(tX, defY - 3).lineTo(tX + tLW + tVW, defY - 3).lineWidth(0.5).stroke(BLACK);
        defY += 4;
        drawTotalRow('Total:', `$${grandTotal.toFixed(2)}`, true);
        defY += 10;

        // ── Terms & Conditions ───────────────────────────────────────────
        if (defY > 660) { doc.addPage(); defY = drawPageHeader(doc, data); }

        doc.rect(M, defY, CW, 22).fill('#f1f5f9');
        doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY)
           .text('Terms & Conditions', M + 10, defY + 7);
        defY += 28;

        const terms = [
          'The proposed quotation is valid for 30 days from the date of receipt of this report. Cancellation after approval of materials will incur a 25% restocking fee.',
          'Scope of work is based on information in this report. Additional costs for permits, engineering, drawings, aerial lift, sub-trades, rentals, accommodations, and subcontractors will be charged separately. Drywall, fire-stopping, painting, and pipe insulation are excluded.',
          'GST and PST apply to materials only; GST applies to labour. Taxes are not included in quoted prices.',
          'All prices are based on regular business hours (8:00 AM – 4:30 PM). An environmental disposal fee of $7.00/battery applies to all batteries removed. Travel time is included if the majority of repairs are approved simultaneously.',
          'Prices are based on a single mobilization. Additional trips due to access issues may be charged extra. No travel surcharge for return trips caused by stocking issues.',
          'A vehicle service charge of $88.00 will be applied.',
        ];

        doc.fontSize(8).font('Helvetica').fillColor(GRAY_TEXT);
        terms.forEach(term => {
          if (defY > 660) { doc.addPage(); defY = drawPageHeader(doc, data); }
          doc.text(`•  ${term}`, M, defY, { width: CW, lineGap: 3 });
          defY = doc.y + 8;
        });

        // ── Client Authorization Block ───────────────────────────────────
        if (defY > 580) { doc.addPage(); defY = drawPageHeader(doc, data); } else { defY += 14; }
        defY = drawClientAuthorizationBlock(doc, defY, data.companyName, data.inspectionDate, M, CW);

        // ── ASTTBC Signature ─────────────────────────────────────────────
        if (data.technicianName) {
          if (defY > 560) { doc.addPage(); defY = drawPageHeader(doc, data); } else { defY += 20; }
          defY = drawSignatureTable(
            doc, defY, doc.bufferedPageRange().count,
            data.technicianName, data.technicianCertNumber || '',
            data.inspectionDate, data.companyName,
            undefined, undefined, M, CW,
            sigOpts
          );
        }

        // ── Missing Locations Appendix ───────────────────────────────────
        if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
          if (defY > 640) { doc.addPage(); defY = drawPageHeader(doc, data); } else { defY += 30; }

          doc.fontSize(14).font('Helvetica-Bold').fillColor(DANGER)
             .text('APPENDIX: Missing Location Information', M, defY);
          defY += 28;
          doc.fontSize(9).font('Helvetica').fillColor(BLACK)
             .text(
               'The following deficiencies are missing location data and must be resolved before final submission:',
               M, defY, { width: CW, lineGap: 3 }
             );
          defY += 24;

          const appColW = [46, 348, 118];
          const appW    = appColW.reduce((a, b) => a + b, 0);

          const drawAppHeader = (y: number): number => {
            doc.rect(M, y, appW, 20).fill(DANGER);
            doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold');
            let ax = M + 5;
            ['ID', 'Description', 'Severity'].forEach((h, i) => {
              doc.text(h, ax, y + 6, { width: appColW[i] - 8 });
              ax += appColW[i];
            });
            return y + 20;
          };

          defY = drawAppHeader(defY);
          doc.font('Helvetica').fontSize(8).fillColor(BLACK);

          data.missingLocationDeficiencies.forEach(def => {
            if (defY > 680) { doc.addPage(); defY = drawPageHeader(doc, data); defY = drawAppHeader(defY); }
            const rh = 28;
            doc.rect(M, defY, appW, rh).lineWidth(0.4).stroke(LIGHT_GRAY);
            let ax = M + 5;
            doc.text(def.id.toString(), ax, defY + 6, { width: appColW[0] - 8 });
            ax += appColW[0];
            doc.text(def.description, ax, defY + 6, { width: appColW[1] - 8 });
            ax += appColW[1];
            doc.text(def.severity.toUpperCase(), ax, defY + 6, { width: appColW[2] - 8 });
            defY += rh;
          });
        }

      } else {
        // ════════════════════════════════════════════════════════════════
        // NO-DEFICIENCY PACKAGE — PAGE 3: Completion Letter
        // ════════════════════════════════════════════════════════════════
        doc.addPage();
        drawAfterServiceLetter(doc, data, false);
      }

      // ════════════════════════════════════════════════════════════════════
      // FOOTERS on every page
      // ════════════════════════════════════════════════════════════════════
      const total = doc.bufferedPageRange().count;
      for (let i = 0; i < total; i++) {
        doc.switchToPage(i);

        // Rule
        doc.moveTo(M, 758).lineTo(M + CW, 758).lineWidth(0.5).stroke('#d1d5db');

        // Left: company name
        doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
           .text(data.companyName, M, 764, { lineBreak: false });

        // Centre: page number
        const pg = `Page ${i + 1} of ${total}`;
        doc.text(pg, 0, 764, { width: 612, align: 'center', lineBreak: false });

        // Right: job number
        const jt = `JOB-${data.jobNumber}`;
        const jtW = doc.widthOfString(jt);
        doc.text(jt, 612 - M - jtW, 764, { lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
