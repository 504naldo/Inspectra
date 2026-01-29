/**
 * PDF Site Information Page with Embedded Summary
 * 
 * Draws a comprehensive first page combining site details, system coverage,
 * inspection totals, deficiency breakdown, and cost summary
 */

import PDFDocument from 'pdfkit';
import { PDF_COLORS, PDF_FONTS, PDF_SIZES, PDF_SPACING, drawLogo } from './pdfSharedStyles.js';
import type { SystemCoverage, InspectionTotals, DeficiencyBreakdown, CostSummary } from './pdfSummaryCalculator';

interface SiteInformationData {
  // Header
  reportTitle: string; // "Annual Inspection Report" or "Deficiency Report"
  siteName: string;
  siteAddress: string;
  siteCity: string;
  siteState: string;
  jobNumber: string;
  inspectionDate: Date;
  completedDate?: Date | null;
  
  // Personnel
  leadTechnician: string;
  additionalTechnicians?: string[];
  
  // Client
  clientName?: string;
  buildingContact?: string;
  buildingContactEmail?: string;
  
  // Company
  companyName: string;
  companyPhone?: string;
  companyEmail?: string;
  
  // Summary
  systemCoverage: SystemCoverage;
  inspectionTotals: InspectionTotals;
  deficiencyBreakdown: DeficiencyBreakdown;
  costSummary?: CostSummary; // Only for Deficiency Report
  
  // Notes
  technicianNotes?: string;
  officeNotes?: string;
}

/**
 * Draw Site Information page with embedded summary
 */
export function drawSiteInformationPage(
  doc: typeof PDFDocument,
  data: SiteInformationData
): void {
  let yPos = 50;
  
  // ============================================
  // HEADER: Logo + Report Title
  // ============================================
  
  drawLogo(doc, 50, yPos, 100);
  
  doc.font(PDF_FONTS.bold)
     .fontSize(18)
     .fillColor(PDF_COLORS.brandNavy)
     .text(data.reportTitle, 160, yPos, { width: 352 });
  
  yPos += 60;
  
  // ============================================
  // SITE DETAILS
  // ============================================
  
  doc.font(PDF_FONTS.bold)
     .fontSize(14)
     .fillColor(PDF_COLORS.grayDark)
     .text('Site Information', 50, yPos);
  
  yPos += 20;
  
  // Two-column layout for site details
  const leftCol = 50;
  const rightCol = 320;
  
  // Left column
  doc.font(PDF_FONTS.bold).fontSize(10);
  doc.text('Property:', leftCol, yPos);
  doc.font(PDF_FONTS.regular);
  doc.text(data.siteName, leftCol + 80, yPos);
  
  yPos += 15;
  doc.font(PDF_FONTS.bold);
  doc.text('Address:', leftCol, yPos);
  doc.font(PDF_FONTS.regular);
  doc.text(`${data.siteAddress}, ${data.siteCity}, ${data.siteState}`, leftCol + 80, yPos, { width: 200 });
  
  // Right column
  const rightYPos = yPos - 15;
  doc.font(PDF_FONTS.bold);
  doc.text('Job #:', rightCol, rightYPos);
  doc.font(PDF_FONTS.regular);
  doc.text(data.jobNumber, rightCol + 50, rightYPos);
  
  yPos += 15;
  doc.font(PDF_FONTS.bold);
  doc.text('Inspection Date:', rightCol, yPos);
  doc.font(PDF_FONTS.regular);
  doc.text(data.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), rightCol + 100, yPos);
  
  yPos += 25;
  
  // Personnel
  doc.font(PDF_FONTS.bold);
  doc.text('Lead Technician:', leftCol, yPos);
  doc.font(PDF_FONTS.regular);
  doc.text(data.leadTechnician, leftCol + 100, yPos);
  
  if (data.additionalTechnicians && data.additionalTechnicians.length > 0) {
    yPos += 15;
    doc.font(PDF_FONTS.bold);
    doc.text('Additional Techs:', leftCol, yPos);
    doc.font(PDF_FONTS.regular);
    doc.text(data.additionalTechnicians.join(', '), leftCol + 100, yPos, { width: 400 });
  }
  
  // Client
  if (data.clientName) {
    yPos += 15;
    doc.font(PDF_FONTS.bold);
    doc.text('Client:', leftCol, yPos);
    doc.font(PDF_FONTS.regular);
    doc.text(data.clientName, leftCol + 80, yPos);
  }
  
  if (data.buildingContact) {
    yPos += 15;
    doc.font(PDF_FONTS.bold);
    doc.text('Building Contact:', leftCol, yPos);
    doc.font(PDF_FONTS.regular);
    doc.text(data.buildingContact, leftCol + 100, yPos);
    if (data.buildingContactEmail) {
      doc.text(` (${data.buildingContactEmail})`, { continued: false });
    }
  }
  
  yPos += 30;
  
  // ============================================
  // EMBEDDED SUMMARY BLOCK
  // ============================================
  
  doc.font(PDF_FONTS.bold)
     .fontSize(14)
     .fillColor(PDF_COLORS.brandNavy)
     .text('Summary', 50, yPos);
  
  yPos += 20;
  
  // Draw summary box
  const summaryBoxX = 50;
  const summaryBoxWidth = 512;
  const summaryBoxY = yPos;
  
  doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, 1)
     .fillColor(PDF_COLORS.grayLight)
     .fill();
  
  yPos += 10;
  
  // ============================================
  // SYSTEM COVERAGE (Checkbox-style)
  // ============================================
  
  doc.font(PDF_FONTS.bold)
     .fontSize(10)
     .fillColor(PDF_COLORS.grayDark)
     .text('System Coverage:', summaryBoxX, yPos);
  
  yPos += 18;
  
  const checkboxSize = 10;
  const checkboxSpacing = 20;
  
  const systems = [
    { label: 'Fire Alarm System (CAN/ULC-S536)', checked: data.systemCoverage.fireAlarmSystem },
    { label: 'Sprinkler ITM (NFPA 25 / Vancouver Fire By-law)', checked: data.systemCoverage.sprinklerITM },
    { label: 'Fire Extinguishers', checked: data.systemCoverage.fireExtinguishers },
    { label: 'Emergency Lighting', checked: data.systemCoverage.emergencyLighting },
    { label: 'Smoke Alarms (in-suite)', checked: data.systemCoverage.smokeAlarms },
  ];
  
  systems.forEach(system => {
    // Draw checkbox
    doc.rect(summaryBoxX + 10, yPos, checkboxSize, checkboxSize)
       .stroke(PDF_COLORS.grayLight);
    
    // Draw checkmark if checked
    if (system.checked) {
      doc.font(PDF_FONTS.bold)
         .fontSize(12)
         .fillColor(PDF_COLORS.successGreen)
         .text('✓', summaryBoxX + 10, yPos - 1);
    }
    
    // Draw label
    doc.font(PDF_FONTS.regular)
       .fontSize(9)
       .fillColor(PDF_COLORS.grayDark)
       .text(system.label, summaryBoxX + 10 + checkboxSize + 8, yPos + 1);
    
    yPos += checkboxSpacing;
  });
  
  yPos += 10;
  
  // ============================================
  // INSPECTION TOTALS
  // ============================================
  
  doc.font(PDF_FONTS.bold)
     .fontSize(10)
     .fillColor(PDF_COLORS.grayDark)
     .text('Inspection Totals:', summaryBoxX, yPos);
  
  yPos += 18;
  
  const totals = [
    { label: 'Fire Alarm Devices Tested:', value: data.inspectionTotals.fireAlarmDevices },
    { label: 'Sprinkler Components / Devices:', value: data.inspectionTotals.sprinklerComponents },
    { label: 'Smoke Alarms:', value: data.inspectionTotals.smokeAlarms },
    { label: 'Fire Extinguishers:', value: data.inspectionTotals.fireExtinguishers },
    { label: 'Emergency Lights:', value: data.inspectionTotals.emergencyLights },
  ];
  
  totals.forEach(total => {
    doc.font(PDF_FONTS.regular)
       .fontSize(9)
       .fillColor(PDF_COLORS.grayDark)
       .text(total.label, summaryBoxX + 10, yPos, { width: 300, continued: true })
       .font(PDF_FONTS.bold)
       .text(total.value.toString(), { align: 'right' });
    
    yPos += 15;
  });
  
  yPos += 10;
  
  // ============================================
  // DEFICIENCY BREAKDOWN
  // ============================================
  
  doc.font(PDF_FONTS.bold)
     .fontSize(10)
     .fillColor(PDF_COLORS.grayDark)
     .text('Total Deficiencies:', summaryBoxX, yPos, { continued: true })
     .fontSize(14)
     .fillColor(data.deficiencyBreakdown.total > 0 ? PDF_COLORS.dangerRed : PDF_COLORS.successGreen)
     .text(` ${data.deficiencyBreakdown.total}`, { continued: false });
  
  yPos += 20;
  
  if (data.deficiencyBreakdown.total > 0) {
    const defBreakdown = [
      { label: 'Critical:', value: data.deficiencyBreakdown.critical, color: PDF_COLORS.dangerRed },
      { label: 'Major:', value: data.deficiencyBreakdown.major, color: PDF_COLORS.warningOrange },
      { label: 'Minor:', value: data.deficiencyBreakdown.minor, color: PDF_COLORS.warningYellow },
    ];
    
    defBreakdown.forEach(item => {
      doc.font(PDF_FONTS.regular)
         .fontSize(9)
         .fillColor(PDF_COLORS.grayDark)
         .text(item.label, summaryBoxX + 10, yPos, { width: 100, continued: true })
         .font(PDF_FONTS.bold)
         .fillColor(item.color)
         .text(item.value.toString(), { continued: false });
      
      yPos += 15;
    });
    
    yPos += 10;
  }
  
  // ============================================
  // COST SUMMARY (Deficiency Report only)
  // ============================================
  
  if (data.costSummary && data.deficiencyBreakdown.total > 0) {
    doc.font(PDF_FONTS.bold)
       .fontSize(10)
       .fillColor(PDF_COLORS.grayDark)
       .text('Deficiency Cost Summary:', summaryBoxX, yPos);
    
    yPos += 18;
    
    const costItems = [
      { label: 'Labour Subtotal:', value: data.costSummary.labourSubtotal },
      { label: 'Materials Subtotal:', value: data.costSummary.materialsSubtotal },
      { label: 'Subtotal:', value: data.costSummary.subtotal, bold: true },
      { label: `Tax (${(data.costSummary.taxRate * 100).toFixed(0)}%):`, value: data.costSummary.tax },
      { label: 'Grand Total:', value: data.costSummary.grandTotal, bold: true, large: true },
    ];
    
    costItems.forEach(item => {
      doc.font(item.bold ? PDF_FONTS.bold : PDF_FONTS.regular)
         .fontSize(item.large ? 10 : 9)
         .fillColor(PDF_COLORS.grayDark)
         .text(item.label, summaryBoxX + 10, yPos, { width: 300, continued: true })
         .font(PDF_FONTS.bold)
         .text(`$${item.value.toFixed(2)}`, { align: 'right' });
      
      yPos += item.large ? 20 : 15;
    });
    
    yPos += 10;
  }
  
  // Bottom border of summary box
  doc.rect(summaryBoxX, yPos, summaryBoxWidth, 1)
     .fillColor(PDF_COLORS.grayLight)
     .fill();
  
  yPos += 20;
  
  // ============================================
  // NOTES SECTIONS
  // ============================================
  
  // Technician Notes
  if (data.technicianNotes) {
    doc.font(PDF_FONTS.bold)
       .fontSize(10)
       .fillColor(PDF_COLORS.grayDark)
       .text('Technician Notes:', 50, yPos);
    
    yPos += 15;
    
    doc.font(PDF_FONTS.regular)
       .fontSize(9)
       .fillColor(PDF_COLORS.grayDark)
       .text(data.technicianNotes, 50, yPos, { width: 512, lineGap: 3 });
    
    yPos += doc.heightOfString(data.technicianNotes, { width: 512, lineGap: 3 }) + 15;
  }
  
  // Office Notes
  if (data.officeNotes) {
    doc.font(PDF_FONTS.bold)
       .fontSize(10)
       .fillColor(PDF_COLORS.grayDark)
       .text('Office Notes:', 50, yPos);
    
    yPos += 15;
    
    doc.font(PDF_FONTS.regular)
       .fontSize(9)
       .fillColor(PDF_COLORS.grayDark)
       .text(data.officeNotes, 50, yPos, { width: 512, lineGap: 3 });
  }
}
