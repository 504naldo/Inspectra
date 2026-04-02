import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Shared PDF Styling Utilities
 * Used by both Annual Inspection PDF and Deficiency Report PDF
 * to ensure consistent branding, layout, and readability
 */

// ============================================
// SHARED CONSTANTS
// ============================================

export const PDF_COLORS = {
  brandNavy: '#1e3a8a',      // Primary brand color
  brandNavyLight: '#3b82f6', // Lighter brand accent
  white: '#FFFFFF',
  black: '#000000',
  grayDark: '#4b5563',       // Dark gray for text
  grayMedium: '#6b7280',     // Medium gray for secondary text
  grayLight: '#d1d5db',      // Light gray for borders
  grayLighter: '#e5e7eb',    // Very light gray for backgrounds
  grayLightest: '#f3f4f6',   // Lightest gray for alternating rows
  dangerRed: '#dc2626',      // Critical/error color
  warningOrange: '#ea580c',  // Major warning color
  warningYellow: '#ca8a04',  // Minor warning color
  successGreen: '#16a34a',   // Success/pass color
};

export const PDF_FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
};

export const PDF_SIZES = {
  pageWidth: 612,
  pageHeight: 792,
  margin: 40,
  lineHeight: 1.5, // Minimum 1.4-1.6 for readability
  lineGap: 4, // Additional space between lines (in points)
};

export const PDF_SPACING = {
  sectionGap: 20,
  rowPadding: 8,
  tableCellPadding: 6,
  headerHeight: 25,
};

// ============================================
// SHARED HELPER FUNCTIONS
// ============================================

/**
 * Draw company logo at specified position
 */
export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number): void {
  const logoPath = path.join(process.cwd(), 'assets/ewf-logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x, y, { width });
  }
}

/**
 * Draw checkbox with optional check mark
 */
export function drawCheckbox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  checked: boolean,
  size: number = 10
): void {
  doc.rect(x, y, size, size).stroke(PDF_COLORS.black);
  if (checked) {
    doc.fontSize(12)
       .font(PDF_FONTS.bold)
       .fillColor(PDF_COLORS.black)
       .text('✓', x + 1, y - 1);
  }
}

/**
 * Draw professional footer on every page
 * Format: Company Name | Page X of Y | Report ID | Generated: Date
 */
export function drawFooter(
  doc: PDFKit.PDFDocument,
  companyName: string,
  reportId: string,
  pageNumber: number,
  totalPages: number
): void {
  // Footer line
  doc.moveTo(PDF_SIZES.margin, 762)
     .lineTo(PDF_SIZES.pageWidth - PDF_SIZES.margin, 762)
     .lineWidth(1)
     .stroke(PDF_COLORS.grayLight);
  
  // Save current position before drawing footer
  const savedY = doc.y;
  
  // Footer text - company name (left)
  doc.fontSize(8)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.grayMedium);
  
  doc.text(companyName, PDF_SIZES.margin, 770, { 
    lineBreak: false,
    continued: false
  });
  
  // Page number (center) - reset Y position
  doc.y = 770;
  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    0,
    770,
    { width: PDF_SIZES.pageWidth, align: 'center', lineBreak: false, continued: false }
  );
  
  // Report ID and date (right) - reset Y position
  doc.y = 770;
  const genDate = new Date().toLocaleDateString();
  doc.text(
    `${reportId} | Generated: ${genDate}`,
    0,
    770,
    { width: PDF_SIZES.pageWidth - PDF_SIZES.margin, align: 'right', lineBreak: false, continued: false }
  );
  
  // Restore Y position to prevent cursor advancement
  doc.y = savedY;
}

/**
 * Draw enhanced cover page with consistent branding
 * Shared between both Annual Inspection and Deficiency Report PDFs
 */
export function drawEnhancedCoverPage(
  doc: PDFKit.PDFDocument,
  options: {
    reportTitle: string;
    reportSubtitle?: string;
    propertyName: string;
    propertyAddress: string;
    propertyCity: string;
    propertyPostalCode?: string;
    inspectionDate: Date;
    companyName: string;
    companyPhone?: string;
    companyEmail?: string;
  }
): void {
  // Subtle textured background (light gray with pattern)
  doc.rect(0, 0, PDF_SIZES.pageWidth, PDF_SIZES.pageHeight).fill('#f8f9fa');
  
  // Add subtle diagonal lines texture (5-8% opacity)
  doc.save();
  doc.opacity(0.06);
  for (let i = 0; i < 800; i += 20) {
    doc.moveTo(0, i).lineTo(i, 0).lineWidth(1).stroke(PDF_COLORS.black);
  }
  doc.restore();
  
  // Brand color header accent (top bar)
  doc.rect(0, 0, PDF_SIZES.pageWidth, 80).fill(PDF_COLORS.brandNavy);
  
  // Centered company logo (increased size by 25%)
  const logoWidth = 225; // Was ~180, now 225 (25% increase)
  const centerX = (PDF_SIZES.pageWidth - logoWidth) / 2;
  drawLogo(doc, centerX, 110, logoWidth);
  
  // Report title (centered, unified block with logo)
  const titleY = 280;
  doc.fontSize(42)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text(options.reportTitle, 0, titleY, { width: PDF_SIZES.pageWidth, align: 'center' });
  
  if (options.reportSubtitle) {
    doc.fontSize(28)
       .font(PDF_FONTS.bold)
       .fillColor(PDF_COLORS.brandNavy)
       .text(options.reportSubtitle, 0, titleY + 50, { width: PDF_SIZES.pageWidth, align: 'center' });
  }
  
  // Decorative line
  const lineY = options.reportSubtitle ? 390 : 350;
  doc.moveTo(206, lineY)
     .lineTo(406, lineY)
     .lineWidth(3)
     .stroke(PDF_COLORS.brandNavy);
  
  // Property information box (centered, reduced margins)
  const boxTop = options.reportSubtitle ? 430 : 390;
  const boxLeft = 106;
  const boxWidth = 400;
  
  doc.rect(boxLeft, boxTop, boxWidth, 180)
     .lineWidth(2)
     .stroke(PDF_COLORS.brandNavy);
  
  // Property details (centered in box)
  doc.fontSize(18)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Property Information', boxLeft, boxTop + 20, { width: boxWidth, align: 'center' });
  
  doc.fontSize(14)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.black)
     .text(options.propertyName, boxLeft + 20, boxTop + 55, { width: boxWidth - 40, align: 'center' });
  
  doc.fontSize(11)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.grayDark)
     .text(options.propertyAddress, boxLeft + 20, boxTop + 80, { width: boxWidth - 40, align: 'center' });
  
  doc.text(
    `${options.propertyCity}${options.propertyPostalCode ? ', ' + options.propertyPostalCode : ''}`,
    boxLeft + 20,
    boxTop + 100,
    { width: boxWidth - 40, align: 'center' }
  );
  
  // Inspection date
  doc.fontSize(10)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Inspection Date:', boxLeft + 20, boxTop + 130, { width: boxWidth - 40, align: 'center' });
  
  doc.fontSize(11)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.black)
     .text(
      options.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      boxLeft + 20,
      boxTop + 145,
      { width: boxWidth - 40, align: 'center' }
    );
  
  // Company info footer (centered at bottom)
  doc.fontSize(11)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text(options.companyName, 0, 700, { width: PDF_SIZES.pageWidth, align: 'center' });
  
  doc.fontSize(9)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.grayDark)
     .text('Fire Protection Services', 0, 715, { width: PDF_SIZES.pageWidth, align: 'center' });
  
  const contactInfo = [options.companyPhone, options.companyEmail].filter(Boolean).join(' | ');
  if (contactInfo) {
    doc.text(contactInfo, 0, 730, { width: PDF_SIZES.pageWidth, align: 'center' });
  }
}

/**
 * Draw table with alternating row shading and proper spacing
 * Prevents page breaks inside table rows
 */
export function drawTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  columns: Array<{ header: string; width: number; align?: 'left' | 'center' | 'right' }>,
  rows: Array<string[]>,
  options?: {
    headerBgColor?: string;
    headerTextColor?: string;
    alternateRowShading?: boolean;
    rowPadding?: number;
    fontSize?: number;
  }
): number {
  const opts = {
    headerBgColor: options?.headerBgColor || PDF_COLORS.grayDark,
    headerTextColor: options?.headerTextColor || PDF_COLORS.white,
    alternateRowShading: options?.alternateRowShading !== false,
    rowPadding: options?.rowPadding || PDF_SPACING.rowPadding,
    fontSize: options?.fontSize || 9,
  };
  
  let currentY = startY;
  const rowHeight = opts.fontSize * PDF_SIZES.lineHeight + opts.rowPadding * 2;
  const tableLeft = PDF_SIZES.margin;
  
  // Draw header row
  let currentX = tableLeft;
  columns.forEach((col) => {
    doc.rect(currentX, currentY, col.width, rowHeight)
       .fillAndStroke(opts.headerBgColor, PDF_COLORS.black);
    
    doc.fontSize(opts.fontSize)
       .font(PDF_FONTS.bold)
       .fillColor(opts.headerTextColor)
       .text(
        col.header,
        currentX + opts.rowPadding,
        currentY + opts.rowPadding,
        { width: col.width - opts.rowPadding * 2, align: col.align || 'left' }
      );
    
    currentX += col.width;
  });
  
  currentY += rowHeight;
  
  // Draw data rows
  rows.forEach((row, rowIndex) => {
    // Check if we need a new page
    if (currentY + rowHeight > PDF_SIZES.pageHeight - 100) {
      doc.addPage();
      currentY = PDF_SIZES.margin + 120; // Leave space for header
    }
    
    // Alternating row background
    if (opts.alternateRowShading && rowIndex % 2 === 1) {
      doc.rect(tableLeft, currentY, columns.reduce((sum, col) => sum + col.width, 0), rowHeight)
         .fill(PDF_COLORS.grayLightest);
    }
    
    currentX = tableLeft;
    columns.forEach((col, colIndex) => {
      doc.rect(currentX, currentY, col.width, rowHeight).stroke(PDF_COLORS.grayLight);
      
      doc.fontSize(opts.fontSize)
         .font(PDF_FONTS.regular)
         .fillColor(PDF_COLORS.black)
         .text(
          row[colIndex] || '',
          currentX + opts.rowPadding,
          currentY + opts.rowPadding,
          { 
            width: col.width - opts.rowPadding * 2, 
            align: col.align || 'left',
            lineGap: 2,
            continued: false
          }
        );
      
      currentX += col.width;
    });
    
    currentY += rowHeight;
  });
  
  return currentY;
}

/**
 * Draw section header with brand-colored background
 */
export function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  title: string,
  subtitle?: string
): number {
  const headerHeight = subtitle ? 40 : 30;
  
  doc.rect(PDF_SIZES.margin, y, PDF_SIZES.pageWidth - PDF_SIZES.margin * 2, headerHeight)
     .fill(PDF_COLORS.brandNavy);
  
  doc.fontSize(16)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.white)
     .text(title, PDF_SIZES.margin + 10, y + 8);
  
  if (subtitle) {
    doc.fontSize(10)
       .font(PDF_FONTS.regular)
       .fillColor(PDF_COLORS.white)
       .text(subtitle, PDF_SIZES.margin + 10, y + 24);
  }
  
  return y + headerHeight + PDF_SPACING.sectionGap;
}

/**
 * Apply all footers to buffered pages before finalizing
 */
export function applyFootersToAllPages(
  doc: PDFKit.PDFDocument,
  companyName: string,
  reportId: string
): void {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    drawFooter(doc, companyName, reportId, i + 1, totalPages);
  }
}


/**
 * Draw deficiency summary page for Deficiency Report PDF
 * Shows counts by severity and system category
 */
export function drawDeficiencySummaryPage(
  doc: PDFKit.PDFDocument,
  deficiencies: Array<{
    severity: string;
    systemCategory?: string | null;
  }>,
  startY: number = PDF_SIZES.margin + 80
): number {
  let currentY = startY;
  
  // Page title with brand-colored background
  doc.rect(PDF_SIZES.margin, currentY, PDF_SIZES.pageWidth - PDF_SIZES.margin * 2, 30)
     .fill(PDF_COLORS.brandNavy);
  
  doc.fontSize(16)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.white)
     .text('Executive Summary', PDF_SIZES.margin + 10, currentY + 8);
  
  currentY += 40;
  
  // Deficiency counts by severity section
  doc.fontSize(13)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Deficiency Summary by Severity', PDF_SIZES.margin, currentY);
  
  currentY += 25;
  
  // Count deficiencies by severity
  const criticalCount = deficiencies.filter(d => d.severity === 'critical').length;
  const majorCount = deficiencies.filter(d => d.severity === 'major').length;
  const minorCount = deficiencies.filter(d => d.severity === 'minor').length;
  const totalDeficiencies = criticalCount + majorCount + minorCount;
  
  // Deficiency table
  const colWidths = [200, 100, 100];
  const rowHeight = 25;
  
  // Header row
  doc.rect(PDF_SIZES.margin, currentY, colWidths[0], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLight, PDF_COLORS.black);
  doc.rect(PDF_SIZES.margin + colWidths[0], currentY, colWidths[1], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLight, PDF_COLORS.black);
  doc.rect(PDF_SIZES.margin + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLight, PDF_COLORS.black);
  
  doc.fontSize(10)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.black)
     .text('Severity', PDF_SIZES.margin + 10, currentY + 8);
  doc.text('Count', PDF_SIZES.margin + colWidths[0] + 30, currentY + 8);
  doc.text('Status', PDF_SIZES.margin + colWidths[0] + colWidths[1] + 25, currentY + 8);
  
  currentY += rowHeight;
  
  // Data rows
  const deficiencyRows = [
    { severity: 'Critical', count: criticalCount, color: PDF_COLORS.dangerRed },
    { severity: 'Major', count: majorCount, color: PDF_COLORS.warningOrange },
    { severity: 'Minor', count: minorCount, color: PDF_COLORS.warningYellow }
  ];
  
  deficiencyRows.forEach(row => {
    doc.rect(PDF_SIZES.margin, currentY, colWidths[0], rowHeight).stroke(PDF_COLORS.black);
    doc.rect(PDF_SIZES.margin + colWidths[0], currentY, colWidths[1], rowHeight).stroke(PDF_COLORS.black);
    doc.rect(PDF_SIZES.margin + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight).stroke(PDF_COLORS.black);
    
    doc.fontSize(10)
       .font(PDF_FONTS.regular)
       .fillColor(row.color)
       .text(row.severity, PDF_SIZES.margin + 10, currentY + 8);
    
    doc.fillColor(PDF_COLORS.black)
       .text(row.count.toString(), PDF_SIZES.margin + colWidths[0] + 40, currentY + 8);
    
    const status = row.count === 0 ? 'None' : row.count === 1 ? '1 Issue' : `${row.count} Issues`;
    doc.text(status, PDF_SIZES.margin + colWidths[0] + colWidths[1] + 15, currentY + 8);
    
    currentY += rowHeight;
  });
  
  // Total row
  doc.rect(PDF_SIZES.margin, currentY, colWidths[0], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLightest, PDF_COLORS.black);
  doc.rect(PDF_SIZES.margin + colWidths[0], currentY, colWidths[1], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLightest, PDF_COLORS.black);
  doc.rect(PDF_SIZES.margin + colWidths[0] + colWidths[1], currentY, colWidths[2], rowHeight)
     .fillAndStroke(PDF_COLORS.grayLightest, PDF_COLORS.black);
  
  doc.fontSize(10)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.black)
     .text('Total', PDF_SIZES.margin + 10, currentY + 8);
  doc.text(totalDeficiencies.toString(), PDF_SIZES.margin + colWidths[0] + 40, currentY + 8);
  
  const totalStatus = totalDeficiencies === 0 ? 'None' : totalDeficiencies === 1 ? '1 Issue' : `${totalDeficiencies} Issues`;
  doc.text(totalStatus, PDF_SIZES.margin + colWidths[0] + colWidths[1] + 15, currentY + 8);
  
  currentY += rowHeight + 30;
  
  // Deficiency counts by system category section
  doc.fontSize(13)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Deficiency Summary by System', PDF_SIZES.margin, currentY);
  
  currentY += 25;
  
  // Count deficiencies by system category
  const systemCounts: Record<string, number> = {};
  deficiencies.forEach(d => {
    const system = d.systemCategory || 'UNCATEGORIZED';
    systemCounts[system] = (systemCounts[system] || 0) + 1;
  });
  
  // System category labels
  const systemLabels: Record<string, string> = {
    'FIRE_ALARM': 'Fire Alarm System',
    'FIRE_EXTINGUISHER': 'Fire Extinguishers',
    'EMERGENCY_LIGHTING': 'Emergency Lighting',
    'SPRINKLER': 'Sprinkler System',
    'UNCATEGORIZED': 'Other/Uncategorized'
  };
  
  // Draw system counts as bullet list
  Object.entries(systemCounts).forEach(([system, count]) => {
    doc.fontSize(10)
       .font(PDF_FONTS.regular)
       .fillColor(PDF_COLORS.black)
       .text('•', PDF_SIZES.margin + 10, currentY);
    
    doc.text(
      `${systemLabels[system] || system}: ${count} ${count === 1 ? 'deficiency' : 'deficiencies'}`,
      PDF_SIZES.margin + 25,
      currentY
    );
    
    currentY += 18;
  });
  
  currentY += 20;
  
  // Overall status note
  doc.fontSize(11)
     .font(PDF_FONTS.bold)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Overall Status:', PDF_SIZES.margin, currentY);
  
  currentY += 20;
  
  const statusText = totalDeficiencies === 0
    ? 'No deficiencies identified during this inspection.'
    : criticalCount > 0
    ? 'Critical deficiencies require immediate attention and corrective action.'
    : majorCount > 0
    ? 'Major deficiencies should be addressed promptly to maintain compliance.'
    : 'Minor deficiencies noted for future maintenance planning.';
  
  doc.fontSize(10)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.grayDark)
     .text(statusText, PDF_SIZES.margin, currentY, {
      width: PDF_SIZES.pageWidth - PDF_SIZES.margin * 2,
      align: 'left'
    });
  
  return currentY + 40;
}


/**
 * Render text with proper spacing and readability
 * Fixes common PDFKit issues with cramped or overlapping text
 */
export function renderText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options?: {
    width?: number;
    align?: 'left' | 'center' | 'right' | 'justify';
    lineGap?: number;
    continued?: boolean;
  }
): void {
  const opts = {
    width: options?.width || (PDF_SIZES.pageWidth - PDF_SIZES.margin * 2),
    align: options?.align || 'left',
    lineGap: options?.lineGap !== undefined ? options.lineGap : PDF_SIZES.lineGap,
    continued: options?.continued || false,
  };
  
  doc.text(text, x, y, opts);
}

/**
 * Render paragraph with proper line spacing
 * Use this for multi-line text blocks to ensure readability
 */
export function renderParagraph(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width?: number
): number {
  const textWidth = width || (PDF_SIZES.pageWidth - PDF_SIZES.margin * 2);
  
  doc.text(text, x, y, {
    width: textWidth,
    align: 'left',
    lineGap: PDF_SIZES.lineGap,
    continued: false,
  });
  
  // Return the Y position after the text
  return doc.y + PDF_SIZES.lineGap;
}

// ============================================
// ASTTBC SIGNATURE BLOCK HELPERS
// ============================================

/**
 * Draw the ASTTBC RFPT professional seal as a bordered rectangular box.
 * Matches the Fire Protection seal design from ASTTBC Professional Seal Guideline V2.0.
 *
 * Layout (top → bottom inside the box):
 *   ┌─────────────────────────┐
 *   │     FIRE PROTECTION     │  ← top band (dark navy bg, white text)
 *   │         ASTTBC          │  ← middle (bold)
 *   │   Technician Full Name  │  ← name row
 *   │       FP1234            │  ← registration number
 *   │  AL  EM  EX  SP-P  WA  │  ← discipline codes (optional)
 *   └─────────────────────────┘
 *
 * @param doc        PDFKit document
 * @param x          Left edge of the seal box
 * @param y          Top edge of the seal box
 * @param name       Technician full name (e.g. "J. A. SMITH")
 * @param certNumber RFPT registration number (e.g. "FP1234")
 * @param disciplines Optional discipline codes string (e.g. "AL EM EX SP-P WA")
 * @returns          Y position immediately below the seal box
 */
export function drawRFPTSeal(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  name: string,
  certNumber: string,
  disciplines?: string
): number {
  const sealWidth = 120;
  const topBandH = 14;
  const bodyRowH = 13;
  const rowCount = disciplines ? 4 : 3; // ASTTBC row + name + cert + optional disciplines
  const sealHeight = topBandH + rowCount * bodyRowH + 4; // 4px bottom padding

  // Outer border
  doc.rect(x, y, sealWidth, sealHeight).lineWidth(1).stroke('#000000');

  // Top band – dark navy background with white "FIRE PROTECTION" text
  doc.rect(x, y, sealWidth, topBandH).fill('#1e3a8a');
  doc.fillColor('#FFFFFF')
     .fontSize(7)
     .font('Helvetica-Bold')
     .text('FIRE PROTECTION', x, y + 3, { width: sealWidth, align: 'center' });

  // Row 1 – "ASTTBC" in bold
  const r1Y = y + topBandH + 2;
  doc.fillColor('#000000')
     .fontSize(8)
     .font('Helvetica-Bold')
     .text('ASTTBC', x, r1Y, { width: sealWidth, align: 'center' });

  // Row 2 – technician name (uppercase)
  const r2Y = r1Y + bodyRowH;
  doc.fontSize(7)
     .font('Helvetica-Bold')
     .text(name.toUpperCase(), x, r2Y, { width: sealWidth, align: 'center' });

  // Row 3 – registration number
  const r3Y = r2Y + bodyRowH;
  doc.fontSize(7)
     .font('Helvetica')
     .text(certNumber, x, r3Y, { width: sealWidth, align: 'center' });

  // Row 4 – discipline codes (optional)
  if (disciplines) {
    const r4Y = r3Y + bodyRowH;
    doc.fontSize(6)
       .font('Helvetica')
       .text(disciplines, x, r4Y, { width: sealWidth, align: 'center' });
  }

  return y + sealHeight + 4;
}

/**
 * Draw the ULC S536-compliant affirmation + signature table.
 *
 * Structure:
 *   Affirmation paragraph (full width)
 *   ┌──────────────────────┬──────────────────┬──────────┬───────────┐
 *   │ Supervising/Primary  │ Cert Number/Seal │  Date    │ Signature │
 *   │ Technician Name      │                  │          │           │
 *   ├──────────────────────┼──────────────────┼──────────┼───────────┤
 *   │ [name]               │ [RFPT seal box]  │ [date]   │ [blank]   │
 *   ├──────────────────────┼──────────────────┼──────────┼───────────┤
 *   │ Technician Conducting│ Cert Number/Seal │  Date    │ Signature │
 *   │ Test and Inspection  │                  │          │           │
 *   ├──────────────────────┼──────────────────┼──────────┼───────────┤
 *   │ [secondary name]     │ [RFPT seal box]  │ [date]   │ [blank]   │
 *   └──────────────────────┴──────────────────┴──────────┴───────────┘
 *
 * @param doc                PDFKit document
 * @param startY             Y position to begin drawing
 * @param pageCount          Number of pages in the report (used in affirmation text)
 * @param primaryName        Primary technician full name
 * @param primaryCertNumber  Primary technician RFPT number (e.g. "FP1234")
 * @param inspectionDate     Date of inspection
 * @param companyName        Service company name
 * @param secondaryName      Optional secondary technician name
 * @param secondaryCertNumber Optional secondary technician RFPT number
 * @param leftMargin         Left margin (default 40)
 * @param contentWidth       Usable width (default 532)
 * @returns                  Y position immediately below the table
 */
export function drawSignatureTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  pageCount: number,
  primaryName: string,
  primaryCertNumber: string,
  inspectionDate: Date,
  companyName: string,
  secondaryName?: string,
  secondaryCertNumber?: string,
  leftMargin = 40,
  contentWidth = 532
): number {
  let y = startY;

  // ── Affirmation paragraph ────────────────────────────────────────────────
  const affirmationText =
    `The information in this report, which comprises ${pageCount} pages, affirms that the equipment ` +
    `listed here-in was tested and inspected in conformance with ULC 536:2019 (2024); Standard for ` +
    `Inspection and Testing of Fire Alarm Systems, applicable codes, bylaws, Standards, and the ` +
    `manufacturer's requirements by a qualified technician. The equipment was left in an operational ` +
    `condition except as noted above.`;

  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#000000')
     .text(affirmationText, leftMargin, y, { width: contentWidth, lineGap: 3 });

  y = doc.y + 10;

  // ── Column widths ────────────────────────────────────────────────────────
  const col1W = 170; // Technician Name
  const col2W = 150; // Cert Number / Seal
  const col3W = 80;  // Date
  const col4W = contentWidth - col1W - col2W - col3W; // Signature (~132)

  const headerRowH = 22;
  const dataRowH = 70; // tall enough for the RFPT seal box (≈ 60 px)

  const drawRow = (
    rowY: number,
    isHeader: boolean,
    col1Text: string,
    col2Content: 'header' | { name: string; cert: string },
    col3Text: string,
    col4Text: string
  ) => {
    const rowH = isHeader ? headerRowH : dataRowH;
    const bgColor = isHeader ? '#1e3a8a' : '#ffffff';
    const fgColor = isHeader ? '#ffffff' : '#000000';

    // Background
    doc.rect(leftMargin, rowY, contentWidth, rowH).fill(bgColor);

    // Column dividers
    doc.rect(leftMargin, rowY, contentWidth, rowH).lineWidth(0.5).stroke('#000000');
    doc.moveTo(leftMargin + col1W, rowY).lineTo(leftMargin + col1W, rowY + rowH).stroke('#000000');
    doc.moveTo(leftMargin + col1W + col2W, rowY).lineTo(leftMargin + col1W + col2W, rowY + rowH).stroke('#000000');
    doc.moveTo(leftMargin + col1W + col2W + col3W, rowY).lineTo(leftMargin + col1W + col2W + col3W, rowY + rowH).stroke('#000000');

    if (isHeader) {
      // Header labels
      doc.fillColor(fgColor).fontSize(8).font('Helvetica-Bold');
      doc.text(col1Text, leftMargin + 4, rowY + 7, { width: col1W - 8 });
      doc.text('Certification Number /\nSeal', leftMargin + col1W + 4, rowY + 4, { width: col2W - 8 });
      doc.text(col3Text, leftMargin + col1W + col2W + 4, rowY + 7, { width: col3W - 8 });
      doc.text(col4Text, leftMargin + col1W + col2W + col3W + 4, rowY + 7, { width: col4W - 8 });
    } else {
      // Data row
      doc.fillColor('#000000').fontSize(8).font('Helvetica');

      // Col 1 – name
      doc.text(col1Text, leftMargin + 4, rowY + 6, { width: col1W - 8 });

      // Col 2 – RFPT seal box (centered vertically in the cell)
      if (typeof col2Content === 'object') {
        const sealX = leftMargin + col1W + 10;
        const sealY = rowY + 5;
        drawRFPTSeal(doc, sealX, sealY, col2Content.name, col2Content.cert);
      }

      // Col 3 – date
      doc.text(col3Text, leftMargin + col1W + col2W + 4, rowY + 6, { width: col3W - 8 });

      // Col 4 – company name placeholder (grey)
      doc.fillColor('#9ca3af').fontSize(7)
         .text(companyName, leftMargin + col1W + col2W + col3W + 4, rowY + 6, { width: col4W - 8 });
    }
  };

  const dateStr = inspectionDate.toLocaleDateString('en-CA'); // YYYY-MM-DD

  // ── Primary technician rows ──────────────────────────────────────────────
  drawRow(y, true, 'Supervising / Primary Technician Name', 'header', 'Date', 'Signature');
  y += headerRowH;
  drawRow(y, false, primaryName, { name: primaryName, cert: primaryCertNumber }, dateStr, '');
  y += dataRowH;

  // ── Secondary technician rows (optional) ─────────────────────────────────
  if (secondaryName) {
    drawRow(y, true, 'Technician Conducting Test and Inspection', 'header', 'Date', 'Signature');
    y += headerRowH;
    drawRow(y, false, secondaryName, { name: secondaryName, cert: secondaryCertNumber || '' }, dateStr, '');
    y += dataRowH;
  }

  return y + 10;
}

// ============================================
// INSPECTION SUMMARY PAGE
// ============================================

/**
 * Draw the Inspection Summary page — shows device results table and a
 * prominent status callout (green "No Deficiencies" or coloured warning block).
 * Used as the second interior page in both packages.
 */
export function drawInspectionSummaryPage(
  doc: PDFKit.PDFDocument,
  options: {
    deviceSummaries: Array<{
      deviceType: string;
      total: number;
      passed: number;
      failed: number;
      na: number;
    }>;
    deficiencies: Array<{ severity: string }>;
    startY: number;
    technicianName?: string;
    jobNumber?: string;
    inspectionDate?: Date;
  }
): number {
  let y = options.startY;
  const margin = 50;
  const contentWidth = 512;
  const hasDeficiencies = options.deficiencies.length > 0;

  // ── Section header bar ───────────────────────────────────────────────────
  doc.rect(margin, y, contentWidth, 28).fill(PDF_COLORS.brandNavy);
  doc.fontSize(12).font(PDF_FONTS.bold).fillColor(PDF_COLORS.white)
     .text('INSPECTION SUMMARY', margin + 12, y + 9);
  y += 36;

  // ── Service metadata strip ────────────────────────────────────────────────
  if (options.inspectionDate || options.jobNumber || options.technicianName) {
    doc.rect(margin, y, contentWidth, 24).fill('#f1f5f9');
    doc.rect(margin, y, contentWidth, 24).lineWidth(0.4).stroke(PDF_COLORS.grayLight);
    doc.fontSize(8).font(PDF_FONTS.regular).fillColor(PDF_COLORS.grayDark);

    const metaParts: string[] = [];
    if (options.inspectionDate) {
      metaParts.push(`Service Date: ${options.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    }
    if (options.jobNumber) metaParts.push(`Job #: ${options.jobNumber}`);
    if (options.technicianName) metaParts.push(`Technician: ${options.technicianName}`);

    doc.text(metaParts.join('    |    '), margin + 10, y + 8, { width: contentWidth - 20 });
    y += 30;
  }

  // ── Device results table ─────────────────────────────────────────────────
  if (options.deviceSummaries.length > 0) {
    const cols = [234, 60, 60, 60, 98]; // DeviceType | Total | Pass | Fail | N/A
    const tableWidth = cols.reduce((a, b) => a + b, 0);
    const rowH = 22;

    // Header
    doc.rect(margin, y, tableWidth, rowH).fill(PDF_COLORS.brandNavy);
    doc.fontSize(9).font(PDF_FONTS.bold).fillColor(PDF_COLORS.white);
    let cx = margin;
    ['Device / System Type', 'Total', 'Pass', 'Fail', 'N/A'].forEach((h, i) => {
      doc.text(h, cx + 6, y + 7, { width: cols[i] - 10, align: i > 0 ? 'center' : 'left' });
      cx += cols[i];
    });
    y += rowH;

    options.deviceSummaries.forEach((ds, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : PDF_COLORS.grayLightest;
      doc.rect(margin, y, tableWidth, rowH).fill(bg);
      doc.rect(margin, y, tableWidth, rowH).lineWidth(0.4).stroke(PDF_COLORS.grayLight);

      cx = margin;
      doc.fontSize(9).font(PDF_FONTS.regular).fillColor(PDF_COLORS.black)
         .text(ds.deviceType, cx + 6, y + 7, { width: cols[0] - 10, align: 'left' });
      cx += cols[0];

      doc.text(ds.total.toString(), cx, y + 7, { width: cols[1], align: 'center' });
      cx += cols[1];

      doc.fillColor(ds.passed > 0 ? PDF_COLORS.successGreen : PDF_COLORS.grayDark)
         .text(ds.passed.toString(), cx, y + 7, { width: cols[2], align: 'center' });
      cx += cols[2];

      doc.fillColor(ds.failed > 0 ? PDF_COLORS.dangerRed : PDF_COLORS.grayDark)
         .text(ds.failed.toString(), cx, y + 7, { width: cols[3], align: 'center' });
      cx += cols[3];

      doc.fillColor(PDF_COLORS.grayDark)
         .text(ds.na.toString(), cx, y + 7, { width: cols[4], align: 'center' });

      y += rowH;
    });

    y += 20;
  }

  // ── Status callout ────────────────────────────────────────────────────────
  if (!hasDeficiencies) {
    const blockH = 56;
    doc.rect(margin, y, contentWidth, blockH).fill('#dcfce7');
    doc.rect(margin, y, contentWidth, blockH).lineWidth(2).stroke('#16a34a');

    // Checkmark icon area (left accent bar)
    doc.rect(margin, y, 6, blockH).fill('#16a34a');

    doc.fontSize(15).font(PDF_FONTS.bold).fillColor('#15803d')
       .text('NO DEFICIENCIES IDENTIFIED', margin + 20, y + 10);
    doc.fontSize(9).font(PDF_FONTS.regular).fillColor('#166534')
       .text(
         'All inspected systems and devices are operating within normal parameters.',
         margin + 20, y + 33, { width: contentWidth - 28 }
       );
    y += blockH + 16;
  } else {
    const critCount = options.deficiencies.filter(d => d.severity === 'critical').length;
    const majCount  = options.deficiencies.filter(d => d.severity === 'major').length;
    const minCount  = options.deficiencies.filter(d => d.severity === 'minor').length;
    const total     = options.deficiencies.length;

    const bgColor     = critCount > 0 ? '#fee2e2' : majCount > 0 ? '#ffedd5' : '#fef9c3';
    const barColor    = critCount > 0 ? '#dc2626' : majCount > 0 ? '#ea580c' : '#ca8a04';
    const textColor   = critCount > 0 ? '#991b1b' : majCount > 0 ? '#7c2d12' : '#713f12';

    const blockH = 72;
    doc.rect(margin, y, contentWidth, blockH).fill(bgColor);
    doc.rect(margin, y, contentWidth, blockH).lineWidth(2).stroke(barColor);
    doc.rect(margin, y, 6, blockH).fill(barColor);

    doc.fontSize(15).font(PDF_FONTS.bold).fillColor(textColor)
       .text(`${total} DEFICIEN${total === 1 ? 'CY' : 'CIES'} IDENTIFIED`, margin + 20, y + 10);

    const sevParts: string[] = [];
    if (critCount > 0) sevParts.push(`${critCount} Critical`);
    if (majCount  > 0) sevParts.push(`${majCount} Major`);
    if (minCount  > 0) sevParts.push(`${minCount} Minor`);

    doc.fontSize(10).font(PDF_FONTS.regular).fillColor(textColor)
       .text(sevParts.join('   •   '), margin + 20, y + 33);
    doc.fontSize(8).font(PDF_FONTS.italic).fillColor(textColor)
       .text(
         'Please review the enclosed deficiency report for full details and corrective action recommendations.',
         margin + 20, y + 51, { width: contentWidth - 28 }
       );
    y += blockH + 16;
  }

  return y;
}

// ============================================
// CLIENT AUTHORIZATION BLOCK
// ============================================

/**
 * Draw the client authorization / approval block for deficiency packages.
 * The customer signs here to authorize the quoted corrective work.
 */
export function drawClientAuthorizationBlock(
  doc: PDFKit.PDFDocument,
  startY: number,
  companyName: string,
  reportDate: Date,
  leftMargin = 50,
  contentWidth = 512
): number {
  let y = startY;

  // Section header
  doc.rect(leftMargin, y, contentWidth, 28).fill(PDF_COLORS.brandNavy);
  doc.fontSize(12).font(PDF_FONTS.bold).fillColor(PDF_COLORS.white)
     .text('AUTHORIZATION TO PROCEED — CORRECTIVE WORK', leftMargin + 12, y + 9);
  y += 36;

  // Authorization text
  const validUntil = new Date(reportDate);
  validUntil.setDate(validUntil.getDate() + 30);
  const validUntilStr = validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const authText =
    `By signing below, you authorize ${companyName} to proceed with the corrective work ` +
    `detailed in this report at the quoted prices. This quotation is valid until ${validUntilStr}. ` +
    `Verbal authorization is not accepted. A signed copy must be returned before work will be scheduled.`;

  doc.fontSize(9).font(PDF_FONTS.regular).fillColor(PDF_COLORS.black)
     .text(authText, leftMargin, y, { width: contentWidth, lineGap: 3 });
  y = doc.y + 18;

  // Signature table
  const col1 = contentWidth * 0.55;
  const col2 = contentWidth * 0.45;
  const lineY = y + 32;

  // Left column — signature line
  doc.moveTo(leftMargin, lineY).lineTo(leftMargin + col1 - 20, lineY).lineWidth(0.5).stroke(PDF_COLORS.grayDark);
  doc.fontSize(8).font(PDF_FONTS.regular).fillColor(PDF_COLORS.grayDark)
     .text('Authorized Signature', leftMargin, lineY + 4);

  // Right column — date line
  doc.moveTo(leftMargin + col1, lineY).lineTo(leftMargin + contentWidth, lineY).lineWidth(0.5).stroke(PDF_COLORS.grayDark);
  doc.text('Date', leftMargin + col1, lineY + 4);

  y = lineY + 22;

  // Second row — name/title
  const nameLine = y + 28;
  doc.moveTo(leftMargin, nameLine).lineTo(leftMargin + col1 - 20, nameLine).lineWidth(0.5).stroke(PDF_COLORS.grayDark);
  doc.fontSize(8).font(PDF_FONTS.regular).fillColor(PDF_COLORS.grayDark)
     .text('Printed Name and Title', leftMargin, nameLine + 4);

  // Company reference line
  doc.moveTo(leftMargin + col1, nameLine).lineTo(leftMargin + contentWidth, nameLine).lineWidth(0.5).stroke(PDF_COLORS.grayDark);
  doc.text('Purchase Order / Reference #', leftMargin + col1, nameLine + 4);

  y = nameLine + 22;

  return y + 12;
}
