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

  it('should generate PDF when AI summary narrative is provided', async () => {
    const reportData = {
      ...baseReportData,
      summary: [
        'Inspection completed for all required systems.',
        '',
        'System Status: Deficiencies identified requiring corrective action.',
        '',
        'Priority Items:',
        '• Replace failed smoke detector in corridor.',
        '• Service sprinkler supervisory switch in electrical room.',
      ].join('\n'),
      deficiencies: [
        {
          id: 1,
          title: 'Smoke detector failed',
          severity: 'major',
          status: 'open',
          description: 'Detector did not alarm during functional test.',
          correctiveAction: 'Replace detector and re-test circuit.',
          deviceType: 'Smoke Detector',
          location: 'Main Corridor',
          estimatedCost: 180,
          systemCategory: 'FIRE_ALARM' as const,
        },
      ],
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('should generate PDF with AI summary even when there are no deficiencies', async () => {
    const reportData = {
      ...baseReportData,
      summary: 'Executive Summary:\n• All inspected devices passed.\nSystem Status: Satisfactory.',
      deficiencies: [],
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  // Regression: the footer loop wrote each footer at y≈764 (below the 70pt bottom
  // margin), which made PDFKit auto-append a blank page per content page — a
  // report doubled to ~2x its real length with trailing blanks. The prior tests
  // only checked buffer.length > 0 and never counted pages, so it slipped through.
  it('does not append trailing blank pages on a multi-page report', async () => {
    const countPages = (buf: Buffer) =>
      (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    const reportData = {
      ...baseReportData,
      summary: 'Annual inspection completed with several deficiencies across systems.',
      deviceSummaries: [
        { deviceType: 'Fire Alarm Devices', total: 38, passed: 36, failed: 2, na: 0 },
        { deviceType: 'Smoke Alarms', total: 24, passed: 22, failed: 1, na: 1 },
        { deviceType: 'Fire Extinguishers', total: 12, passed: 11, failed: 1, na: 0 },
        { deviceType: 'Emergency Lighting', total: 18, passed: 17, failed: 0, na: 1 },
      ],
      inspectionResults: Array.from({ length: 8 }, (_, i) => ({
        deviceId: i + 1, deviceType: 'Smoke Detector', location: `Level ${i + 1} Corridor`,
        result: i % 4 === 0 ? 'fail' : 'pass', notes: 'Functional test performed.',
      })),
      deficiencies: Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, title: `Deficiency ${i + 1} requiring corrective action`,
        severity: (['critical', 'major', 'minor'] as const)[i % 3], status: 'open',
        description: 'Observed during the annual inspection; see corrective action.',
        correctiveAction: 'Repair or replace the affected device and re-verify operation.',
        location: `Level ${i + 1}`, estimatedCost: '120.00',
        systemCategory: (['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING'] as const)[i % 3],
      })),
    };

    const pdfBuffer = await generateInspectionReportPDF(reportData);
    const pages = countPages(pdfBuffer);
    // This content renders in well under a dozen pages; the pre-fix footer bug
    // doubled it (22+). A ceiling of 14 catches the regression with headroom.
    expect(pages).toBeGreaterThan(3);
    expect(pages).toBeLessThanOrEqual(14);
  });
});
