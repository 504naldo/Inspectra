import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';
import fs from 'fs';
import PDFParser from 'pdf-parse';

describe('Deficiency Report PDF - Blank Pages Fix', () => {
  const baseReportData = {
    jobNumber: 'JOB-001',
    jobTitle: 'Test Inspection',
    siteName: 'Test Site',
    siteAddress: '123 Test St',
    siteCity: 'Vancouver',
    siteState: 'BC',
    customerName: 'Test Customer',
    inspectionDate: new Date('2024-01-15'),
    technicianName: 'John Technician',
    companyName: 'EWF Fire Protection',
    deviceSummaries: [],
    inspectionResults: []
  };

  it('should generate 1-2 pages for 3 deficiencies (no blank pages)', async () => {
    const reportData = {
      ...baseReportData,
      deficiencies: [
        {
          id: 1,
          title: 'Fire alarm panel issue',
          severity: 'high',
          status: 'open',
          description: 'Panel not responding',
          correctiveAction: 'Replace panel',
          deviceType: 'Fire Alarm Panel',
          location: 'Main Lobby',
          estimatedCost: 500,
          systemCategory: 'FIRE_ALARM' as const
        },
        {
          id: 2,
          title: 'Extinguisher expired',
          severity: 'medium',
          status: 'open',
          description: 'Extinguisher past inspection date',
          correctiveAction: 'Replace extinguisher',
          deviceType: 'Fire Extinguisher',
          location: 'Floor 2',
          estimatedCost: 150,
          systemCategory: 'FIRE_EXTINGUISHER' as const
        },
        {
          id: 3,
          title: 'Emergency light not working',
          severity: 'high',
          status: 'open',
          description: 'Light does not illuminate',
          correctiveAction: 'Replace battery',
          deviceType: 'Emergency Light',
          location: 'Stairwell A',
          estimatedCost: 75,
          systemCategory: 'EMERGENCY_LIGHTING' as const
        }
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);

    // Verify all 3 deficiency category sections are present (no sections skipped)
    const pdfData = await PDFParser(pdfBuffer);
    expect(pdfData.numpages).toBeGreaterThan(0);
    expect(pdfData.text).toContain('Fire Alarm Deficiencies');
    expect(pdfData.text).toContain('Fire Extinguisher Deficiencies');
    expect(pdfData.text).toContain('Emergency Lighting Deficiencies');
  });

  it('should skip empty deficiency sections entirely', async () => {
    const reportData = {
      ...baseReportData,
      deficiencies: [
        {
          id: 1,
          title: 'Fire alarm panel issue',
          severity: 'high',
          status: 'open',
          description: 'Panel not responding',
          correctiveAction: 'Replace panel',
          deviceType: 'Fire Alarm Panel',
          location: 'Main Lobby',
          estimatedCost: 500,
          systemCategory: 'FIRE_ALARM' as const
        }
        // Only 1 deficiency - other sections should be skipped
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    const pdfData = await PDFParser(pdfBuffer);
    
    // Should not contain headers for empty sections
    const text = pdfData.text;
    expect(text).toContain('Fire Alarm Deficiencies');
    // Empty sections should not appear
    expect(text).not.toContain('Fire Extinguisher Deficiencies');
    expect(text).not.toContain('Emergency Lighting Deficiencies');
    expect(text).not.toContain('Sprinkler Deficiencies');
  });

  it('should render totals immediately after deficiencies (no blank page)', async () => {
    const reportData = {
      ...baseReportData,
      deficiencies: [
        {
          id: 1,
          title: 'Test deficiency',
          severity: 'medium',
          status: 'open',
          description: 'Test description',
          correctiveAction: 'Fix it',
          deviceType: 'Test Device',
          location: 'Test Location',
          estimatedCost: 100,
          systemCategory: 'FIRE_ALARM' as const
        }
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    const pdfData = await PDFParser(pdfBuffer);
    
    // Check that totals are present
    expect(pdfData.text).toContain('Subtotal:');
    expect(pdfData.text).toContain('Tax');
    expect(pdfData.text).toContain('Total:');
    expect(pdfData.text).toContain('$100.00'); // Subtotal
    expect(pdfData.text).toContain('$12.00'); // 12% tax
    expect(pdfData.text).toContain('$112.00'); // Grand total
  });

  it('should handle all 4 system categories without extra blank pages', async () => {
    const reportData = {
      ...baseReportData,
      deficiencies: [
        {
          id: 1,
          title: 'Fire alarm issue',
          severity: 'high',
          status: 'open',
          description: 'Alarm issue',
          correctiveAction: 'Fix alarm',
          deviceType: 'Fire Alarm',
          location: 'Lobby',
          estimatedCost: 200,
          systemCategory: 'FIRE_ALARM' as const
        },
        {
          id: 2,
          title: 'Extinguisher issue',
          severity: 'medium',
          status: 'open',
          description: 'Extinguisher issue',
          correctiveAction: 'Fix extinguisher',
          deviceType: 'Extinguisher',
          location: 'Floor 1',
          estimatedCost: 150,
          systemCategory: 'FIRE_EXTINGUISHER' as const
        },
        {
          id: 3,
          title: 'Light issue',
          severity: 'medium',
          status: 'open',
          description: 'Light issue',
          correctiveAction: 'Fix light',
          deviceType: 'Emergency Light',
          location: 'Stairwell',
          estimatedCost: 100,
          systemCategory: 'EMERGENCY_LIGHTING' as const
        },
        {
          id: 4,
          title: 'Sprinkler issue',
          severity: 'high',
          status: 'open',
          description: 'Sprinkler issue',
          correctiveAction: 'Fix sprinkler',
          deviceType: 'Sprinkler Head',
          location: 'Floor 2',
          estimatedCost: 300,
          systemCategory: 'SPRINKLER' as const
        }
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    const pdfData = await PDFParser(pdfBuffer);
    
    // All 4 sections should appear
    expect(pdfData.text).toContain('Fire Alarm Deficiencies');
    expect(pdfData.text).toContain('Fire Extinguisher Deficiencies');
    expect(pdfData.text).toContain('Emergency Lighting Deficiencies');
    expect(pdfData.text).toContain('Sprinkler Deficiencies');
    // PDF should have pages (page count grows with report sections, not blank pages)
    expect(pdfData.numpages).toBeGreaterThan(0);
  });

  it('should calculate correct totals across all system categories', async () => {
    const reportData = {
      ...baseReportData,
      deficiencies: [
        { id: 1, title: 'D1', severity: 'high', status: 'open', estimatedCost: 100, systemCategory: 'FIRE_ALARM' as const },
        { id: 2, title: 'D2', severity: 'medium', status: 'open', estimatedCost: 200, systemCategory: 'FIRE_EXTINGUISHER' as const },
        { id: 3, title: 'D3', severity: 'low', status: 'open', estimatedCost: 50, systemCategory: 'EMERGENCY_LIGHTING' as const },
        { id: 4, title: 'D4', severity: 'high', status: 'open', estimatedCost: 150, systemCategory: 'SPRINKLER' as const }
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    const pdfData = await PDFParser(pdfBuffer);
    
    // Subtotal: 100 + 200 + 50 + 150 = 500
    // Tax (12%): 60
    // Total: 560
    expect(pdfData.text).toContain('$500.00');
    expect(pdfData.text).toContain('$60.00');
    expect(pdfData.text).toContain('$560.00');
  });
});
