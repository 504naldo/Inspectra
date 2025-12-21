import PDFDocument from 'pdfkit';

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
  customerName: string;
  inspectionDate: Date;
  completedDate?: Date | null;
  technicianName?: string;
  companyName: string;
  companyLogo?: string;
  summary?: string;
  deviceSummaries: DeviceSummary[];
  deficiencies: Deficiency[];
  inspectionResults: InspectionResult[];
}

export function generateInspectionReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#1e40af'; // Blue
      const dangerColor = '#dc2626'; // Red
      const warningColor = '#f59e0b'; // Amber
      const successColor = '#16a34a'; // Green
      const grayColor = '#6b7280';

      // ============================================
      // HEADER / COVER PAGE
      // ============================================
      
      // Company header
      doc.fontSize(24)
         .fillColor(primaryColor)
         .text(data.companyName, { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(18)
         .fillColor('#000')
         .text('FIRE ALARM INSPECTION REPORT', { align: 'center' });
      
      doc.moveDown(2);
      
      // Report info box
      const boxTop = doc.y;
      doc.rect(50, boxTop, 512, 140)
         .stroke(primaryColor);
      
      doc.fontSize(12).fillColor('#000');
      const leftCol = 60;
      const rightCol = 320;
      let y = boxTop + 15;
      
      doc.text('Job Number:', leftCol, y, { continued: true })
         .font('Helvetica-Bold').text(` ${data.jobNumber}`).font('Helvetica');
      
      y += 20;
      doc.text('Site:', leftCol, y, { continued: true })
         .font('Helvetica-Bold').text(` ${data.siteName}`).font('Helvetica');
      
      y += 20;
      doc.text('Address:', leftCol, y, { continued: true })
         .font('Helvetica-Bold').text(` ${data.siteAddress}`).font('Helvetica');
      
      y += 20;
      doc.text('Customer:', leftCol, y, { continued: true })
         .font('Helvetica-Bold').text(` ${data.customerName}`).font('Helvetica');
      
      y += 20;
      doc.text('Inspection Date:', leftCol, y, { continued: true })
         .font('Helvetica-Bold').text(` ${data.inspectionDate.toLocaleDateString()}`).font('Helvetica');
      
      if (data.completedDate) {
        y += 20;
        doc.text('Completed:', leftCol, y, { continued: true })
           .font('Helvetica-Bold').text(` ${data.completedDate.toLocaleDateString()}`).font('Helvetica');
      }
      
      doc.y = boxTop + 150;
      doc.moveDown(2);

      // ============================================
      // EXECUTIVE SUMMARY
      // ============================================
      
      if (data.summary) {
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('EXECUTIVE SUMMARY');
        
        doc.moveDown(0.5);
        doc.fontSize(10)
           .fillColor('#000')
           .font('Helvetica')
           .text(data.summary, { align: 'justify' });
        
        doc.moveDown(1.5);
      }

      // ============================================
      // DEVICE SUMMARY TABLE
      // ============================================
      
      doc.fontSize(14)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('DEVICE SUMMARY');
      
      doc.moveDown(0.5);
      
      // Table header
      const tableTop = doc.y;
      const colWidths = [180, 60, 60, 60, 60];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      
      doc.rect(50, tableTop, tableWidth, 20).fill(primaryColor);
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold');
      
      let x = 55;
      doc.text('Device Type', x, tableTop + 5);
      x += colWidths[0];
      doc.text('Total', x, tableTop + 5, { width: colWidths[1], align: 'center' });
      x += colWidths[1];
      doc.text('Pass', x, tableTop + 5, { width: colWidths[2], align: 'center' });
      x += colWidths[2];
      doc.text('Fail', x, tableTop + 5, { width: colWidths[3], align: 'center' });
      x += colWidths[3];
      doc.text('N/A', x, tableTop + 5, { width: colWidths[4], align: 'center' });
      
      // Table rows
      let rowY = tableTop + 20;
      doc.font('Helvetica').fillColor('#000');
      
      // Calculate totals
      let totalDevices = 0, totalPass = 0, totalFail = 0, totalNA = 0;
      
      data.deviceSummaries.forEach((summary, i) => {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }
        
        const bgColor = i % 2 === 0 ? '#f9fafb' : '#fff';
        doc.rect(50, rowY, tableWidth, 18).fill(bgColor);
        
        doc.fillColor('#000').fontSize(9);
        x = 55;
        doc.text(summary.deviceType, x, rowY + 4, { width: colWidths[0] - 10 });
        x += colWidths[0];
        doc.text(summary.total.toString(), x, rowY + 4, { width: colWidths[1], align: 'center' });
        x += colWidths[1];
        doc.fillColor(successColor).text(summary.passed.toString(), x, rowY + 4, { width: colWidths[2], align: 'center' });
        x += colWidths[2];
        doc.fillColor(summary.failed > 0 ? dangerColor : '#000').text(summary.failed.toString(), x, rowY + 4, { width: colWidths[3], align: 'center' });
        x += colWidths[3];
        doc.fillColor(grayColor).text(summary.na.toString(), x, rowY + 4, { width: colWidths[4], align: 'center' });
        
        totalDevices += summary.total;
        totalPass += summary.passed;
        totalFail += summary.failed;
        totalNA += summary.na;
        
        rowY += 18;
      });
      
      // Totals row
      doc.rect(50, rowY, tableWidth, 20).fill(primaryColor);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10);
      x = 55;
      doc.text('TOTAL', x, rowY + 5);
      x += colWidths[0];
      doc.text(totalDevices.toString(), x, rowY + 5, { width: colWidths[1], align: 'center' });
      x += colWidths[1];
      doc.text(totalPass.toString(), x, rowY + 5, { width: colWidths[2], align: 'center' });
      x += colWidths[2];
      doc.text(totalFail.toString(), x, rowY + 5, { width: colWidths[3], align: 'center' });
      x += colWidths[3];
      doc.text(totalNA.toString(), x, rowY + 5, { width: colWidths[4], align: 'center' });
      
      doc.y = rowY + 30;
      doc.moveDown(1);

      // ============================================
      // DEFICIENCIES SECTION
      // ============================================
      
      if (data.deficiencies.length > 0) {
        if (doc.y > 600) doc.addPage();
        
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('DEFICIENCIES');
        
        doc.moveDown(0.5);
        
        // Summary counts
        const critical = data.deficiencies.filter(d => d.severity === 'critical').length;
        const major = data.deficiencies.filter(d => d.severity === 'major').length;
        const minor = data.deficiencies.filter(d => d.severity === 'minor').length;
        const observation = data.deficiencies.filter(d => d.severity === 'observation').length;
        
        doc.fontSize(10).font('Helvetica');
        doc.fillColor(dangerColor).text(`Critical: ${critical}`, { continued: true });
        doc.fillColor(warningColor).text(`   Major: ${major}`, { continued: true });
        doc.fillColor('#000').text(`   Minor: ${minor}`, { continued: true });
        doc.fillColor(grayColor).text(`   Observations: ${observation}`);
        
        doc.moveDown(1);
        
        // List each deficiency
        data.deficiencies.forEach((def, i) => {
          if (doc.y > 680) doc.addPage();
          
          const severityColor = def.severity === 'critical' ? dangerColor : 
                               def.severity === 'major' ? warningColor : 
                               def.severity === 'minor' ? '#000' : grayColor;
          
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#000')
             .text(`${i + 1}. ${def.title}`, { continued: true });
          
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor(severityColor)
             .text(` [${def.severity.toUpperCase()}]`, { continued: true });
          
          doc.fillColor(def.status === 'open' ? dangerColor : successColor)
             .text(` - ${def.status.toUpperCase()}`);
          
          if (def.description) {
            doc.fontSize(9)
               .fillColor('#000')
               .font('Helvetica')
               .text(def.description, { indent: 20 });
          }
          
          if (def.correctiveAction) {
            doc.fontSize(9)
               .fillColor(grayColor)
               .font('Helvetica-Oblique')
               .text(`Corrective Action: ${def.correctiveAction}`, { indent: 20 });
          }
          
          doc.moveDown(0.5);
        });
      }

      // ============================================
      // DETAILED INSPECTION RESULTS
      // ============================================
      
      if (data.inspectionResults.length > 0) {
        doc.addPage();
        
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('DETAILED INSPECTION RESULTS');
        
        doc.moveDown(0.5);
        
        // Group by device type
        const groupedResults: Record<string, InspectionResult[]> = {};
        data.inspectionResults.forEach(result => {
          const type = result.deviceType || 'Other';
          if (!groupedResults[type]) groupedResults[type] = [];
          groupedResults[type].push(result);
        });
        
        Object.entries(groupedResults).forEach(([deviceType, results]) => {
          if (doc.y > 650) doc.addPage();
          
          doc.fontSize(11)
             .fillColor(primaryColor)
             .font('Helvetica-Bold')
             .text(deviceType);
          
          doc.moveDown(0.3);
          
          // Mini table for this device type
          const miniTableTop = doc.y;
          const miniColWidths = [150, 100, 60, 150];
          const miniTableWidth = miniColWidths.reduce((a, b) => a + b, 0);
          
          // Header
          doc.rect(50, miniTableTop, miniTableWidth, 16).fill('#e5e7eb');
          doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
          let mx = 55;
          doc.text('Location', mx, miniTableTop + 4);
          mx += miniColWidths[0];
          doc.text('Serial #', mx, miniTableTop + 4);
          mx += miniColWidths[1];
          doc.text('Result', mx, miniTableTop + 4);
          mx += miniColWidths[2];
          doc.text('Notes', mx, miniTableTop + 4);
          
          let mRowY = miniTableTop + 16;
          doc.font('Helvetica').fontSize(8);
          
          results.forEach((result, ri) => {
            if (mRowY > 720) {
              doc.addPage();
              mRowY = 50;
            }
            
            const resultColor = result.result === 'pass' ? successColor :
                               result.result === 'fail' ? dangerColor : grayColor;
            
            doc.fillColor('#000');
            mx = 55;
            doc.text(result.location || '-', mx, mRowY + 2, { width: miniColWidths[0] - 5 });
            mx += miniColWidths[0];
            doc.text(result.serialNumber || '-', mx, mRowY + 2, { width: miniColWidths[1] - 5 });
            mx += miniColWidths[1];
            doc.fillColor(resultColor).text(result.result.toUpperCase(), mx, mRowY + 2, { width: miniColWidths[2] - 5 });
            mx += miniColWidths[2];
            doc.fillColor('#000').text(result.notes || '-', mx, mRowY + 2, { width: miniColWidths[3] - 5 });
            
            mRowY += 14;
          });
          
          doc.y = mRowY + 10;
          doc.moveDown(0.5);
        });
      }

      // ============================================
      // FOOTER ON ALL PAGES
      // ============================================
      
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        
        // Footer line
        doc.moveTo(50, 730).lineTo(562, 730).stroke(grayColor);
        
        // Footer text
        doc.fontSize(8)
           .fillColor(grayColor)
           .text(
             `${data.companyName} | ${data.jobNumber} | Page ${i + 1} of ${pages.count}`,
             50, 735,
             { align: 'center', width: 512 }
           );
        
        doc.text(
          `Generated: ${new Date().toLocaleDateString()}`,
          50, 745,
          { align: 'center', width: 512 }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
