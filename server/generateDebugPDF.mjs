import { generateInspectionReportPDF } from './pdfGeneratorFirePro.js';
import fs from 'fs';
import path from 'path';

const reportData = {
  jobNumber: 'DEBUG-001',
  jobTitle: 'Debug Test Inspection',
  siteName: 'Debug Test Site',
  siteAddress: '123 Debug St',
  siteCity: 'Vancouver',
  siteState: 'BC',
  customerName: 'Debug Customer',
  inspectionDate: new Date('2024-01-15'),
  technicianName: 'John Technician',
  companyName: 'EWF Fire Protection',
  deviceSummaries: [],
  inspectionResults: [],
  deficiencies: [
    {
      id: 1,
      title: 'Fire alarm panel issue',
      severity: 'critical',
      status: 'open',
      description: 'Panel not responding',
      correctiveAction: 'Replace panel',
      deviceType: 'Fire Alarm Panel',
      location: 'Main Lobby',
      estimatedCost: 500,
      systemCategory: 'FIRE_ALARM'
    },
    {
      id: 2,
      title: 'Extinguisher expired',
      severity: 'major',
      status: 'open',
      description: 'Extinguisher past inspection date',
      correctiveAction: 'Replace extinguisher',
      deviceType: 'Fire Extinguisher',
      location: 'Floor 2',
      estimatedCost: 150,
      systemCategory: 'FIRE_EXTINGUISHER'
    },
    {
      id: 3,
      title: 'Emergency light not working',
      severity: 'minor',
      status: 'open',
      description: 'Light does not illuminate',
      correctiveAction: 'Replace battery',
      deviceType: 'Emergency Light',
      location: 'Stairwell A',
      estimatedCost: 75,
      systemCategory: 'EMERGENCY_LIGHTING'
    }
  ]
};

console.log('Generating debug PDF...');
const pdfBuffer = await generateInspectionReportPDF(reportData);
const outputPath = path.join(process.cwd(), 'debug-deficiency-report.pdf');
fs.writeFileSync(outputPath, pdfBuffer);
console.log(`PDF generated: ${outputPath}`);
console.log(`PDF size: ${pdfBuffer.length} bytes`);
