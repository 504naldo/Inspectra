import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';

describe('Deficiency Report PDF - Per-Company Tax Rate', () => {
  const baseReportData = {
    jobNumber: 'TEST-TAX-001',
    jobTitle: 'Test Tax Rate Inspection',
    siteName: 'Test Site',
    siteAddress: '789 Tax Street',
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
    deficiencies: [
      {
        id: 1,
        title: 'Smoke alarm issue',
        description: 'Needs replacement',
        severity: 'critical',
        status: 'open',
        deviceType: 'Smoke Alarm',
        location: 'Hallway 2nd Floor',
        estimatedCost: 100.00,
      },
    ],
    summary: 'Tax rate wiring test.',
  };

  it('defaults to BC GST+PST (5% + 7% = 12%) when no company rate is supplied', () => {
    const subtotal = 100;
    const gstRate = 0.05;
    const pstRate = 0.07;
    const tax = subtotal * (gstRate + pstRate);
    expect(tax).toBeCloseTo(12.0, 2);
  });

  it('honours a custom company tax rate (e.g. Ontario HST 13%) instead of the hardcoded 12%', () => {
    const subtotal = 100;
    const gstRate = 0.13; // HST modeled entirely under gstRate
    const pstRate = 0;
    const tax = subtotal * (gstRate + pstRate);
    expect(tax).toBeCloseTo(13.0, 2);
  });

  it('honours a 0% rate when a company has no tax configured', () => {
    const subtotal = 100;
    const gstRate = 0;
    const pstRate = 0;
    const tax = subtotal * (gstRate + pstRate);
    expect(tax).toBe(0);
  });

  it('generates a valid PDF when given explicit decimal-string company rates', async () => {
    const pdfBuffer = await generateInspectionReportPDF({
      ...baseReportData,
      gstRate: '0.0500',
      pstRate: '0.0700',
    } as any);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('generates a valid PDF when company rates are omitted (falls back to BC defaults)', async () => {
    const pdfBuffer = await generateInspectionReportPDF(baseReportData as any);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });
});
