import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Interfaces for compliance report data
interface ChecklistItem {
  id: string;
  description: string;
  result: 'YES' | 'NO' | 'N/A';
}

interface ChecklistSection {
  sectionNumber: string;
  sectionTitle: string;
  location?: string;
  identification?: string;
  items: ChecklistItem[];
  overallResult: 'PASS' | 'DEFICIENT' | 'N/A';
  comments?: string;
}

interface DeviceRecord {
  deviceType: string;
  location: string;
  result: 'PASS' | 'DEFICIENT' | 'NO ACCESS';
  notes?: string;
}

interface ExtinguisherRecord {
  location: string;
  type: string;
  serialNumber?: string;
  result: 'PASS' | 'DEFICIENT';
}

interface EmergencyLightRecord {
  location: string;
  functionalTest: 'PASS' | 'FAIL';
  durationTest?: 'PASS' | 'FAIL' | 'N/A';
  comments?: string;
}

interface DeficiencySummary {
  system: string;
  location: string;
  description: string;
}

interface ComplianceReportData {
  // Header information
  workOrderNumber: string;
  dateOfService: Date;
  inspectionFrequency: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual' | '3 Year' | '5 Year' | '25 Year';
  contactPerson: string;
  contactPhone: string;
  buildingName: string;
  buildingAddress: string;
  city: string;
  postalCode?: string;
  pmOrOwner?: string;
  ownerPhone?: string;
  
  // Table of contents - which systems were inspected
  systemsInspected: {
    fireAlarmSystem: boolean;
    commonAreaDevices: boolean;
    inSuiteDevices: boolean;
    sprinklerSystem: boolean;
    fireExtinguishers: boolean;
    emergencyLighting: boolean;
    hydrant: boolean;
    winterization: boolean;
    generator: boolean;
    backflow: boolean;
    monitoring: boolean;
    smokeControl: boolean;
    suppressionSystems: boolean;
    standpipe: boolean;
    kitchen: boolean;
  };
  
  // Summary page
  systemModel: string;
  systemOperation: 'Single Stage' | 'Two Stage';
  fireSignalReceivingCentre?: string;
  connectedToFireSignalReceivingCentre: boolean;
  systemFullyFunctional: boolean;
  deficienciesIdentified: boolean;
  deficienciesCorrectedDate?: Date;
  recommendationsIdentified: boolean;
  
  // Technician information
  technicianName: string;
  technicianCertificateNumber: string;
  secondaryTechnicianName?: string;
  secondaryTechnicianCertificateNumber?: string;
  companyName: string;
  companyPhone: string;
  
  // Checklist sections
  checklists: ChecklistSection[];
  
  // Device records
  fireAlarmDevices: DeviceRecord[];
  fireExtinguishers: ExtinguisherRecord[];
  emergencyLights: EmergencyLightRecord[];
  
  // Deficiencies
  deficiencies: DeficiencySummary[];
}

// Helper function to draw logo
function drawLogo(doc: any, x: number, y: number, width: number) {
  const logoPath = path.join(process.cwd(), 'assets/ewf-logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x, y, { width });
  }
}

// Helper function to draw checkbox
function drawCheckbox(doc: any, x: number, y: number, checked: boolean, size: number = 10) {
  doc.rect(x, y, size, size).stroke('#000000');
  if (checked) {
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('✓', x + 1, y - 1);
  }
}

// Helper function to draw repeating header
function drawRepeatingHeader(doc: any, data: ComplianceReportData) {
  const pageWidth = 612;
  const margin = 40;
  
  // Draw logo
  drawLogo(doc, margin, margin, 80);
  
  // Company info (left side, below logo)
  doc.fontSize(9)
     .font('Helvetica-Bold')
     .fillColor('#000000')
     .text('EARTH WIND AND FIRE', margin, margin + 85);
  doc.fontSize(7)
     .font('Helvetica')
     .text('Fire Protection Services', margin, margin + 97);
  doc.text('604-299-1030 | info@ewf.ca', margin, margin + 107);
  
  // Right side header box
  const rightBoxX = 320;
  const rightBoxWidth = pageWidth - rightBoxX - margin;
  
  // Date of Service and Work Order
  doc.rect(rightBoxX, margin, rightBoxWidth, 20).stroke('#000000');
  doc.fontSize(8).font('Helvetica-Bold').text('Date of Service:', rightBoxX + 5, margin + 5);
  doc.font('Helvetica').text(data.dateOfService.toLocaleDateString(), rightBoxX + 75, margin + 5);
  doc.font('Helvetica-Bold').text('Work Order Number:', rightBoxX + 130, margin + 5);
  doc.font('Helvetica').text(data.workOrderNumber, rightBoxX + 215, margin + 5);
  
  // Inspection frequency checkboxes
  const freqY = margin + 22;
  doc.rect(rightBoxX, freqY, rightBoxWidth, 30).stroke('#000000');
  
  const frequencies = [
    { label: 'Daily', value: 'Daily', x: rightBoxX + 5, y: freqY + 5 },
    { label: 'Weekly', value: 'Weekly', x: rightBoxX + 60, y: freqY + 5 },
    { label: 'Monthly', value: 'Monthly', x: rightBoxX + 120, y: freqY + 5 },
    { label: 'Quarterly', value: 'Quarterly', x: rightBoxX + 180, y: freqY + 5 },
    { label: 'Annual', value: 'Annual', x: rightBoxX + 5, y: freqY + 17 },
    { label: '3 Year', value: '3 Year', x: rightBoxX + 60, y: freqY + 17 },
    { label: '5 Year', value: '5 Year', x: rightBoxX + 120, y: freqY + 17 },
    { label: '25 Year', value: '25 Year', x: rightBoxX + 180, y: freqY + 17 },
  ];
  
  frequencies.forEach(freq => {
    drawCheckbox(doc, freq.x, freq.y, data.inspectionFrequency === freq.value, 8);
    doc.fontSize(7).font('Helvetica').text(freq.label, freq.x + 12, freq.y);
  });
  
  // Contact person and phone
  const contactY = margin + 54;
  doc.rect(rightBoxX, contactY, rightBoxWidth, 12).stroke('#000000');
  doc.fontSize(7).font('Helvetica-Bold').text('Contact Person:', rightBoxX + 5, contactY + 3);
  doc.font('Helvetica').text(data.contactPerson, rightBoxX + 65, contactY + 3);
  doc.font('Helvetica-Bold').text('Phone:', rightBoxX + 150, contactY + 3);
  doc.font('Helvetica').text(data.contactPhone, rightBoxX + 175, contactY + 3);
  
  // Building info section
  const buildingY = margin + 68;
  doc.rect(margin, buildingY, pageWidth - 2 * margin, 12).stroke('#000000');
  doc.fontSize(7).font('Helvetica-Bold').text('Building Name:', margin + 5, buildingY + 3);
  doc.font('Helvetica').text(data.buildingName, margin + 70, buildingY + 3);
  doc.font('Helvetica-Bold').text('PM or Owner:', rightBoxX + 5, buildingY + 3);
  doc.font('Helvetica').text(data.pmOrOwner || '', rightBoxX + 55, buildingY + 3);
  doc.font('Helvetica-Bold').text('Phone:', rightBoxX + 150, buildingY + 3);
  doc.font('Helvetica').text(data.ownerPhone || '', rightBoxX + 175, buildingY + 3);
  
  const addressY = buildingY + 14;
  doc.rect(margin, addressY, pageWidth - 2 * margin, 12).stroke('#000000');
  doc.fontSize(7).font('Helvetica-Bold').text('Address:', margin + 5, addressY + 3);
  doc.font('Helvetica').text(data.buildingAddress, margin + 40, addressY + 3);
  doc.font('Helvetica-Bold').text('City:', rightBoxX + 5, addressY + 3);
  doc.font('Helvetica').text(data.city, rightBoxX + 25, addressY + 3);
  doc.font('Helvetica-Bold').text('Postal Code:', rightBoxX + 150, addressY + 3);
  doc.font('Helvetica').text(data.postalCode || '', rightBoxX + 195, addressY + 3);
  
  return addressY + 20; // Return Y position where content can start
}

export function generateComplianceReportPDF(data: ComplianceReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 40, bottom: 50, left: 40, right: 40 },
        bufferPages: true
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // ============================================
      // COVER PAGE
      // ============================================
      
      // Background cityscape image
      const coverImagePath = path.join(process.cwd(), 'assets/cityscape-cover.png');
      if (fs.existsSync(coverImagePath)) {
        doc.image(coverImagePath, 0, 0, { width: 612, height: 792 });
      } else {
        // Fallback gradient background
        doc.rect(0, 0, 612, 792).fill('#d1d5db');
      }
      
      // EWF Logo (top-left)
      drawLogo(doc, 50, 50, 150);
      
      // Navy blue title block (bottom half)
      const titleBlockTop = 400;
      const titleBlockHeight = 350;
      doc.rect(0, titleBlockTop, 612, titleBlockHeight).fill('#1e3a8a');
      
      // Title text
      doc.fontSize(48)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('Inspection Report', 50, titleBlockTop + 60, { width: 512 });
      
      // Horizontal line
      doc.moveTo(50, titleBlockTop + 140)
         .lineTo(200, titleBlockTop + 140)
         .lineWidth(3)
         .stroke('#ffffff');
      
      // Building information
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text(`Building Name: ${data.buildingName}`, 50, titleBlockTop + 170, { width: 512 });
      
      doc.fontSize(16)
         .font('Helvetica')
         .text(`Building Address: ${data.buildingAddress}`, 50, titleBlockTop + 210, { width: 512 });
      
      // Company info at bottom
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Earth Wind and Fire', 50, titleBlockTop + 270);
      doc.fontSize(10)
         .font('Helvetica')
         .text('Fire Protection Services', 50, titleBlockTop + 287);
      doc.text('604-299-1030', 300, titleBlockTop + 287);
      
      // ============================================
      // TABLE OF CONTENTS PAGE
      // ============================================
      
      doc.addPage();
      let currentY = drawRepeatingHeader(doc, data);
      
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('Table of Contents', 40, currentY);
      
      currentY += 30;
      
      const systems = [
        { label: 'Fire Alarm System', checked: data.systemsInspected.fireAlarmSystem },
        { label: 'Common Area Devices', checked: data.systemsInspected.commonAreaDevices },
        { label: 'In-suite Devices', checked: data.systemsInspected.inSuiteDevices },
        { label: 'Sprinkler System', checked: data.systemsInspected.sprinklerSystem },
        { label: 'Fire Extinguishers', checked: data.systemsInspected.fireExtinguishers },
        { label: 'Emergency Lighting', checked: data.systemsInspected.emergencyLighting },
        { label: 'Hydrant', checked: data.systemsInspected.hydrant },
        { label: 'Winterization', checked: data.systemsInspected.winterization },
        { label: 'Generator (Electrical Power Supply)', checked: data.systemsInspected.generator },
        { label: 'Backflow', checked: data.systemsInspected.backflow },
        { label: 'Monitoring', checked: data.systemsInspected.monitoring },
        { label: 'Smoke Control', checked: data.systemsInspected.smokeControl },
        { label: 'Suppression Systems', checked: data.systemsInspected.suppressionSystems },
        { label: 'Standpipe', checked: data.systemsInspected.standpipe },
        { label: 'Kitchen', checked: data.systemsInspected.kitchen },
      ];
      
      systems.forEach(system => {
        drawCheckbox(doc, 40, currentY, system.checked, 12);
        doc.fontSize(11).font('Helvetica').text(system.label, 60, currentY + 1);
        currentY += 20;
      });
      
      // ============================================
      // INSPECTION SUMMARY PAGE
      // ============================================
      
      doc.addPage();
      currentY = drawRepeatingHeader(doc, data);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('INSPECTION, TESTING, AND MAINTENANCE OF FIRE ALARM SYSTEMS', 40, currentY, { align: 'center', width: 532 });
      
      currentY += 30;
      
      // System information box
      doc.rect(40, currentY, 532, 40).stroke('#000000');
      doc.fontSize(9).font('Helvetica').text('Systems Provides:', 45, currentY + 5);
      drawCheckbox(doc, 130, currentY + 5, data.systemOperation === 'Single Stage', 10);
      doc.text('Single Stage Operation', 145, currentY + 5);
      drawCheckbox(doc, 270, currentY + 5, data.systemOperation === 'Two Stage', 10);
      doc.text('Two Stage Operation', 285, currentY + 5);
      doc.text(data.systemModel, 450, currentY + 5);
      
      doc.text('The fire alarm system is connected to a fire signal receiving centre.', 45, currentY + 20);
      doc.text(`Name, if applicable: ${data.fireSignalReceivingCentre || ''}`, 45, currentY + 30);
      drawCheckbox(doc, 450, currentY + 20, data.connectedToFireSignalReceivingCentre, 10);
      doc.text('Yes', 465, currentY + 20);
      drawCheckbox(doc, 500, currentY + 20, !data.connectedToFireSignalReceivingCentre, 10);
      doc.text('No', 515, currentY + 20);
      
      currentY += 50;
      
      // Compliance checklist
      const complianceItems = [
        { text: 'The entire fire alarm system has been inspected and tested in accordance with CAN/ULC-S536:2019, Inspection and Testing of Fire Alarm Systems.', yes: true, no: false },
        { text: 'The fire alarm system is fully functional.', yes: data.systemFullyFunctional, no: !data.systemFullyFunctional },
        { text: 'During the Annual Inspection and Test were any Deficiencies Identified? See Page 2, if applicable.', yes: data.deficienciesIdentified, no: !data.deficienciesIdentified },
        { text: 'As of the following Date (M/D/Y) all identified Deficiencies have been corrected:', yes: false, no: false },
        { text: 'During the Annual Inspection and Test were any Recommendations Identified? See Page 3, if applicable', yes: data.recommendationsIdentified, no: !data.recommendationsIdentified },
      ];
      
      complianceItems.forEach(item => {
        const itemHeight = 25;
        doc.rect(40, currentY, 400, itemHeight).stroke('#000000');
        doc.rect(440, currentY, 66, itemHeight).stroke('#000000');
        doc.rect(506, currentY, 66, itemHeight).stroke('#000000');
        
        doc.fontSize(8).font('Helvetica').text(item.text, 45, currentY + 5, { width: 390 });
        
        doc.fontSize(9).font('Helvetica-Bold').text('Yes', 455, currentY + 8);
        drawCheckbox(doc, 445, currentY + 8, item.yes, 10);
        
        doc.text('No', 521, currentY + 8);
        drawCheckbox(doc, 511, currentY + 8, item.no, 10);
        
        currentY += itemHeight;
      });
      
      currentY += 10;
      
      // Technician sign-off
      doc.fontSize(9).font('Helvetica').text('The following person is responsible for ensuring that the information contained in this Test and Inspection Report is correct and complete:', 40, currentY, { width: 532 });
      currentY += 20;
      
      doc.rect(40, currentY, 532, 80).stroke('#000000');
      doc.fontSize(9).font('Helvetica-Bold').text('Printed Name:', 45, currentY + 5);
      doc.font('Helvetica').text(data.technicianName, 120, currentY + 5);
      doc.font('Helvetica-Bold').text('Certificate/ID Number (short formed):', 45, currentY + 20);
      doc.font('Helvetica').text(data.technicianCertificateNumber, 220, currentY + 20);
      doc.font('Helvetica-Bold').text('Signature (This certifies that the information contained in this Fire Alarm System', 45, currentY + 35);
      doc.text('Annual Test and Inspection Report is correct and complete)', 45, currentY + 47);
      
      currentY += 90;
      
      if (data.secondaryTechnicianName) {
        doc.fontSize(9).font('Helvetica').text('Was there a secondary person who conducted the Test and Inspection?', 40, currentY);
        drawCheckbox(doc, 450, currentY, true, 10);
        doc.text('Yes', 465, currentY);
        drawCheckbox(doc, 500, currentY, false, 10);
        doc.text('No', 515, currentY);
        
        currentY += 20;
        
        doc.rect(40, currentY, 532, 60).stroke('#000000');
        doc.fontSize(9).font('Helvetica-Bold').text('Printed Name:', 45, currentY + 5);
        doc.font('Helvetica').text(data.secondaryTechnicianName, 120, currentY + 5);
        doc.font('Helvetica-Bold').text('Certificate/ID Number:', 45, currentY + 20);
        doc.font('Helvetica').text(data.secondaryTechnicianCertificateNumber || '', 150, currentY + 20);
        doc.font('Helvetica-Bold').text('Signature (This certifies that the information contained in this Fire Alarm System', 45, currentY + 35);
        doc.text('Annual Test and Inspection Report is correct and complete)', 45, currentY + 47);
        
        currentY += 70;
      }
      
      doc.rect(40, currentY, 266, 15).stroke('#000000');
      doc.fontSize(9).font('Helvetica-Bold').text('Company Conducting Test:', 45, currentY + 3);
      doc.font('Helvetica').text(data.companyName, 165, currentY + 3);
      
      doc.rect(306, currentY, 266, 15).stroke('#000000');
      doc.font('Helvetica-Bold').text('Company Phone Number:', 311, currentY + 3);
      doc.font('Helvetica').text(data.companyPhone, 430, currentY + 3);
      
      // ============================================
      // CHECKLIST SECTIONS
      // ============================================
      
      data.checklists.forEach((section, sectionIndex) => {
        doc.addPage();
        currentY = drawRepeatingHeader(doc, data);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('INSPECTION, TESTING, AND MAINTENANCE OF FIRE ALARM SYSTEMS', 40, currentY, { align: 'center', width: 532 });
        
        currentY += 25;
        
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text(`${section.sectionNumber} ${section.sectionTitle}`, 40, currentY);
        
        currentY += 20;
        
        // Location and identification
        if (section.location || section.identification) {
          if (section.location) {
            doc.rect(40, currentY, 532, 15).stroke('#000000');
            doc.fontSize(9).font('Helvetica').text(`Control unit or transponder location: ${section.location}`, 45, currentY + 3);
            currentY += 15;
          }
          if (section.identification) {
            doc.rect(40, currentY, 532, 15).stroke('#000000');
            doc.fontSize(9).font('Helvetica').text(`Control unit or transponder identification: ${section.identification}`, 45, currentY + 3);
            currentY += 15;
          }
          currentY += 5;
        }
        
        // Checklist table header
        doc.rect(40, currentY, 30, 20).stroke('#000000');
        doc.rect(70, currentY, 370, 20).stroke('#000000');
        doc.rect(440, currentY, 44, 20).stroke('#000000');
        doc.rect(484, currentY, 44, 20).stroke('#000000');
        doc.rect(528, currentY, 44, 20).stroke('#000000');
        
        doc.fontSize(8).font('Helvetica-Bold').text('Yes', 450, currentY + 6);
        doc.text('No', 495, currentY + 6);
        doc.text('N/A', 536, currentY + 6);
        
        currentY += 20;
        
        // Checklist items
        section.items.forEach((item, itemIndex) => {
          const itemHeight = 20;
          
          // Check if we need a new page
          if (currentY + itemHeight > 720) {
            doc.addPage();
            currentY = drawRepeatingHeader(doc, data);
            currentY += 10;
          }
          
          doc.rect(40, currentY, 30, itemHeight).stroke('#000000');
          doc.rect(70, currentY, 370, itemHeight).stroke('#000000');
          doc.rect(440, currentY, 44, itemHeight).stroke('#000000');
          doc.rect(484, currentY, 44, itemHeight).stroke('#000000');
          doc.rect(528, currentY, 44, itemHeight).stroke('#000000');
          
          doc.fontSize(8).font('Helvetica-Bold').text(item.id, 45, currentY + 5);
          doc.font('Helvetica').text(item.description, 75, currentY + 5, { width: 360 });
          
          drawCheckbox(doc, 450, currentY + 5, item.result === 'YES', 10);
          drawCheckbox(doc, 494, currentY + 5, item.result === 'NO', 10);
          drawCheckbox(doc, 538, currentY + 5, item.result === 'N/A', 10);
          
          currentY += itemHeight;
        });
        
        // Result and comments
        currentY += 5;
        doc.rect(40, currentY, 100, 15).stroke('#000000');
        doc.fontSize(9).font('Helvetica-Bold').text('RESULT', 45, currentY + 3);
        doc.rect(140, currentY, 432, 15).stroke('#000000');
        doc.font('Helvetica').text(section.overallResult, 145, currentY + 3);
        
        currentY += 15;
        
        doc.rect(40, currentY, 100, 30).stroke('#000000');
        doc.fontSize(9).font('Helvetica-Bold').text('COMMENTS', 45, currentY + 3);
        doc.rect(140, currentY, 432, 30).stroke('#000000');
        if (section.comments) {
          doc.fontSize(8).font('Helvetica').text(section.comments, 145, currentY + 3, { width: 420 });
        }
      });
      
      // ============================================
      // DEVICE RECORDS - FIRE ALARM DEVICES
      // ============================================
      
      if (data.fireAlarmDevices.length > 0) {
        doc.addPage();
        currentY = drawRepeatingHeader(doc, data);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('Fire Alarm Devices', 40, currentY);
        
        currentY += 20;
        
        // Table header
        doc.rect(40, currentY, 150, 20).stroke('#000000');
        doc.rect(190, currentY, 200, 20).stroke('#000000');
        doc.rect(390, currentY, 100, 20).stroke('#000000');
        doc.rect(490, currentY, 82, 20).stroke('#000000');
        
        doc.fontSize(9).font('Helvetica-Bold').text('Location', 45, currentY + 5);
        doc.text('Type', 195, currentY + 5);
        doc.text('Result', 395, currentY + 5);
        doc.text('Notes', 495, currentY + 5);
        
        currentY += 20;
        
        data.fireAlarmDevices.forEach(device => {
          if (currentY > 720) {
            doc.addPage();
            currentY = drawRepeatingHeader(doc, data);
            currentY += 10;
          }
          
          doc.rect(40, currentY, 150, 14).stroke('#d1d5db');
          doc.rect(190, currentY, 200, 14).stroke('#d1d5db');
          doc.rect(390, currentY, 100, 14).stroke('#d1d5db');
          doc.rect(490, currentY, 82, 14).stroke('#d1d5db');
          
          doc.fontSize(8).font('Helvetica').text(device.location, 45, currentY + 3);
          doc.text(device.deviceType, 195, currentY + 3);
          
          const resultColor = device.result === 'PASS' ? '#10b981' : device.result === 'DEFICIENT' ? '#ef4444' : '#6b7280';
          doc.fillColor(resultColor).text(device.result, 395, currentY + 3);
          doc.fillColor('#000000').text(device.notes || '', 495, currentY + 3, { width: 75 });
          
          currentY += 14;
        });
      }
      
      // ============================================
      // FIRE EXTINGUISHERS
      // ============================================
      
      if (data.fireExtinguishers.length > 0) {
        doc.addPage();
        currentY = drawRepeatingHeader(doc, data);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('Fire Extinguishers', 40, currentY);
        
        currentY += 20;
        
        // Table header
        doc.rect(40, currentY, 200, 20).stroke('#000000');
        doc.rect(240, currentY, 150, 20).stroke('#000000');
        doc.rect(390, currentY, 100, 20).stroke('#000000');
        doc.rect(490, currentY, 82, 20).stroke('#000000');
        
        doc.fontSize(9).font('Helvetica-Bold').text('Location', 45, currentY + 5);
        doc.text('Type', 245, currentY + 5);
        doc.text('Serial Number', 395, currentY + 5);
        doc.text('Result', 495, currentY + 5);
        
        currentY += 20;
        
        data.fireExtinguishers.forEach(extinguisher => {
          if (currentY > 720) {
            doc.addPage();
            currentY = drawRepeatingHeader(doc, data);
            currentY += 10;
          }
          
          doc.rect(40, currentY, 200, 14).stroke('#d1d5db');
          doc.rect(240, currentY, 150, 14).stroke('#d1d5db');
          doc.rect(390, currentY, 100, 14).stroke('#d1d5db');
          doc.rect(490, currentY, 82, 14).stroke('#d1d5db');
          
          doc.fontSize(8).font('Helvetica').text(extinguisher.location, 45, currentY + 3);
          doc.text(extinguisher.type, 245, currentY + 3);
          doc.text(extinguisher.serialNumber || 'N/A', 395, currentY + 3);
          
          const resultColor = extinguisher.result === 'PASS' ? '#10b981' : '#ef4444';
          doc.fillColor(resultColor).text(extinguisher.result, 495, currentY + 3);
          doc.fillColor('#000000');
          
          currentY += 14;
        });
      }
      
      // ============================================
      // EMERGENCY LIGHTING
      // ============================================
      
      if (data.emergencyLights.length > 0) {
        doc.addPage();
        currentY = drawRepeatingHeader(doc, data);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('Emergency Lighting', 40, currentY);
        
        currentY += 20;
        
        // Table header
        doc.rect(40, currentY, 180, 20).stroke('#000000');
        doc.rect(220, currentY, 100, 20).stroke('#000000');
        doc.rect(320, currentY, 100, 20).stroke('#000000');
        doc.rect(420, currentY, 152, 20).stroke('#000000');
        
        doc.fontSize(9).font('Helvetica-Bold').text('Location', 45, currentY + 5);
        doc.text('Functional Test', 225, currentY + 5);
        doc.text('Duration Test', 325, currentY + 5);
        doc.text('Comments', 425, currentY + 5);
        
        currentY += 20;
        
        data.emergencyLights.forEach(light => {
          if (currentY > 720) {
            doc.addPage();
            currentY = drawRepeatingHeader(doc, data);
            currentY += 10;
          }
          
          doc.rect(40, currentY, 180, 14).stroke('#d1d5db');
          doc.rect(220, currentY, 100, 14).stroke('#d1d5db');
          doc.rect(320, currentY, 100, 14).stroke('#d1d5db');
          doc.rect(420, currentY, 152, 14).stroke('#d1d5db');
          
          doc.fontSize(8).font('Helvetica').text(light.location, 45, currentY + 3);
          
          const funcColor = light.functionalTest === 'PASS' ? '#10b981' : '#ef4444';
          doc.fillColor(funcColor).text(light.functionalTest, 225, currentY + 3);
          
          if (light.durationTest) {
            const durColor = light.durationTest === 'PASS' ? '#10b981' : light.durationTest === 'FAIL' ? '#ef4444' : '#6b7280';
            doc.fillColor(durColor).text(light.durationTest, 325, currentY + 3);
          } else {
            doc.fillColor('#6b7280').text('N/A', 325, currentY + 3);
          }
          
          doc.fillColor('#000000').text(light.comments || '', 425, currentY + 3, { width: 145 });
          
          currentY += 14;
        });
      }
      
      // ============================================
      // DEFICIENCIES SUMMARY
      // ============================================
      
      if (data.deficiencies.length > 0) {
        doc.addPage();
        currentY = drawRepeatingHeader(doc, data);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text('Deficiencies Summary', 40, currentY);
        
        currentY += 20;
        
        // Table header
        doc.rect(40, currentY, 150, 20).stroke('#000000');
        doc.rect(190, currentY, 150, 20).stroke('#000000');
        doc.rect(340, currentY, 232, 20).stroke('#000000');
        
        doc.fontSize(9).font('Helvetica-Bold').text('System', 45, currentY + 5);
        doc.text('Location', 195, currentY + 5);
        doc.text('Description', 345, currentY + 5);
        
        currentY += 20;
        
        data.deficiencies.forEach(deficiency => {
          const descHeight = Math.max(30, Math.ceil(deficiency.description.length / 50) * 12);
          
          if (currentY + descHeight > 720) {
            doc.addPage();
            currentY = drawRepeatingHeader(doc, data);
            currentY += 10;
          }
          
          doc.rect(40, currentY, 150, descHeight).stroke('#d1d5db');
          doc.rect(190, currentY, 150, descHeight).stroke('#d1d5db');
          doc.rect(340, currentY, 232, descHeight).stroke('#d1d5db');
          
          doc.fontSize(8).font('Helvetica').text(deficiency.system, 45, currentY + 5);
          doc.text(deficiency.location, 195, currentY + 5);
          doc.text(deficiency.description, 345, currentY + 5, { width: 220 });
          
          currentY += descHeight;
        });
      }
      
      // Finalize PDF
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}
