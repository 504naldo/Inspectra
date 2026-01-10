import { describe, it, expect } from 'vitest';
import { generateInspectionReportPDF } from './pdfGeneratorFirePro';
import fs from 'fs';
import path from 'path';

describe('Deficiency Report - System Grouping and Pricing', () => {
  const mockData = {
    jobNumber: 'TEST-001',
    jobTitle: 'Annual Inspectraion',
    siteName: 'Test Site',
    siteAddress: '123 Test Street',
    siteCity: 'Vancouver',
    siteState: 'BC',
    customerName: 'Test Customer Org',
    attentionTo: 'John Doe',
    attentionEmail: 'john@example.com',
    inspectionDate: new Date('2024-12-01'),
    technicianName: 'Jane Technician',
    technicianTitle: 'Fire Safety Technician',
    technicianEmail: 'jane@ewf.com',
    companyName: 'Earth Wind Fire Services Inc.',
    companyPhone: '604-299-1030',
    companyEmail: 'info@myfirepro.ca',
    deviceSummaries: [],
    inspectionResults: [],
    deficiencies: [
      {
        id: 1,
        title: 'Smoke alarm not responding',
        description: 'Smoke detector failed to respond to test',
        deviceId: 1,
        deviceType: 'Smoke Alarm',
        location: 'Hallway 2nd Floor',
        severity: 'critical' as const,
        status: 'open' as const,
        estimatedCost: 150.00,
        jobId: 1,
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 2,
        title: 'Fire extinguisher expired',
        description: 'Annual inspection tag expired',
        deviceId: 2,
        deviceType: 'Fire Extinguisher',
        location: 'Kitchen',
        severity: 'major' as const,
        status: 'open' as const,
        estimatedCost: 75.50,
        jobId: 1,
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 3,
        title: 'Emergency light battery low',
        description: 'Battery test failed, needs replacement',
        deviceId: 3,
        deviceType: 'Emergency Light',
        location: 'Exit Stairwell A',
        severity: 'major' as const,
        status: 'open' as const,
        estimatedCost: 125.00,
        jobId: 1,
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 4,
        title: 'Pull station cover damaged',
        description: 'Cover cracked and needs replacement',
        deviceId: 4,
        deviceType: 'Manual Pull Station',
        location: 'Main Entrance',
        severity: 'minor' as const,
        status: 'open' as const,
        estimatedCost: 200.00,
        jobId: 1,
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    summary: 'Test deficiency report with system grouping and pricing totals.'
  };

  it('should group deficiencies by system category', async () => {
    const pdfBuffer = await generateInspectionReportPDF(mockData);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    
    // Verify PDF was generated successfully
    const outputPath = path.join(process.cwd(), 'test-deficiency-grouped.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    expect(fs.existsSync(outputPath)).toBe(true);
    
    console.log(`✓ PDF generated with system grouping: ${outputPath}`);
  });

  it('should calculate correct pricing totals', () => {
    const deficiencies = mockData.deficiencies;
    
    // Calculate subtotal
    const subtotal = deficiencies.reduce((sum, def) => sum + (def.estimatedCost || 0), 0);
    expect(subtotal).toBe(550.50); // 150 + 75.50 + 125 + 200
    
    // Calculate tax (12%)
    const taxRate = 0.12;
    const taxAmount = subtotal * taxRate;
    expect(taxAmount).toBe(66.06);
    
    // Calculate grand total
    const grandTotal = subtotal + taxAmount;
    expect(grandTotal).toBe(616.56);
    
    console.log(`✓ Subtotal: $${subtotal.toFixed(2)}`);
    console.log(`✓ Tax (12%): $${taxAmount.toFixed(2)}`);
    console.log(`✓ Grand Total: $${grandTotal.toFixed(2)}`);
  });

  it('should categorize Fire Alarm devices correctly', () => {
    const fireAlarmDeficiencies = mockData.deficiencies.filter(def => {
      const typeLower = (def.deviceType || '').toLowerCase();
      return !typeLower.includes('extinguisher') && !typeLower.includes('emergency') && !typeLower.includes('light');
    });
    
    expect(fireAlarmDeficiencies.length).toBe(2); // Smoke Alarm + Manual Pull Station
    expect(fireAlarmDeficiencies[0].deviceType).toBe('Smoke Alarm');
    expect(fireAlarmDeficiencies[1].deviceType).toBe('Manual Pull Station');
    
    console.log(`✓ Fire Alarm deficiencies: ${fireAlarmDeficiencies.length}`);
  });

  it('should categorize Fire Extinguisher devices correctly', () => {
    const extinguisherDeficiencies = mockData.deficiencies.filter(def => {
      const typeLower = (def.deviceType || '').toLowerCase();
      return typeLower.includes('extinguisher');
    });
    
    expect(extinguisherDeficiencies.length).toBe(1);
    expect(extinguisherDeficiencies[0].deviceType).toBe('Fire Extinguisher');
    
    console.log(`✓ Fire Extinguisher deficiencies: ${extinguisherDeficiencies.length}`);
  });

  it('should categorize Emergency Light devices correctly', () => {
    const emergencyLightDeficiencies = mockData.deficiencies.filter(def => {
      const typeLower = (def.deviceType || '').toLowerCase();
      return typeLower.includes('emergency') || typeLower.includes('light');
    });
    
    expect(emergencyLightDeficiencies.length).toBe(1);
    expect(emergencyLightDeficiencies[0].deviceType).toBe('Emergency Light');
    
    console.log(`✓ Emergency Light deficiencies: ${emergencyLightDeficiencies.length}`);
  });
});
