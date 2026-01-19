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
  
  // Footer text
  doc.fontSize(8)
     .font(PDF_FONTS.regular)
     .fillColor(PDF_COLORS.grayMedium)
     .text(companyName, PDF_SIZES.margin, 770);
  
  // Page number (center)
  doc.text(
    `Page ${pageNumber} of ${totalPages}`,
    0,
    770,
    { width: PDF_SIZES.pageWidth, align: 'center' }
  );
  
  // Report ID and date (right)
  const genDate = new Date().toLocaleDateString();
  doc.text(
    `${reportId} | Generated: ${genDate}`,
    0,
    770,
    { width: PDF_SIZES.pageWidth - PDF_SIZES.margin, align: 'right' }
  );
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
          { width: col.width - opts.rowPadding * 2, align: col.align || 'left' }
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
