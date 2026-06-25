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
  drawCheckbox,
  drawEnhancedCoverPage,
  drawDeficiencySummaryPage,
  drawAiExecutiveSummaryPage,
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
  photos?: Array<{ buffer: Buffer; caption?: string | null; locationNote?: string | null }>;
}

interface InspectionResult {
  deviceId: number;
  deviceType: string;
  location?: string | null;
  serialNumber?: string | null;
  result: string;
  notes?: string | null;
}

interface FireAlarmChecklistItem {
  id: number;
  sectionName: string;
  sectionOrder: number;
  itemLetter: string;
  itemDescription: string;
  inputType: string;
  numericLabel?: string | null;
  numericUnit?: string | null;
  result: 'pass' | 'fail' | 'na' | 'not_tested';
  numericValue?: string | null;
  textValue?: string | null;
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

  // Fire Alarm CAN/ULC-S536 checklist (optional — only for fire alarm jobs with results)
  fireAlarmChecklist?: FireAlarmChecklistItem[];

  // Fire alarm system details (for compliance cert block)
  fireAlarmSystem?: {
    operationType?: 'single_stage' | 'two_stage' | 'other';
    connectedToMonitoring?: boolean;
    monitoringCentreName?: string;
    manufacturer?: string;
    modelNumber?: string;
  };

  // Controls whether the fire alarm checklist section is rendered.
  // Set to true only for report types that include the CAN/ULC-S536 checklist.
  // Deficiency reports must set this to false (or omit it) to suppress the section.
  includeFireAlarmChecklist?: boolean;

  // Inspection Template checklist sections (optional — only when template responses exist)
  templateChecklistSections?: TemplatePdfSection[];

  // Branding — sourced from company settings (optional; falls back to disk logo / generic footer)
  companyLogoBuffer?: Buffer;
  reportFooterText?: string;

  // Tax rates — sourced from company settings (decimal strings, e.g. "0.0500" for 5%).
  // Falls back to the BC default (5% GST + 7% PST) when not provided.
  gstRate?: string | number | null;
  pstRate?: string | number | null;
}

// ─── Template checklist types ─────────────────────────────────────────────────

interface TemplatePdfItem {
  itemCode?: string | null;
  questionText: string;
  responseValue?: string | null;
  responseText?: string | null;
  notes?: string | null;
  codeReference?: string | null;
  isRequired: boolean;
  deficiencyId?: number | null;
}

interface TemplatePdfSection {
  templateName: string;
  systemType: string;
  completionPercent: number;
  totalItems: number;
  answeredItems: number;
  passCount: number;
  failCount: number;
  naCount: number;
  unansweredRequiredItems: number;
  sections: Array<{
    sectionTitle: string;
    items: TemplatePdfItem[];
  }>;
}

// ─── Local constants ──────────────────────────────────────────────────────────
const NAVY      = PDF_COLORS.brandNavy; // unified with shared brand color
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
  drawLogo(doc, M, M, 96, data.companyLogoBuffer);

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
  drawLogo(doc, 22, 10, 130, data.companyLogoBuffer);

  // Company name — right side of banner
  const txtX = 380;
  const txtW = 612 - txtX - 20;
  doc.fontSize(13).font('Helvetica-Bold').fillColor(WHITE)
     .text(data.companyName, txtX, 26, { width: txtW, align: 'right' });

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
       `This letter is intended solely for the use of the addressee. ${data.companyName} ` +
       'accepts no liability for any loss or damage arising from reliance on this document by any other party. ' +
       'All prices are in Canadian dollars and subject to applicable taxes.',
       M, disclaimerY + 6, { width: CW, lineGap: 2 }
     );
}

/** Returns display text and colour for a fire alarm checklist result value. */
function faResultDisplay(result: string): { text: string; color: string } {
  switch (result) {
    case 'pass':       return { text: 'PASS', color: '#16a34a' };
    case 'fail':       return { text: 'FAIL', color: DANGER };
    case 'na':         return { text: 'N/A',  color: GRAY_TEXT };
    default:           return { text: '—',    color: '#9ca3af' };
  }
}

/**
 * Renders the CAN/ULC-S536 fire alarm inspection checklist onto the PDF.
 * Starts at startY on the current page; adds new pages as needed.
 */
function drawFireAlarmChecklistSection(doc: any, data: ReportData, startY: number): void {
  const items = data.fireAlarmChecklist;
  if (!items || items.length === 0) return;

  let y = startY;

  // Page-section title
  doc.fontSize(13).font('Helvetica-Bold').fillColor(NAVY)
     .text('Fire Alarm Inspection Checklist  —  CAN/ULC-S536', M, y);
  y += 6;
  doc.moveTo(M, y + 8).lineTo(M + CW, y + 8).lineWidth(0.5).stroke(NAVY);
  y += 20;

  // Column widths: letter | description | result | value/notes
  const colW = [28, 292, 68, 124]; // total = 512

  /** Draws the grey column-header row and returns new Y below it. */
  const drawColHeader = (headerY: number): number => {
    doc.rect(M, headerY, CW, 16).fill('#374151');
    doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold');
    let dx = M + 4;
    ['#', 'Inspection Item', 'Result', 'Value / Notes'].forEach((h, i) => {
      doc.text(h, dx, headerY + 4, { width: colW[i] - 6, lineBreak: false,
        align: i === 2 ? 'center' : 'left' });
      dx += colW[i];
    });
    return headerY + 16;
  };

  // Group items by section, preserving sectionOrder sort
  const sectionMap = new Map<string, { order: number; items: FireAlarmChecklistItem[] }>();
  for (const item of items) {
    if (!sectionMap.has(item.sectionName)) {
      sectionMap.set(item.sectionName, { order: item.sectionOrder, items: [] });
    }
    sectionMap.get(item.sectionName)!.items.push(item);
  }
  const sections = Array.from(sectionMap.entries()).sort((a, b) => a[1].order - b[1].order);

  for (const [sectionName, { items: sectionItems }] of sections) {
    // Ensure enough room for the section header + col header + at least one row
    if (y + 54 > 720) {
      doc.addPage();
      y = drawPageHeader(doc, data);
    }

    // Navy section header bar
    doc.rect(M, y, CW, 20).fill(NAVY);
    doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold')
       .text(sectionName, M + 8, y + 6, { width: CW - 12, lineBreak: false });
    y += 20;

    // Column headers
    y = drawColHeader(y);

    sectionItems.forEach((item: FireAlarmChecklistItem, rowIdx: number) => {
      const rowH = 18;

      if (y + rowH > 720) {
        doc.addPage();
        y = drawPageHeader(doc, data);
        // Continuation header
        doc.rect(M, y, CW, 20).fill(NAVY);
        doc.fillColor(WHITE).fontSize(8.5).font('Helvetica-Bold')
           .text(`${sectionName}  (cont.)`, M + 8, y + 6, { width: CW - 12, lineBreak: false });
        y += 20;
        y = drawColHeader(y);
      }

      const bg = rowIdx % 2 === 0 ? WHITE : '#f9fafb';
      doc.rect(M, y, CW, rowH).fill(bg);
      doc.rect(M, y, CW, rowH).lineWidth(0.3).stroke(LIGHT_GRAY);

      let dx = M + 4;

      // Column 1 — letter
      doc.fillColor(GRAY_TEXT).fontSize(7.5).font('Helvetica')
         .text(item.itemLetter, dx, y + 5, { width: colW[0] - 6, lineBreak: false });
      dx += colW[0];

      // Column 2 — description
      doc.fillColor(BLACK).fontSize(7.5).font('Helvetica')
         .text(item.itemDescription, dx, y + 5, { width: colW[1] - 6, lineBreak: false });
      dx += colW[1];

      // Column 3 — result
      const { text: resText, color: resColor } = faResultDisplay(item.result);
      doc.fillColor(resColor).fontSize(7.5).font('Helvetica-Bold')
         .text(resText, dx, y + 5, { width: colW[2] - 6, align: 'center', lineBreak: false });
      dx += colW[2];

      // Column 4 — value / notes
      const valueStr = item.numericValue ?? item.textValue ?? item.notes ?? '';
      if (valueStr) {
        doc.fillColor(GRAY_TEXT).fontSize(7).font('Helvetica')
           .text(valueStr, dx, y + 5, { width: colW[3] - 6, lineBreak: false });
      }

      y += rowH;
    });

    y += 10; // gap between sections
  }
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

// ─── Template checklist section ───────────────────────────────────────────────

const RESP_COLORS: Record<string, string> = {
  pass: '#16a34a', yes: '#16a34a', checked: '#16a34a',
  fail: '#dc2626', no: '#dc2626',
  na: '#6b7280',
};

function responseLabel(value: string | null | undefined): { text: string; color: string } {
  if (!value) return { text: '—', color: '#9ca3af' };
  const v = value.toLowerCase();
  return {
    text: v === 'pass' ? 'PASS'
        : v === 'fail' ? 'FAIL'
        : v === 'yes' ? 'YES'
        : v === 'no' ? 'NO'
        : v === 'na' ? 'N/A'
        : v === 'checked' ? '✓'
        : value.toUpperCase(),
    color: RESP_COLORS[v] ?? '#374151',
  };
}

function drawTemplateChecklistSection(
  doc: any,
  section: TemplatePdfSection,
  getHeaderY: () => number,
): void {
  const RESP_COL = 72;
  const CODE_COL = 90;
  const ITEM_COL = CW - RESP_COL - CODE_COL;
  const ROW_H = 22;
  const MIN_Y_FOR_NEW_ROW = 730;

  let y = getHeaderY();

  // ── Section title ──────────────────────────────────────────────────────────
  doc.rect(M, y, CW, 18).fill(NAVY);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(WHITE)
     .text('Inspection Checklist', M + 6, y + 4, { lineBreak: false });
  doc.text(section.templateName, M + 130, y + 4, { width: CW - 136, align: 'right', lineBreak: false });
  y += 22;

  // ── Summary bar ───────────────────────────────────────────────────────────
  const summaryItems = [
    `${section.completionPercent}% complete`,
    `${section.answeredItems}/${section.totalItems} answered`,
    `Pass: ${section.passCount}`,
    `Fail: ${section.failCount}`,
    `N/A: ${section.naCount}`,
  ];
  if (section.unansweredRequiredItems > 0) {
    summaryItems.push(`⚠ ${section.unansweredRequiredItems} required unanswered`);
  }

  doc.rect(M, y, CW, 16).fill('#f3f4f6');
  doc.fontSize(7.5).font('Helvetica').fillColor('#374151')
     .text(summaryItems.join('   |   '), M + 6, y + 4, { width: CW - 12, lineBreak: false });
  y += 20;

  // ── Column headers ────────────────────────────────────────────────────────
  doc.rect(M, y, ITEM_COL, 14).fill('#374151');
  doc.rect(M + ITEM_COL, y, CODE_COL, 14).fill('#374151');
  doc.rect(M + ITEM_COL + CODE_COL, y, RESP_COL, 14).fill('#374151');
  doc.fontSize(7).font('Helvetica-Bold').fillColor(WHITE);
  doc.text('Inspection Item', M + 4, y + 3, { width: ITEM_COL - 6, lineBreak: false });
  doc.text('Reference', M + ITEM_COL + 4, y + 3, { width: CODE_COL - 6, lineBreak: false });
  doc.text('Response', M + ITEM_COL + CODE_COL + 4, y + 3, { width: RESP_COL - 6, lineBreak: false });
  y += 14;

  for (const sec of section.sections) {
    // Add page break if near bottom
    if (y > MIN_Y_FOR_NEW_ROW - 20) {
      doc.addPage();
      y = getHeaderY();
      // Repeat column headers on new page
      doc.rect(M, y, ITEM_COL, 14).fill('#374151');
      doc.rect(M + ITEM_COL, y, CODE_COL, 14).fill('#374151');
      doc.rect(M + ITEM_COL + CODE_COL, y, RESP_COL, 14).fill('#374151');
      doc.fontSize(7).font('Helvetica-Bold').fillColor(WHITE);
      doc.text('Inspection Item (cont.)', M + 4, y + 3, { width: ITEM_COL - 6, lineBreak: false });
      doc.text('Reference', M + ITEM_COL + 4, y + 3, { width: CODE_COL - 6, lineBreak: false });
      doc.text('Response', M + ITEM_COL + CODE_COL + 4, y + 3, { width: RESP_COL - 6, lineBreak: false });
      y += 14;
    }

    // Section sub-header
    doc.rect(M, y, CW, 13).fill('#e5e7eb');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#111827')
       .text(sec.sectionTitle, M + 4, y + 3, { width: CW - 8, lineBreak: false });
    y += 13;

    sec.items.forEach((item, idx) => {
      if (y > MIN_Y_FOR_NEW_ROW) {
        doc.addPage();
        y = getHeaderY();
        doc.rect(M, y, ITEM_COL, 14).fill('#374151');
        doc.rect(M + ITEM_COL, y, CODE_COL, 14).fill('#374151');
        doc.rect(M + ITEM_COL + CODE_COL, y, RESP_COL, 14).fill('#374151');
        doc.fontSize(7).font('Helvetica-Bold').fillColor(WHITE);
        doc.text('Inspection Item (cont.)', M + 4, y + 3, { lineBreak: false });
        doc.text('Reference', M + ITEM_COL + 4, y + 3, { lineBreak: false });
        doc.text('Response', M + ITEM_COL + CODE_COL + 4, y + 3, { lineBreak: false });
        y += 14;
      }

      const bg = idx % 2 === 0 ? WHITE : '#f9fafb';
      const { text: respText, color: respColor } = responseLabel(item.responseValue ?? item.responseText);
      const isFail = (item.responseValue ?? '').toLowerCase() === 'fail' ||
                     (item.responseValue ?? '').toLowerCase() === 'no';
      const isMissing = !item.responseValue && !item.responseText;

      // Row background — highlight failures and missing required
      if (isFail) {
        doc.rect(M, y, CW, ROW_H).fill('#fff1f2');
      } else if (isMissing && item.isRequired) {
        doc.rect(M, y, CW, ROW_H).fill('#fffbeb');
      } else {
        doc.rect(M, y, CW, ROW_H).fill(bg);
      }

      // Borders
      doc.rect(M, y, ITEM_COL, ROW_H).lineWidth(0.2).stroke('#e5e7eb');
      doc.rect(M + ITEM_COL, y, CODE_COL, ROW_H).lineWidth(0.2).stroke('#e5e7eb');
      doc.rect(M + ITEM_COL + CODE_COL, y, RESP_COL, ROW_H).lineWidth(0.2).stroke('#e5e7eb');

      // Item code + question
      const code = item.itemCode ? `${item.itemCode} ` : '';
      doc.fontSize(7).font('Helvetica').fillColor(isMissing && item.isRequired ? '#92400e' : '#111827')
         .text(`${code}${item.questionText}`, M + 4, y + 4, {
           width: ITEM_COL - 8,
           height: ROW_H - 6,
           lineBreak: true,
           ellipsis: true,
         });

      // Deficiency reference (small, below question)
      if (item.deficiencyId) {
        doc.fontSize(6).font('Helvetica').fillColor('#6b7280')
           .text(`↳ Def #${item.deficiencyId}`, M + 4, y + ROW_H - 8, { lineBreak: false });
      }

      // Code reference
      doc.fontSize(6.5).font('Helvetica').fillColor('#6b7280')
         .text(item.codeReference ?? '', M + ITEM_COL + 4, y + 4, {
           width: CODE_COL - 8,
           height: ROW_H - 6,
           lineBreak: true,
           ellipsis: true,
         });

      // Response value
      doc.fontSize(8).font('Helvetica-Bold').fillColor(respColor)
         .text(respText, M + ITEM_COL + CODE_COL + 4, y + 6, {
           width: RESP_COL - 8,
           align: 'center',
           lineBreak: false,
         });

      y += ROW_H;
    });
  }

  // Bottom padding
  y += 8;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateInspectionReportPDF(data: ReportData): Promise<Buffer> {
  // Pre-fetch signature images so the inner PDF callback stays synchronous
  const sigOpts: SignatureOpts = {};
  if (data.techSignatureUrl) {
    sigOpts.techSignatureBuffer = await fetchImageBuffer(data.techSignatureUrl);
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
        companyPhone: data.companyPhone,
        companyEmail: data.companyEmail,
        logoBuffer: data.companyLogoBuffer,
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
      // AI EXECUTIVE SUMMARY NARRATIVE (optional for all report types)
      // ════════════════════════════════════════════════════════════════════
      if (data.summary && data.summary.trim().length > 0) {
        doc.addPage();
        const aiSummaryY = drawPageHeader(doc, data);
        drawAiExecutiveSummaryPage(doc, data.summary, aiSummaryY, {
          maxY: 700,
          onPageBreak: () => {
            doc.addPage();
            return drawPageHeader(doc, data);
          },
        });
      }

      // ════════════════════════════════════════════════════════════════════
      // FIRE ALARM CHECKLIST (CAN/ULC-S536) — only in reports that opt in
      // ════════════════════════════════════════════════════════════════════
      if (data.includeFireAlarmChecklist === true && data.fireAlarmChecklist && data.fireAlarmChecklist.length > 0) {
        doc.addPage();
        const faHeaderY = drawPageHeader(doc, data);
        drawFireAlarmChecklistSection(doc, data, faHeaderY);
      }

      // ════════════════════════════════════════════════════════════════════
      // INSPECTION TEMPLATE CHECKLIST — one page per template if responses exist
      // ════════════════════════════════════════════════════════════════════
      if (data.templateChecklistSections && data.templateChecklistSections.length > 0) {
        for (const tmplSection of data.templateChecklistSections) {
          doc.addPage();
          drawTemplateChecklistSection(doc, tmplSection, () => drawPageHeader(doc, data));
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // DEFICIENCY PACKAGE (>0 deficiencies)
      // ════════════════════════════════════════════════════════════════════
      if (hasDeficiencies) {

        // ── PAGE 3: Executive Summary ───────────────────────────────────
        doc.addPage();
        const execY = drawPageHeader(doc, data);
        drawDeficiencySummaryPage(doc, data.deficiencies, execY);

        // ── After Service Deficiency Letter ──────────────────────────────
        doc.addPage();
        drawAfterServiceLetter(doc, data, true);

        // ── Deficiency tables ────────────────────────────────────────────
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

          if (defY > 660) { doc.addPage(); defY = drawPageHeader(doc, data); }

          // Group title
          doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY)
             .text(groupName, M, defY);
          defY += 22;

          defY = drawDefTableHeader(doc, defY, colW);
          doc.font('Helvetica').fontSize(8).fillColor(BLACK);

          defs.forEach((def, i) => {
            const rowH = 54;
            if (defY + rowH > 700) {
              doc.addPage();
              defY = drawPageHeader(doc, data);
              defY = drawDefTableHeader(doc, defY, colW);
            }

            const bg = i % 2 === 0 ? WHITE : '#f9fafb';
            doc.rect(M, defY, tableW, rowH).fill(bg);
            doc.rect(M, defY, tableW, rowH).lineWidth(0.4).stroke(LIGHT_GRAY);

            // Severity colour stripe on left edge
            const sevColor = def.severity === 'critical' ? DANGER
              : def.severity === 'major' ? '#ea580c' : '#ca8a04';
            doc.rect(M, defY, 4, rowH).fill(sevColor);

            let dx = M + 5;

            // Col 0 — id number + severity badge
            doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold')
               .text(def.id.toString(), dx, defY + 8, { width: colW[0] - 8, align: 'center', lineBreak: false });
            doc.fillColor(sevColor).fontSize(6).font('Helvetica-Bold')
               .text(def.severity.toUpperCase(), dx, defY + 23, { width: colW[0] - 8, align: 'center', lineBreak: false });
            dx += colW[0];

            // Col 1 — location + description (line 1), corrective action (line 2)
            const desc = def.location
              ? `${def.location}. ${def.description || def.title}`
              : `Location: TBD. ${def.description || def.title}`;
            doc.fillColor(BLACK).fontSize(8).font('Helvetica')
               .text(desc, dx, defY + 5, { width: colW[1] - 8, height: 24, lineGap: 2, ellipsis: true });
            if (def.correctiveAction) {
              doc.fillColor('#6b7280').fontSize(7).font('Helvetica-Oblique')
                 .text(`→ ${def.correctiveAction}`, dx, defY + 33, {
                   width: colW[1] - 8, height: 14, lineBreak: false, ellipsis: true,
                 });
            }
            dx += colW[1];

            // Col 2 — system / device type
            doc.fillColor(BLACK).fontSize(8).font('Helvetica')
               .text(def.deviceType || '—', dx, defY + 5, { width: colW[2] - 8, height: 24, lineGap: 2, ellipsis: true });
            dx += colW[2];

            // Col 3 — estimated cost
            const cost = typeof def.estimatedCost === 'string'
              ? parseFloat(def.estimatedCost)
              : (def.estimatedCost || 0);
            doc.fillColor(BLACK).fontSize(8).font('Helvetica')
               .text(`$${cost.toFixed(2)}`, dx, defY + 5, { width: colW[3] - 8, align: 'right', lineBreak: false });

            defY += rowH;
          });

          defY += 12;
        }

        // ── Pricing totals ───────────────────────────────────────────────
        if (defY > 640) { doc.addPage(); defY = drawPageHeader(doc, data); }
        defY += 8;

        const subtotal   = data.deficiencies.reduce((s, d) =>
          s + (typeof d.estimatedCost === 'string' ? parseFloat(d.estimatedCost) : (d.estimatedCost || 0)), 0);
        const gstRate    = data.gstRate != null ? parseFloat(String(data.gstRate)) : 0.05;
        const pstRate    = data.pstRate != null ? parseFloat(String(data.pstRate)) : 0.07;
        const taxRate    = gstRate + pstRate;
        const tax        = subtotal * taxRate;
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

        doc.fontSize(8).font('Helvetica-Oblique').fillColor(GRAY_TEXT)
           .text('All amounts in CAD', tX, defY, { width: tLW + tVW, align: 'right' });
        defY += 14;

        drawTotalRow('Subtotal:', `$${subtotal.toFixed(2)}`);
        drawTotalRow(`GST + PST (${(taxRate * 100).toFixed(1)}%):`, `$${tax.toFixed(2)}`);
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
        drawClientAuthorizationBlock(doc, defY, data.companyName, data.inspectionDate, M, CW);

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

        // ── Deficiency Photo Appendix ────────────────────────────────────
        const defsWithPhotos = data.deficiencies.filter(d => d.photos && d.photos.length > 0);
        if (defsWithPhotos.length > 0) {
          doc.addPage();
          let photoY = drawPageHeader(doc, data);

          doc.rect(M, photoY, CW, 24).fill(NAVY);
          doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
             .text('DEFICIENCY PHOTOS', M + 10, photoY + 7);
          photoY += 32;

          const IMG_W = 230;
          const IMG_H = 160;
          const IMG_PAD = 8;
          const COLS = 2;
          const CELL_W = (CW - IMG_PAD) / COLS;

          for (const def of defsWithPhotos) {
            if (photoY > 660) { doc.addPage(); photoY = drawPageHeader(doc, data); }

            // Section header per deficiency
            const sevColor = def.severity === 'critical' ? DANGER : def.severity === 'major' ? '#ea580c' : '#ca8a04';
            doc.rect(M, photoY, CW, 18).fill('#f8fafc');
            doc.fillColor(sevColor).fontSize(8).font('Helvetica-Bold')
               .text(`[${def.severity.toUpperCase()}]`, M + 6, photoY + 5, { lineBreak: false });
            doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold')
               .text(` Def #${def.id} — ${def.title}`, M + 56, photoY + 5, { width: CW - 62 });
            photoY += 22;

            let col = 0;
            let rowY = photoY;
            for (const photo of def.photos!) {
              if (photoY + IMG_H + 30 > 720) { doc.addPage(); photoY = drawPageHeader(doc, data); rowY = photoY; col = 0; }

              const x = M + col * CELL_W;
              try {
                doc.image(photo.buffer, x, rowY, { fit: [IMG_W, IMG_H], align: 'center' });
              } catch {
                // skip unreadable image buffer
              }

              // Caption below image
              let capY = rowY + IMG_H + 4;
              if (photo.locationNote) {
                doc.fillColor(GRAY_TEXT).fontSize(7).font('Helvetica-Oblique')
                   .text(photo.locationNote, x, capY, { width: CELL_W - IMG_PAD, lineBreak: false, ellipsis: true });
                capY += 10;
              }
              if (photo.caption) {
                doc.fillColor(BLACK).fontSize(7.5).font('Helvetica')
                   .text(photo.caption, x, capY, { width: CELL_W - IMG_PAD, lineBreak: false, ellipsis: true });
              }

              col++;
              if (col >= COLS) {
                col = 0;
                rowY += IMG_H + 30;
                photoY = rowY;
              }
            }
            if (col > 0) {
              photoY = rowY + IMG_H + 30;
            }
            photoY += 10;
          }
        }

      } else {
        // ════════════════════════════════════════════════════════════════
        // NO-DEFICIENCY PACKAGE — PAGE 3: Completion Letter
        // ════════════════════════════════════════════════════════════════
        doc.addPage();
        drawAfterServiceLetter(doc, data, false);
      }

      // ════════════════════════════════════════════════════════════════════
      // COMPLIANCE CERTIFICATE — CAN/ULC-S536:2019
      // Final technical page in all report types (with or without deficiencies)
      // ════════════════════════════════════════════════════════════════════
      {
        doc.addPage();
        let certY = drawPageHeader(doc, data);

        // ── Page title bar ───────────────────────────────────────────────
        doc.rect(M, certY, CW, 26).fill(NAVY);
        doc.fillColor(WHITE).fontSize(9.5).font('Helvetica-Bold')
           .text(
             'INSPECTION, TESTING, AND MAINTENANCE OF FIRE ALARM SYSTEMS',
             M + 6, certY + 8, { width: CW - 12, align: 'center', lineBreak: false }
           );
        certY += 30;

        doc.fontSize(8).font('Helvetica').fillColor(GRAY_TEXT)
           .text(
             'CAN/ULC-S536:2019  —  Inspection and Testing of Fire Alarm Systems',
             M, certY, { width: CW, align: 'center', lineBreak: false }
           );
        certY += 20;

        // ── System information box (if fire alarm system data present) ───
        if (data.fireAlarmSystem) {
          const sys = data.fireAlarmSystem;
          const boxH = 36;
          doc.rect(M, certY, CW, boxH).stroke(BLACK);

          // Row 1: Single / Two stage + model
          doc.fontSize(8).font('Helvetica-Bold').fillColor(BLACK)
             .text('System Provides:', M + 6, certY + 6, { lineBreak: false });
          drawCheckbox(doc, M + 86, certY + 6, sys.operationType !== 'two_stage', 9);
          doc.fontSize(8).font('Helvetica').fillColor(BLACK)
             .text('Single Stage', M + 99, certY + 6, { lineBreak: false });
          drawCheckbox(doc, M + 180, certY + 6, sys.operationType === 'two_stage', 9);
          doc.text('Two Stage', M + 193, certY + 6, { lineBreak: false });
          const modelStr = [sys.manufacturer, sys.modelNumber].filter(Boolean).join(' ');
          if (modelStr) {
            doc.font('Helvetica-Bold').text('Model: ', M + 280, certY + 6, { lineBreak: false });
            doc.font('Helvetica').text(modelStr, M + 310, certY + 6, { lineBreak: false });
          }

          // Row 2: Monitoring centre
          doc.font('Helvetica').text(
            'The fire alarm system is connected to a fire signal receiving centre.',
            M + 6, certY + 20, { lineBreak: false }
          );
          drawCheckbox(doc, M + 332, certY + 20, sys.connectedToMonitoring === true, 9);
          doc.text('Yes', M + 345, certY + 20, { lineBreak: false });
          drawCheckbox(doc, M + 372, certY + 20, !sys.connectedToMonitoring, 9);
          doc.text('No', M + 385, certY + 20, { lineBreak: false });
          if (sys.monitoringCentreName) {
            doc.text(`Centre: ${sys.monitoringCentreName}`, M + 415, certY + 20, { lineBreak: false });
          }

          certY += boxH + 10;
        }

        // ── Compliance checklist ─────────────────────────────────────────
        const hasDefCert = data.deficiencies.length > 0;
        type CertItem = { text: string; yes: boolean; no: boolean };
        const certItems: CertItem[] = [
          {
            text: 'The entire fire alarm system has been inspected and tested in accordance with CAN/ULC-S536:2019, Inspection and Testing of Fire Alarm Systems.',
            yes: true, no: false,
          },
          {
            text: 'The fire alarm system is fully functional.',
            yes: !hasDefCert, no: hasDefCert,
          },
          {
            text: 'During the inspection and test, were any Deficiencies Identified? (See attached deficiency report, if applicable.)',
            yes: hasDefCert, no: !hasDefCert,
          },
          {
            text: 'During the inspection and test, were any Recommendations Identified?',
            yes: false, no: true,
          },
        ];

        const descColW = CW - 132;
        const yesColW  = 66;
        const noColW   = 66;

        // Column headers
        doc.rect(M, certY, descColW, 18).fill('#374151');
        doc.rect(M + descColW, certY, yesColW, 18).fill('#374151');
        doc.rect(M + descColW + yesColW, certY, noColW, 18).fill('#374151');
        doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold');
        doc.text('Inspection Item', M + 5, certY + 5, { width: descColW - 8, lineBreak: false });
        doc.text('Yes', M + descColW + 22, certY + 5, { lineBreak: false });
        doc.text('No', M + descColW + yesColW + 22, certY + 5, { lineBreak: false });
        certY += 18;

        certItems.forEach((item, i) => {
          const itemH = 30;
          const bg = i % 2 === 0 ? WHITE : '#f9fafb';
          doc.rect(M, certY, descColW, itemH).fill(bg);
          doc.rect(M, certY, descColW, itemH).lineWidth(0.3).stroke(LIGHT_GRAY);
          doc.rect(M + descColW, certY, yesColW, itemH).fill(bg);
          doc.rect(M + descColW, certY, yesColW, itemH).lineWidth(0.3).stroke(LIGHT_GRAY);
          doc.rect(M + descColW + yesColW, certY, noColW, itemH).fill(bg);
          doc.rect(M + descColW + yesColW, certY, noColW, itemH).lineWidth(0.3).stroke(LIGHT_GRAY);

          doc.fillColor(BLACK).fontSize(7.5).font('Helvetica')
             .text(item.text, M + 5, certY + 7, { width: descColW - 10, lineBreak: false });

          const cbSize = 10;
          const cbTop = certY + (itemH - cbSize) / 2;

          // Yes checkbox
          drawCheckbox(doc, M + descColW + 28, cbTop, item.yes, cbSize);

          // No checkbox
          drawCheckbox(doc, M + descColW + yesColW + 28, cbTop, item.no, cbSize);

          certY += itemH;
        });

        certY += 18;

        // ── ASTTBC affirmation + signature table ─────────────────────────
        if (data.technicianName) {
          certY = drawSignatureTable(
            doc, certY, doc.bufferedPageRange().count,
            data.technicianName, data.technicianCertNumber || '',
            data.inspectionDate, data.companyName,
            undefined, undefined, M, CW,
            sigOpts
          );
        }

        // ── Company conducting test row ───────────────────────────────────
        certY += 6;
        const halfW = Math.floor(CW / 2);
        doc.rect(M, certY, halfW, 16).stroke(BLACK);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(BLACK)
           .text('Company Conducting Test:', M + 5, certY + 4, { lineBreak: false });
        doc.font('Helvetica')
           .text(data.companyName, M + 122, certY + 4, { lineBreak: false });
        doc.rect(M + halfW, certY, CW - halfW, 16).stroke(BLACK);
        doc.font('Helvetica-Bold')
           .text('Phone:', M + halfW + 5, certY + 4, { lineBreak: false });
        if (data.companyPhone) {
          doc.font('Helvetica')
             .text(data.companyPhone, M + halfW + 42, certY + 4, { lineBreak: false });
        }
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

        // Custom footer note from company settings (if set)
        if (data.reportFooterText) {
          doc.fontSize(6).font('Helvetica').fillColor('#9ca3af')
             .text(data.reportFooterText, M, 774, { width: CW, align: 'center', lineBreak: false, ellipsis: true });
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
