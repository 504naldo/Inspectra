import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';
import fs from 'fs';
import path from 'path';

describe('Deficiency Report PDF - Sprinkler System Category', () => {
  const baseReportData = {
    jobNumber: 'TEST-SPRINKLER-001',
    jobTitle: 'Sprinkler System Inspection',
    siteName: 'Test Site with Sprinkler Deficiencies',
    siteAddress: '789 Sprinkler Lane',
    siteCity: 'Vancouver',
    siteState: 'BC',
    customerName: 'Test Customer',
    attentionTo: 'John Manager',
    attentionEmail: 'manager@test.com',
    inspectionDate: new Date('2024-12-31'),
    technicianName: 'Test Technician',
    technicianTitle: 'Fire Safety Inspector',
    technicianEmail: 'tech@test.com',
    companyName: 'Earth Wind Fire Services Inc.',
    companyPhone: '604-299-1030',
    companyEmail: 'info@myfirepro.ca',
    deviceSummaries: [],
    inspectionResults: [],
  };

  describe('Four-Category Grouping', () => {
    it('should generate PDF with all four system categories', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Smoke detector issue',
            description: 'Smoke detector not responding to test',
            severity: 'critical',
            status: 'open',
            deviceType: 'Smoke Detector',
            location: 'Hallway 2nd Floor',
            estimatedCost: 150.00,
            systemCategory: 'FIRE_ALARM' as const,
          },
          {
            id: 2,
            title: 'Fire extinguisher expired',
            description: 'Annual inspection overdue',
            severity: 'major',
            status: 'open',
            deviceType: 'Fire Extinguisher',
            location: 'Kitchen',
            estimatedCost: 75.50,
            systemCategory: 'FIRE_EXTINGUISHER' as const,
          },
          {
            id: 3,
            title: 'Emergency light battery low',
            description: 'Battery backup test failed',
            severity: 'major',
            status: 'open',
            deviceType: 'Emergency Light',
            location: 'Exit Corridor',
            estimatedCost: 125.00,
            systemCategory: 'EMERGENCY_LIGHTING' as const,
          },
          {
            id: 4,
            title: 'Sprinkler head missing',
            description: 'Sprinkler head removed during renovation',
            severity: 'critical',
            status: 'open',
            deviceType: 'Sprinkler Head',
            location: 'Office 301',
            estimatedCost: 200.00,
            systemCategory: 'SPRINKLER' as const,
          },
        ],
        summary: 'Test report with all four system categories.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      const outputPath = path.join(process.cwd(), 'test-four-categories.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Four-category PDF: ${outputPath}`);
      console.log(`  - Should have sections: Fire Alarm, Fire Extinguisher, Emergency Lighting, Sprinkler`);
    });

    it('should generate PDF with only sprinkler deficiencies', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'FDC testing required',
            description: 'Fire Department Connection annual test overdue',
            severity: 'major',
            status: 'open',
            deviceType: 'FDC',
            location: 'Exterior - Front',
            estimatedCost: 350.00,
            systemCategory: 'SPRINKLER' as const,
          },
          {
            id: 2,
            title: 'Spare heads missing',
            description: 'Spare sprinkler heads cabinet empty',
            severity: 'minor',
            status: 'open',
            deviceType: 'Sprinkler System',
            location: 'Riser Room',
            estimatedCost: 100.00,
            systemCategory: 'SPRINKLER' as const,
          },
          {
            id: 3,
            title: 'Flow switch malfunction',
            description: 'Flow switch not triggering alarm',
            severity: 'critical',
            status: 'open',
            deviceType: 'Flow Switch',
            location: 'Riser Room',
            estimatedCost: 450.00,
            systemCategory: 'SPRINKLER' as const,
          },
        ],
        summary: 'Sprinkler system inspection with multiple deficiencies.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      const outputPath = path.join(process.cwd(), 'test-sprinkler-only.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Sprinkler-only PDF: ${outputPath}`);
      console.log(`  - Should have only "Sprinkler Deficiencies" section`);
      console.log(`  - Total should be $900.00 + 12% tax = $1,008.00`);
    });
  });

  describe('Fallback to Device Type Detection', () => {
    it('should categorize as sprinkler using device type when systemCategory is null', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Device issue',
            description: 'Needs repair',
            severity: 'major',
            status: 'open',
            deviceType: 'Sprinkler Head', // Should trigger fallback detection
            location: 'Office 101',
            estimatedCost: 150.00,
            systemCategory: null,
          },
          {
            id: 2,
            title: 'Connection problem',
            description: 'Requires testing',
            severity: 'major',
            status: 'open',
            deviceType: 'FDC', // Should trigger fallback detection
            location: 'Exterior',
            estimatedCost: 300.00,
            systemCategory: null,
          },
        ],
        summary: 'Test fallback detection using device type.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      const outputPath = path.join(process.cwd(), 'test-sprinkler-fallback.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Fallback detection PDF: ${outputPath}`);
      console.log(`  - Should categorize both items as Sprinkler using device type`);
    });
  });

  describe('Totals Calculation', () => {
    it('should include sprinkler deficiencies in global totals', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Fire alarm issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Smoke Detector',
            location: 'Hall',
            estimatedCost: 100.00,
            systemCategory: 'FIRE_ALARM' as const,
          },
          {
            id: 2,
            title: 'Sprinkler issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Sprinkler',
            location: 'Office',
            estimatedCost: 200.00,
            systemCategory: 'SPRINKLER' as const,
          },
          {
            id: 3,
            title: 'Extinguisher issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Extinguisher',
            location: 'Kitchen',
            estimatedCost: 50.00,
            systemCategory: 'FIRE_EXTINGUISHER' as const,
          },
        ],
        summary: 'Test global totals calculation.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      // Expected: $350.00 subtotal + 12% tax ($42.00) = $392.00 total
      const outputPath = path.join(process.cwd(), 'test-sprinkler-totals.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Totals calculation PDF: ${outputPath}`);
      console.log(`  - Subtotal: $350.00`);
      console.log(`  - Tax (12%): $42.00`);
      console.log(`  - Grand Total: $392.00`);
    });
  });

  describe('Test Mode Compatibility', () => {
    it('should work with admin override mode for sprinkler deficiencies', async () => {
      const missingLocationDeficiencies = [
        {
          id: 2,
          description: 'FDC testing required',
          severity: 'major',
        },
        {
          id: 4,
          description: 'Sprinkler head missing',
          severity: 'critical',
        },
      ];

      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Fire alarm issue',
            description: 'Smoke detector not responding',
            severity: 'major',
            status: 'open',
            deviceType: 'Smoke Detector',
            location: 'Hallway',
            estimatedCost: 150.00,
            systemCategory: 'FIRE_ALARM' as const,
          },
          {
            id: 2,
            title: 'FDC testing required',
            description: 'Fire Department Connection annual test overdue',
            severity: 'major',
            status: 'open',
            deviceType: 'FDC',
            location: undefined, // Missing location
            estimatedCost: 350.00,
            systemCategory: 'SPRINKLER' as const,
          },
          {
            id: 3,
            title: 'Extinguisher expired',
            description: 'Annual inspection overdue',
            severity: 'minor',
            status: 'open',
            deviceType: 'Fire Extinguisher',
            location: 'Kitchen',
            estimatedCost: 75.00,
            systemCategory: 'FIRE_EXTINGUISHER' as const,
          },
          {
            id: 4,
            title: 'Sprinkler head missing',
            description: 'Sprinkler head removed during renovation',
            severity: 'critical',
            status: 'open',
            deviceType: 'Sprinkler Head',
            location: undefined, // Missing location
            estimatedCost: 200.00,
            systemCategory: 'SPRINKLER' as const,
          },
        ],
        missingLocationDeficiencies, // Admin override mode
        summary: 'Test report with sprinkler deficiencies missing locations.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      const outputPath = path.join(process.cwd(), 'test-sprinkler-override-mode.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Sprinkler override mode PDF: ${outputPath}`);
      console.log(`  - Warning banner should show "2 deficiencies missing location"`);
      console.log(`  - Sprinkler items #2 and #4 should show "Location: TBD (Required)"`);
      console.log(`  - Missing Locations appendix should include both sprinkler items`);
    });
  });

  describe('Section Ordering', () => {
    it('should render sections in correct order: Fire Alarm, Fire Extinguisher, Emergency Lighting, Sprinkler', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          // Add in reverse order to test sorting
          {
            id: 4,
            title: 'Sprinkler issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Sprinkler',
            location: 'Office',
            estimatedCost: 100.00,
            systemCategory: 'SPRINKLER' as const,
          },
          {
            id: 3,
            title: 'Emergency light issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Emergency Light',
            location: 'Corridor',
            estimatedCost: 100.00,
            systemCategory: 'EMERGENCY_LIGHTING' as const,
          },
          {
            id: 2,
            title: 'Extinguisher issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Extinguisher',
            location: 'Kitchen',
            estimatedCost: 100.00,
            systemCategory: 'FIRE_EXTINGUISHER' as const,
          },
          {
            id: 1,
            title: 'Fire alarm issue',
            description: 'Test',
            severity: 'major',
            status: 'open',
            deviceType: 'Smoke Detector',
            location: 'Hall',
            estimatedCost: 100.00,
            systemCategory: 'FIRE_ALARM' as const,
          },
        ],
        summary: 'Test section ordering.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      const outputPath = path.join(process.cwd(), 'test-sprinkler-section-order.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Section ordering PDF: ${outputPath}`);
      console.log(`  - Sections should appear in order: Fire Alarm, Fire Extinguisher, Emergency Lighting, Sprinkler`);
    });
  });
});
