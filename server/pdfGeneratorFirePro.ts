import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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
  estimatedCost?: number;
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
}

// Helper function to draw logo
function drawLogo(doc: any, x: number, y: number, width: number) {
  const logoPath = path.join(__dirname, '../assets/ewf-logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x, y, { width });
  }
}

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

      // Colors matching Fire-Pro style
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
      
      // Background - grayscale gradient to simulate hero image
      doc.rect(0, 0, 612, 792).fill('#d1d5db');
      
      // Company logo area (top-left) - EWF logo
      drawLogo(doc, 50, 50, 150);
      
      // Navy blue title block (left side, centered vertically)
      const titleBlockTop = 250;
      const titleBlockHeight = 350;
      doc.rect(50, titleBlockTop, 400, titleBlockHeight).fill(navyBlue);
      
      // Title inside navy block
      doc.fontSize(36)
         .fillColor(white)
         .font('Helvetica-Bold')
         .text('Deficiency Report', 70, titleBlockTop + 40, { width: 360 });
      
      // Horizontal line separator
      doc.moveTo(70, titleBlockTop + 100)
         .lineTo(250, titleBlockTop + 100)
         .lineWidth(3)
         .stroke(white);
      
      // Property details
      doc.fontSize(14)
         .fillColor(white)
         .font('Helvetica')
         .text(data.siteName.toUpperCase(), 70, titleBlockTop + 130, { width: 360 });
      
      doc.fontSize(12)
         .text(data.siteAddress, 70, titleBlockTop + 160, { width: 360 });
      
      doc.text(`${data.siteCity}, ${data.siteState}`.toUpperCase(), 70, titleBlockTop + 180, { width: 360 });
      
      // Company info at bottom of navy block
      doc.fontSize(11)
         .fillColor(white)
         .font('Helvetica-Bold')
         .text(data.companyName, 70, titleBlockTop + 260);
      
      doc.fontSize(10)
         .font('Helvetica')
         .text(data.companyAddress || '102-5489 Byrne Road', 70, titleBlockTop + 280);
      
      doc.text(data.companyPhone || '604-299-1030', 70, titleBlockTop + 295);

      // ============================================
      // PAGE 2: LETTER-STYLE SUMMARY
      // ============================================
      
      doc.addPage();
      
      // Logo header (smaller)
      // Logo header
      drawLogo(doc, 50, 50, 100);
      
      // Date
      doc.fontSize(10)
         .fillColor(black)
         .font('Helvetica')
         .text(data.inspectionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, 110);
      
      // Recipient block
      let yPos = 130;
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
         .text(`RE: The Fire Protection System at ${data.siteAddress}`, 50, yPos, { width: 512 });
      
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
        doc.text(`- ${item}`, 60, yPos, { width: 502 });
        yPos += 15;
      });
      
      yPos += 5;
      doc.text('Please review the attached deficiency page for the full details and costs for the required repair(s).', 50, yPos, { width: 512 });
      
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
      // PAGE 3+: DEVICE TABLES BY CATEGORY
      // ============================================
      
      doc.addPage();
      
      // Logo header
      drawLogo(doc, 50, 50, 100);
      let currentY = 110;
      
      // Group devices by category
      const fireAlarmDevices = data.inspectionResults.filter(r => 
        ['Smoke Detector', 'Heat Detector', 'Pull Station', 'Horn/Strobe', 'Duct Detector', 'Beam Detector'].includes(r.deviceType)
      );
      
      const fireExtinguishers = data.inspectionResults.filter(r => 
        r.deviceType === 'Fire Extinguisher'
      );
      
      const emergencyLights = data.inspectionResults.filter(r => 
        r.deviceType === 'Emergency Light'
      );
      
      // Helper function to draw device table
      const drawDeviceTable = (title: string, devices: InspectionResult[], startY: number) => {
        if (devices.length === 0) return startY;
        
        if (startY > 650) {
          doc.addPage();
          // Logo header on new page
           drawLogo(doc, 50, 50, 100);
           startY = 110;
        }
        
        doc.fontSize(12)
           .fillColor(black)
           .font('Helvetica-Bold')
           .text(title, 50, startY);
        
        startY += 20;
        
        // Table header
        const colWidths = [200, 100, 80, 132];
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        
        doc.rect(50, startY, tableWidth, 18).fill(lightGray);
        doc.fillColor(black).fontSize(9).font('Helvetica-Bold');
        
        let x = 55;
        doc.text('Location', x, startY + 5);
        x += colWidths[0];
        doc.text('Type', x, startY + 5);
        x += colWidths[1];
        doc.text('Result', x, startY + 5);
        x += colWidths[2];
        doc.text('Notes', x, startY + 5);
        
        startY += 18;
        
        // Table rows
        doc.font('Helvetica').fontSize(8);
        devices.forEach((device, i) => {
          if (startY > 720) {
            doc.addPage();
            // Logo header on new page
            drawLogo(doc, 50, 50, 100);
            startY = 110;
          }
          
          // Row background (no striping, just white)
          doc.rect(50, startY, tableWidth, 14).stroke(lightGray);
          
          doc.fillColor(black);
          x = 55;
          doc.text(device.location || '-', x, startY + 3, { width: colWidths[0] - 10, ellipsis: true });
          x += colWidths[0];
          doc.text(device.deviceType, x, startY + 3, { width: colWidths[1] - 10, ellipsis: true });
          x += colWidths[1];
          
          const resultColor = device.result === 'pass' ? '#16a34a' : 
                             device.result === 'fail' ? dangerColor : grayText;
          doc.fillColor(resultColor).text(device.result.toUpperCase(), x, startY + 3, { width: colWidths[2] - 10 });
          x += colWidths[2];
          doc.fillColor(black).text(device.notes || '-', x, startY + 3, { width: colWidths[3] - 10, ellipsis: true });
          
          startY += 14;
        });
        
        return startY + 20;
      };
      
      // Draw Fire Alarm Devices table (subgrouped by type)
      if (fireAlarmDevices.length > 0) {
        currentY = drawDeviceTable('Fire Alarm Devices', fireAlarmDevices, currentY);
      }
      
      // Draw Fire Extinguishers table
      if (fireExtinguishers.length > 0) {
        currentY = drawDeviceTable('Fire Extinguishers', fireExtinguishers, currentY);
      }
      
      // Draw Emergency Lights table
      if (emergencyLights.length > 0) {
        currentY = drawDeviceTable('Emergency Lights', emergencyLights, currentY);
      }

      // ============================================
      // DEFICIENCIES TABLE
      // ============================================
      
      if (data.deficiencies.length > 0) {
        doc.addPage();
        
        // Logo header
        // Logo header
        drawLogo(doc, 50, 50, 100);
        
        let defY = 110;
        
        // Deficiency table
        const defColWidths = [40, 280, 100, 92];
        const defTableWidth = defColWidths.reduce((a, b) => a + b, 0);
        
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
        
        // Table rows
        doc.font('Helvetica').fontSize(8);
        let totalCost = 0;
        
        data.deficiencies.forEach((def, i) => {
          if (defY > 680) {
            doc.addPage();
            // Logo header on new page
            drawLogo(doc, 50, 50, 100);
            defY = 110;
          }
          
          const rowHeight = 40; // Increased height for multi-line descriptions
          doc.rect(50, defY, defTableWidth, rowHeight).stroke(lightGray);
          
          doc.fillColor(black);
          dx = 55;
          
          // Item number (centered)
          doc.text((i + 1).toString(), dx, defY + 5, { width: defColWidths[0] - 10, align: 'center' });
          dx += defColWidths[0];
          
          // Description with location
          let descText = def.description || def.title;
          if (def.location) {
            descText = `Location: ${def.location}. ${descText}`;
          }
          doc.text(descText, dx, defY + 5, { width: defColWidths[1] - 10, lineGap: 2 });
          dx += defColWidths[1];
          
          // Device type
          doc.text(def.deviceType || '-', dx, defY + 5, { width: defColWidths[2] - 10 });
          dx += defColWidths[2];
          
          // Cost (right-aligned)
          const cost = def.estimatedCost || 0;
          totalCost += cost;
          doc.text(`$${cost.toFixed(2)}`, dx, defY + 5, { width: defColWidths[3] - 10, align: 'right' });
          
          defY += rowHeight;
        });
        
        // Total row
        doc.rect(50, defY, defTableWidth, 20).fill(white);
        doc.fillColor(black).fontSize(10).font('Helvetica-Bold');
        
        dx = 55 + defColWidths[0] + defColWidths[1] + defColWidths[2];
        doc.text(`$${totalCost.toFixed(2)}`, dx, defY + 5, { width: defColWidths[3] - 10, align: 'right' });
        
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
          
          doc.text(term, 50, defY, { width: 512, align: 'justify' });
          defY += 25;
        });
      }

      // ============================================
      // FOOTER ON ALL PAGES
      // ============================================
      
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Skip footer on cover page (page 0)
        if (i === 0) continue;
        
        // Footer line
        doc.moveTo(50, 720).lineTo(562, 720).lineWidth(0.5).stroke(grayText);
        
        // Footer text
        doc.fontSize(8)
           .fillColor(grayText)
           .font('Helvetica')
           .text(
             `${data.companyAddress || '15-3871 NORTH FRASER WAY, BURNABY BC V5G 5J6'}`,
             50, 728,
             { align: 'center', width: 512 }
           );
        
        doc.text(
          `${data.companyPhone || '604-299-1030'} | ${data.companyEmail || 'INFO@MYFIREPRO.CA'}`,
          50, 738,
          { align: 'center', width: 512 }
        );
        
        // Page number (right side)
        doc.text(
          `${i} of ${pages.count - 1}`,
          50, 748,
          { align: 'right', width: 512 }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
