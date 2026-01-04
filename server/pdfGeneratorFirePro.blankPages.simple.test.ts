import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';

describe('Deficiency Report PDF - Blank Pages Fix (Simplified)', () => {
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

  it('should generate PDF with 3 deficiencies without errors', async () => {
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
    
    // PDF should start with %PDF header
    const pdfHeader = pdfBuffer.toString('utf8', 0, 4);
    expect(pdfHeader).toBe('%PDF');
  });

  it('should generate PDF with only 1 deficiency (empty sections skipped)', async () => {
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
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF with all 4 system categories', async () => {
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
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('should handle missing locations in admin override mode', async () => {
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
          location: undefined, // Missing location
          estimatedCost: 100,
          systemCategory: 'FIRE_ALARM' as const
        }
      ],
      missingLocationDeficiencies: [
        { id: 1, description: 'Test deficiency', severity: 'medium' }
      ]
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF with 10 deficiencies without errors', async () => {
    const deficiencies = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Deficiency ${i + 1}`,
      severity: 'medium',
      status: 'open',
      description: `Description for deficiency ${i + 1}`,
      correctiveAction: `Fix deficiency ${i + 1}`,
      deviceType: 'Test Device',
      location: `Location ${i + 1}`,
      estimatedCost: 100,
      systemCategory: (['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER'][i % 4]) as any
    }));

    const reportData = {
      ...baseReportData,
      deficiencies
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });
});
