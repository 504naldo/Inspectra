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
  estimatedCost?: string | null; // MySQL decimal returns string from Drizzle, convert to number when using
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
  missingLocationDeficiencies?: Array<{ id: number; description: string; severity: string }>; // For admin override mode
}

// Helper functions now imported from pdfSharedStyles.ts

export function generateInspectionReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 50, bottom: 70, left: 50, right: 50 },
        bufferPages: true
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors matching Inspectra style
      const navyBlue = '#003366'; // Dark navy blue for title block
      const white = '#FFFFFF';
      const black = '#000000';
      const grayText = '#4a5568';
      const lightGray = '#e5e7eb';
      const dangerColor = '#dc2626';
      const warningColor = '#f59e0b';

      // ============================================
      // PAGE 1: COVER PAGE
      // ============================================
      
      drawEnhancedCoverPage(doc, {
        reportTitle: 'Deficiency Report',
        propertyName: data.siteName,
        propertyAddress: data.siteAddress,
        propertyCity: data.siteCity,
        propertyPostalCode: undefined,
        inspectionDate: data.inspectionDate,
        companyName: data.companyName,
        companyPhone: data.companyPhone || '604-299-1030',
        companyEmail: data.companyEmail || 'info@ewf.ca',
      });

      // ============================================
      // PAGE 2: EXECUTIVE SUMMARY
      // ============================================
      
      doc.addPage();
      
      // Logo header
      drawLogo(doc, 50, 50, 100);
      
      // Draw executive summary with deficiency counts
      drawDeficiencySummaryPage(doc, data.deficiencies, 110);
      
      // ============================================
      // PAGE 3: LETTER-STYLE SUMMARY
      // ============================================
      
      doc.addPage();
      
      // Logo header
      drawLogo(doc, 50, 50, 100);
      
      let pageYPos = 110;
      
      // Warning banner if missing locations (admin override mode)
      if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
        const warningHeight = 40;
        doc.rect(50, pageYPos, 512, warningHeight)
           .fillAndStroke(warningColor, warningColor);
        
        doc.fontSize(10)
           .fillColor(white)
           .font('Helvetica-Bold')
           .text('⚠ WARNING: TEST MODE REPORT', 60, pageYPos + 8);
        
        doc.fontSize(9)
           .font('Helvetica')
           .text(`${data.missingLocationDeficiencies.length} deficiency/deficiencies missing location information. See appendix for details.`, 60, pageYPos + 24, { width: 492, lineGap: 3 });
        
        pageYPos += warningHeight + 10;
      }
      
      // Date
      doc.fontSize(10)
         .fillColor(black)
         .font('Helvetica')
         .text(data.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, pageYPos);
      
      // Recipient block
      let yPos = pageYPos + 20;
      doc.text(data.siteName.toUpperCase(), 50, yPos);
      yPos += 12;
      
      if (data.customerName) {
        doc.text(data.customerName.toUpperCase(), 50, yPos);
        yPos += 12;
      }
      
      if (data.customerAddress) {
        doc.text(data.customerAddress, 50, yPos);
        yPos += 12;
      }
      
      if (data.customerCity) {
        doc.text(`${data.customerCity}, ${data.customerState || ''} ${data.customerPostalCode || ''}`.trim(), 50, yPos);
        yPos += 12;
      }
      
      if (data.attentionTo) {
        yPos += 5;
        doc.text(`ATTENTION: ${data.attentionTo.toUpperCase()}`, 50, yPos);
        yPos += 12;
      }
      
      if (data.attentionEmail) {
        doc.text(`EMAIL ADDRESS: ${data.attentionEmail}`, 50, yPos);
        yPos += 12;
      }
      
      // RE line
      yPos += 15;
      doc.font('Helvetica-Bold')
         .text(`RE: The Fire Protection System at ${data.siteAddress}`, 50, yPos, { width: 512, lineGap: 4 });
      
      // Service details
      yPos += 25;
      doc.font('Helvetica');
      doc.text('Service Date:', 50, yPos, { continued: true, width: 200 });
      doc.text(`${data.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { continued: false });
      
      doc.text('Job #:', 350, yPos, { continued: true, width: 100 });
      doc.text(data.jobNumber, { continued: false });
      
      // Inspection summary
      yPos += 25;
      doc.font('Helvetica-Bold')
         .text('ANNUAL INSPECTION OF THE FIRE ALARM SYSTEM: ', 50, yPos, { continued: true });
      doc.font('Helvetica')
         .text('Completed the inspection of the Fire Alarm System (per CAN/ULC S536), which included:', { continued: false, width: 512 });
      
      // Bulleted list
      yPos += 30;
      const inspectionItems = [
        'Testing of the dry/wet sprinkler system as per NFPA 25.',
        'Attempted to access and test all in-suite devices.',
        'Testing of the emergency lighting systems as per BC Fire Code Section 6.',
        'Inspected, dated, and tagged all fire extinguishers as per NFPA 10.',
        'Bell test.',
        'Tested smoke alarms as per CAN/ULC S552.'
      ];
      
      inspectionItems.forEach(item => {
        doc.text(`- ${item}`, 60, yPos, { width: 502, lineGap: 3 });
        yPos += 15;
      });
      
      yPos += 5;
      doc.text('Please review the attached deficiency page for the full details and costs for the required repair(s).', 50, yPos, { width: 512, lineGap: 4 });
      
      // Backflow note (if applicable)
      yPos += 25;
      doc.text('BACKFLOW PREVENTER(S): Completed testing of the back flow preventer(s) located at the above-mentioned property. We are pleased to report that no deficiencies were found at the time of service, and all documentation will be sent to the City as required.', 50, yPos, { width: 512 });
      
      // Signature block
      yPos += 40;
      doc.text('Regards,', 50, yPos);
      yPos += 12;
      doc.font('Helvetica-Bold').text(data.companyName, 50, yPos);
      yPos += 20;
      
      doc.font('Helvetica-Oblique');
      doc.text(data.technicianName || 'Fire Alarm Estimator', 50, yPos);
      yPos += 12;
      doc.text(data.technicianTitle || 'Fire Alarm Estimator', 50, yPos);
      yPos += 12;
      doc.text(data.companyPhone || '604-299-1030', 50, yPos);
      yPos += 12;
      doc.fillColor('#0000EE')
         .text(data.technicianEmail || data.companyEmail || 'info@firepro.ca', 50, yPos);

      // ============================================
      // DEFICIENCIES-ONLY SECTION
      // ============================================
      // Device inventory tables removed - deficiency report shows only deficiencies

      // ============================================
      // DEFICIENCIES TABLE
      // ============================================
      
      let defY = 110; // Declare outside if block for use in appendix
      
      if (data.deficiencies.length > 0) {
        doc.addPage();
        drawLogo(doc, 50, 50, 100);
        
        defY = 110;
        
        // Group deficiencies by system type
        const deficienciesBySystem: Record<string, Array<typeof data.deficiencies[0]>> = {
          'Fire Alarm Deficiencies': [],
          'Smoke Alarm Deficiencies': [],
          'Fire Extinguisher Deficiencies': [],
          'Emergency Lighting Deficiencies': [],
          'Sprinkler Deficiencies': []
        };

        // Categorize each deficiency using systemCategory field (with fallback to device type)
        data.deficiencies.forEach((def) => {
          let systemCategory = 'Fire Alarm Deficiencies'; // default
          
          // Use explicit systemCategory if available
          if (def.systemCategory) {
            const categoryMap: Record<string, string> = {
              'FIRE_ALARM': 'Fire Alarm Deficiencies',
              'SMOKE_ALARM': 'Smoke Alarm Deficiencies',
              'FIRE_EXTINGUISHER': 'Fire Extinguisher Deficiencies',
              'EMERGENCY_LIGHTING': 'Emergency Lighting Deficiencies',
              'SPRINKLER': 'Sprinkler Deficiencies'
            };
            systemCategory = categoryMap[def.systemCategory] || 'Fire Alarm Deficiencies';
          } else {
            // Fallback to device type detection for backward compatibility
            const deviceType = def.deviceType || '';
            const typeLower = deviceType.toLowerCase();
            
            if (typeLower.includes('smoke alarm')) {
              systemCategory = 'Smoke Alarm Deficiencies';
            } else if (typeLower.includes('extinguisher')) {
              systemCategory = 'Fire Extinguisher Deficiencies';
            } else if (typeLower.includes('emergency') || typeLower.includes('light')) {
              systemCategory = 'Emergency Lighting Deficiencies';
            } else if (typeLower.includes('sprinkler') || typeLower.includes('fdc') || typeLower.includes('standpipe')) {
              systemCategory = 'Sprinkler Deficiencies';
            }
          }

          deficienciesBySystem[systemCategory].push(def);
        });

        // Calculate totals
        const subtotal = data.deficiencies.reduce((sum, def) => sum + (typeof def.estimatedCost === 'string' ? parseFloat(def.estimatedCost) : (def.estimatedCost || 0)), 0);
        const taxRate = 0.12; // 12% tax (GST + PST)
        const taxAmount = subtotal * taxRate;
        const grandTotal = subtotal + taxAmount;

        // Render deficiencies grouped by system
        const defColWidths = [40, 280, 100, 92];
        const defTableWidth = defColWidths.reduce((a, b) => a + b, 0);
        
        for (const [systemName, systemDeficiencies] of Object.entries(deficienciesBySystem)) {
          if (systemDeficiencies.length === 0) continue;

          // Check if we need a new page
          if (defY > 700) {
            doc.addPage();
            drawLogo(doc, 50, 50, 100);
            defY = 110;
          }

          // System category header
          doc.fontSize(14)
             .fillColor(navyBlue)
             .font('Helvetica-Bold')
             .text(systemName, 50, defY);
          
          defY += 25;

          // Table header
          doc.rect(50, defY, defTableWidth, 20).fill(black);
          doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
          
          let dx = 55;
          doc.text('Item #', dx, defY + 6);
          dx += defColWidths[0];
          doc.text('Description', dx, defY + 6);
          dx += defColWidths[1];
          doc.text('Device', dx, defY + 6);
          dx += defColWidths[2];
          doc.text('Total Labour & Material', dx, defY + 6, { width: defColWidths[3] - 10 });
          
          defY += 20;

          // Render each deficiency in this system
          doc.font('Helvetica').fontSize(8);
          
          systemDeficiencies.forEach((def, i) => {
            if (defY > 680) {
              doc.addPage();
              drawLogo(doc, 50, 50, 100);
              defY = 110;
              
              // Redraw table header on new page
              doc.rect(50, defY, defTableWidth, 20).fill(black);
              doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
              
              dx = 55;
              doc.text('Item #', dx, defY + 6);
              dx += defColWidths[0];
              doc.text('Description', dx, defY + 6);
              dx += defColWidths[1];
              doc.text('Device', dx, defY + 6);
              dx += defColWidths[2];
              doc.text('Total Labour & Material', dx, defY + 6, { width: defColWidths[3] - 10 });
              
              defY += 20;
            }

            const rowHeight = 40;
            doc.rect(50, defY, defTableWidth, rowHeight).stroke(lightGray);
            
            doc.fillColor(black).font('Helvetica').fontSize(8);
            dx = 55;
            
            // Item number
            doc.text(def.id.toString(), dx, defY + 5, { width: defColWidths[0] - 10, align: 'center' });
            dx += defColWidths[0];
            
            // Description with location
            let descText = def.description || def.title;
            if (def.location) {
              descText = `Location: ${def.location}. ${descText}`;
            } else {
              // Show TBD for missing locations in override mode
              descText = `Location: TBD (Required). ${descText}`;
            }
            doc.text(descText, dx, defY + 5, { width: defColWidths[1] - 10, lineGap: 2 });
            dx += defColWidths[1];
            
            // Device type
            doc.text(def.deviceType || '-', dx, defY + 5, { width: defColWidths[2] - 10, lineGap: 2 });
            dx += defColWidths[2];
            
            // Cost
            const cost = typeof def.estimatedCost === 'string' ? parseFloat(def.estimatedCost) : (def.estimatedCost || 0);
            doc.text(`$${cost.toFixed(2)}`, dx, defY + 5, { width: defColWidths[3] - 10, align: 'right' });
            
            defY += rowHeight;
          });

          defY += 15; // Space between system categories
        }

        // Pricing totals section - only add page if insufficient space (need ~100px for totals)
        if (defY > 650) {
          doc.addPage();

          drawLogo(doc, 50, 50, 100);
          defY = 110;
        }

        defY += 10; // Reduced spacing before totals

        const totalsX = 380;
        const totalsLabelWidth = 100;
        const totalsValueWidth = 70;

        doc.fontSize(10)
           .fillColor(black)
           .font('Helvetica-Bold');

        // Subtotal
        doc.text('Subtotal:', totalsX, defY, { width: totalsLabelWidth, align: 'right' })
           .text(`$${subtotal.toFixed(2)}`, totalsX + totalsLabelWidth + 10, defY, { width: totalsValueWidth, align: 'right' });

        defY += 20;

        // Tax
        doc.text(`Tax (${(taxRate * 100).toFixed(0)}%):`, totalsX, defY, { width: totalsLabelWidth, align: 'right' })
           .text(`$${taxAmount.toFixed(2)}`, totalsX + totalsLabelWidth + 10, defY, { width: totalsValueWidth, align: 'right' });

        defY += 20;

        // Grand Total with line separator
        doc.moveTo(totalsX, defY - 5)
           .lineTo(totalsX + totalsLabelWidth + totalsValueWidth + 10, defY - 5)
           .stroke(black);

        defY += 5;

        doc.fontSize(12)
           .text('Total:', totalsX, defY, { width: totalsLabelWidth, align: 'right' })
           .text(`$${grandTotal.toFixed(2)}`, totalsX + totalsLabelWidth + 10, defY, { width: totalsValueWidth, align: 'right' });

        defY += 30;
        
        // ============================================
        // TERMS & CONDITIONS
        // ============================================
        
        doc.fontSize(8)
           .fillColor(grayText)
           .font('Helvetica-Oblique');
        
        const terms = [
          `The proposed quote is valid for 30 days from the date of receipt of the report. Please be aware that, upon approval of the quoted materials, any cancellation will incur a 25% restocking fee.`,
          `Any proposal Scope of Work is based on the information provided in the initial quote, and will not change separately on a time-and-material basis. Work orders may be issued for these additional costed once the bill is processed. Costs for engineering, permits, fees, drawings, aerial lift equipment, sub-trades, equipment or tool rentals, third-party verification, accommodations, meal allowances, and subcontractors will incur extra charges. Drywall repairs, fire-stopping, fire watch, pipe insulation, and painting are not included in the quote. There will be no attempts to access units for sprinkler head replacements.`,
          `GST and PST taxes will be applied to materials only, while GST tax will be applied to labor. Taxes are not included in the quoted price.`,
          `All quoted prices are based on work completed within regular business hours (8:00 AM to 4:30 PM). An environmental disposal fee of $7.00 per battery will be charged for each battery removed from the site. Travel time is included in the quoted costs if the majority of the repairs are approved simultaneously.`,
          `Please note that the prices are based on a single trip. Additional trips required to complete repairs due to access issues may incur extra charges. However, no additional travel charges will apply for trips needed due to stocking issues.`,
          `A vehicle service charge of $88.00 will be applied.`
        ];
        
        terms.forEach(term => {
          if (defY > 680) {
            doc.addPage();
            // Logo header on new page
            drawLogo(doc, 50, 50, 100);
            defY = 110;
          }
          
          doc.text(term, 50, defY, { width: 512, align: 'justify', lineGap: 4 });
          defY += 25;
        });
      }

      // ============================================
      // MISSING LOCATIONS APPENDIX (if applicable)
      // ============================================
      
      if (data.missingLocationDeficiencies && data.missingLocationDeficiencies.length > 0) {
        // Only add new page if insufficient space for appendix header
        if (defY > 650) {
          doc.addPage();

          drawLogo(doc, 50, 50, 100);
          defY = 110;
        } else {
          defY += 30; // Add spacing if continuing on same page
        }
        
        let appendixY = defY;
        
        // Appendix title
        doc.fontSize(16)
           .fillColor(dangerColor)
           .font('Helvetica-Bold')
           .text('APPENDIX: Missing Location Information', 50, appendixY);
        
        appendixY += 30;
        
        doc.fontSize(10)
           .fillColor(black)
           .font('Helvetica')
           .text('The following deficiencies are missing location information and must be updated before final report submission:', 50, appendixY, { width: 512, lineGap: 4 });
        
        appendixY += 30;
        
        // Table header
        const appendixColWidths = [50, 350, 112];
        const appendixTableWidth = appendixColWidths.reduce((a, b) => a + b, 0);
        
        doc.rect(50, appendixY, appendixTableWidth, 20).fill(dangerColor);
        doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
        
        let ax = 55;
        doc.text('ID', ax, appendixY + 6);
        ax += appendixColWidths[0];
        doc.text('Description', ax, appendixY + 6);
        ax += appendixColWidths[1];
        doc.text('Severity', ax, appendixY + 6);
        
        appendixY += 20;
        
        // Table rows
        doc.font('Helvetica').fontSize(8);
        
        data.missingLocationDeficiencies.forEach((def) => {
          if (appendixY > 680) {
            doc.addPage();
            drawLogo(doc, 50, 50, 100);
            appendixY = 110;
            
            // Redraw header
            doc.rect(50, appendixY, appendixTableWidth, 20).fill(dangerColor);
            doc.fillColor(white).fontSize(9).font('Helvetica-Bold');
            
            ax = 55;
            doc.text('ID', ax, appendixY + 6);
            ax += appendixColWidths[0];
            doc.text('Description', ax, appendixY + 6);
            ax += appendixColWidths[1];
            doc.text('Severity', ax, appendixY + 6);
            
            appendixY += 20;
          }
          
          const rowHeight = 30;
          doc.rect(50, appendixY, appendixTableWidth, rowHeight).stroke(lightGray);
          
          doc.fillColor(black).font('Helvetica').fontSize(8);
          ax = 55;
          
          // ID
          doc.text(def.id.toString(), ax, appendixY + 5, { width: appendixColWidths[0] - 10, lineGap: 2 });
          ax += appendixColWidths[0];
          
          // Description
          doc.text(def.description, ax, appendixY + 5, { width: appendixColWidths[1] - 10, lineGap: 2 });
          ax += appendixColWidths[1];
          
          // Severity
          doc.text(def.severity.toUpperCase(), ax, appendixY + 5, { width: appendixColWidths[2] - 10, lineGap: 2 });
          
          appendixY += rowHeight;
        });
      }

      // ============================================
      // FOOTER ON ALL PAGES
      // ============================================
      
      // Add footers to all pages
      const pages = doc.bufferedPageRange();
      const totalPages = pages.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        
        // Simple footer at bottom
        const footerY = 770;
        doc.fontSize(8)
           .fillColor('#6b7280')
           .font('Helvetica');
        
        // Company name on left
        doc.text(data.companyName, 50, footerY, { lineBreak: false });
        
        // Page number in center
        const pageText = `Page ${i + 1} of ${totalPages}`;
        const pageTextWidth = doc.widthOfString(pageText);
        doc.text(pageText, (612 - pageTextWidth) / 2, footerY, { lineBreak: false });
        
        // Job ID on right
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
