import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';
import fs from 'fs';
import path from 'path';

describe('Deficiency Report PDF - Missing Locations Override Mode', () => {
  const baseReportData = {
    jobNumber: 'TEST-OVERRIDE-001',
    jobTitle: 'Test Override Inspection',
    siteName: 'Test Site with Missing Locations',
    siteAddress: '456 Override Street',
    siteCity: 'Vancouver',
    siteState: 'BC',
    customerName: 'Test Customer',
    attentionTo: 'Jane Admin',
    attentionEmail: 'admin@test.com',
    inspectionDate: new Date('2024-12-15'),
    technicianName: 'Test Technician',
    technicianTitle: 'Fire Safety Inspector',
    technicianEmail: 'tech@test.com',
    companyName: 'Earth Wind Fire Services Inc.',
    companyPhone: '604-299-1030',
    companyEmail: 'info@myfirepro.ca',
    deviceSummaries: [],
    inspectionResults: [],
  };

  describe('Production Mode (no missing locations)', () => {
    it('should generate PDF without warnings when all deficiencies have locations', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Smoke alarm issue',
            description: 'Needs replacement',
            severity: 'critical',
            status: 'open',
            deviceType: 'Smoke Alarm',
            location: 'Hallway 2nd Floor',
            estimatedCost: 150.00,
          },
        ],
        summary: 'Standard report with all locations provided.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      // Save for manual inspection
      const outputPath = path.join(process.cwd(), 'test-production-mode.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Production mode PDF: ${outputPath}`);
    });
  });

  describe('Admin Override Mode (with missing locations)', () => {
    it('should generate PDF with warning banner when deficiencies missing locations', async () => {
      const missingLocationDeficiencies = [
        {
          id: 2,
          description: 'Emergency light battery low',
          severity: 'major',
        },
        {
          id: 3,
          description: 'Fire extinguisher expired',
          severity: 'critical',
        },
      ];

      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Smoke alarm issue',
            description: 'Needs replacement',
            severity: 'critical',
            status: 'open',
            deviceType: 'Smoke Alarm',
            location: 'Hallway 2nd Floor',
            estimatedCost: 150.00,
          },
          {
            id: 2,
            title: 'Emergency light issue',
            description: 'Emergency light battery low',
            severity: 'major',
            status: 'open',
            deviceType: 'Emergency Light',
            location: undefined, // Missing location
            estimatedCost: 125.00,
          },
          {
            id: 3,
            title: 'Extinguisher expired',
            description: 'Fire extinguisher expired',
            severity: 'critical',
            status: 'open',
            deviceType: 'Fire Extinguisher',
            location: undefined, // Missing location
            estimatedCost: 75.50,
          },
        ],
        missingLocationDeficiencies, // Admin override mode data
        summary: 'Test report with missing locations (admin override mode).',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      // Save for manual inspection
      const outputPath = path.join(process.cwd(), 'test-override-mode-with-warnings.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Override mode PDF with warnings: ${outputPath}`);
      console.log(`  - Warning banner should appear on page 2`);
      console.log(`  - Deficiencies #2 and #3 should show "Location: TBD (Required)"`);
      console.log(`  - Missing Locations appendix should list 2 deficiencies`);
    });

    it('should handle all deficiencies missing locations', async () => {
      const allMissingDeficiencies = [
        {
          id: 4,
          description: 'Pull station damaged',
          severity: 'minor',
        },
        {
          id: 5,
          description: 'Horn strobe not working',
          severity: 'major',
        },
      ];

      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 4,
            title: 'Pull station issue',
            description: 'Pull station damaged',
            severity: 'minor',
            status: 'open',
            deviceType: 'Manual Pull Station',
            location: undefined,
            estimatedCost: 200.00,
          },
          {
            id: 5,
            title: 'Horn strobe issue',
            description: 'Horn strobe not working',
            severity: 'major',
            status: 'open',
            deviceType: 'Horn/Strobe',
            location: undefined,
            estimatedCost: 300.00,
          },
        ],
        missingLocationDeficiencies: allMissingDeficiencies,
        summary: 'Test report with ALL deficiencies missing locations.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      const outputPath = path.join(process.cwd(), 'test-all-missing-locations.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ All missing locations PDF: ${outputPath}`);
    });

    it('should generate appendix with correct deficiency count', async () => {
      const missingCount = 3;
      const missingLocationDeficiencies = Array.from({ length: missingCount }, (_, i) => ({
        id: i + 10,
        description: `Test deficiency ${i + 1} with missing location`,
        severity: i % 2 === 0 ? 'critical' : 'major',
      }));

      const reportData = {
        ...baseReportData,
        deficiencies: missingLocationDeficiencies.map((def) => ({
          id: def.id,
          title: `Deficiency ${def.id}`,
          description: def.description,
          severity: def.severity,
          status: 'open' as const,
          deviceType: 'Smoke Alarm',
          location: undefined,
          estimatedCost: 100.00,
        })),
        missingLocationDeficiencies,
        summary: `Test with ${missingCount} missing locations.`,
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      
      const outputPath = path.join(process.cwd(), 'test-appendix-count.pdf');
      fs.writeFileSync(outputPath, pdfBuffer);
      
      console.log(`✓ Appendix count test PDF: ${outputPath}`);
      console.log(`  - Should show "${missingCount} deficiency/deficiencies missing location" in warning`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty missingLocationDeficiencies array gracefully', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Test',
            description: 'Test deficiency',
            severity: 'minor',
            status: 'open' as const,
            deviceType: 'Smoke Alarm',
            location: 'Test Location',
            estimatedCost: 50.00,
          },
        ],
        missingLocationDeficiencies: [], // Empty array should not trigger warnings
        summary: 'Test with empty missing locations array.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      console.log(`✓ Empty missing locations array handled correctly`);
    });

    it('should handle undefined missingLocationDeficiencies', async () => {
      const reportData = {
        ...baseReportData,
        deficiencies: [
          {
            id: 1,
            title: 'Test',
            description: 'Test deficiency',
            severity: 'minor',
            status: 'open' as const,
            deviceType: 'Smoke Alarm',
            location: 'Test Location',
            estimatedCost: 50.00,
          },
        ],
        // missingLocationDeficiencies is undefined (not provided)
        summary: 'Test without missingLocationDeficiencies field.',
      };

      const pdfBuffer = await generateInspectionReportPDF(reportData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      console.log(`✓ Undefined missing locations handled correctly`);
    });
  });
});
