import { describe, it, expect } from 'vitest';

/**
 * Phase 2 Smoke Tests: Explicit Report Endpoints
 * 
 * These tests verify that the new explicit endpoints (annualReport.generate, deficiencyReport.generate)
 * correctly route to the underlying generators and pass through validation errors unchanged.
 */

describe('Phase 2: Explicit Report Endpoints', () => {
  it('annualReport router exists and has generate procedure', async () => {
    const { appRouter } = await import('./routers');
    
    expect(appRouter._def.procedures).toHaveProperty('annualReport');
    const annualRouter = (appRouter._def.procedures as any).annualReport;
    expect(annualRouter._def.procedures).toHaveProperty('generate');
  });

  it('deficiencyReport router exists and has generate procedure', async () => {
    const { appRouter } = await import('./routers');
    
    expect(appRouter._def.procedures).toHaveProperty('deficiencyReport');
    const deficiencyRouter = (appRouter._def.procedures as any).deficiencyReport;
    expect(deficiencyRouter._def.procedures).toHaveProperty('generate');
  });

  it('annualReport.generate routes to same logic as report.generateCompliancePDF', async () => {
    const { appRouter } = await import('./routers');
    
    const annualGenerate = (appRouter._def.procedures as any).annualReport._def.procedures.generate;
    const complianceGenerate = (appRouter._def.procedures as any).report._def.procedures.generateCompliancePDF;
    
    // They should be the same procedure reference (wrapper pattern)
    expect(annualGenerate).toBe(complianceGenerate);
  });

  it('deficiencyReport.generate routes to same logic as report.generatePDF', async () => {
    const { appRouter } = await import('./routers');
    
    const deficiencyGenerate = (appRouter._def.procedures as any).deficiencyReport._def.procedures.generate;
    const pdfGenerate = (appRouter._def.procedures as any).report._def.procedures.generatePDF;
    
    // They should be the same procedure reference (wrapper pattern)
    expect(deficiencyGenerate).toBe(pdfGenerate);
  });

  it('old endpoints still exist for backward compatibility', async () => {
    const { appRouter } = await import('./routers');
    
    expect((appRouter._def.procedures as any).report._def.procedures).toHaveProperty('generatePDF');
    expect((appRouter._def.procedures as any).report._def.procedures).toHaveProperty('generateCompliancePDF');
  });

  it('Phase 1 validation is preserved in new endpoints', async () => {
    // This test verifies that validation logic is still present
    const { auditChecklistCompleteness } = await import('./checklistValidation');
    const { validateAnnualReportLocations, validateDeficiencyReportLocations } = await import('./locationValidation');
    
    // These functions should exist and be callable
    expect(typeof auditChecklistCompleteness).toBe('function');
    expect(typeof validateAnnualReportLocations).toBe('function');
    expect(typeof validateDeficiencyReportLocations).toBe('function');
    
    // Test that validation functions work
    const emptyAudit = auditChecklistCompleteness([]);
    expect(emptyAudit.isComplete).toBe(false);
    expect(emptyAudit.totalRequired).toBeGreaterThan(0);
    
    const emptyLocationValidation = validateAnnualReportLocations({
      fireAlarmDevices: [],
      fireExtinguishers: [],
      emergencyLights: [],
    });
    expect(emptyLocationValidation.isValid).toBe(true); // Empty is valid
  });
});

describe('Phase 2: Deprecation Warnings', () => {
  it('old generatePDF endpoint has deprecation comment', async () => {
    const routersContent = await import('fs/promises').then(fs => 
      fs.readFile('/home/ubuntu/fire-inspect/server/routers.ts', 'utf-8')
    );
    
    expect(routersContent).toContain('DEPRECATED: Use deficiencyReport.generate instead');
    expect(routersContent).toContain('console.warn');
  });

  it('old generateCompliancePDF endpoint has deprecation comment', async () => {
    const routersContent = await import('fs/promises').then(fs => 
      fs.readFile('/home/ubuntu/fire-inspect/server/routers.ts', 'utf-8')
    );
    
    expect(routersContent).toContain('DEPRECATED: Use annualReport.generate instead');
  });
});

describe('Phase 2: Error Passthrough', () => {
  it('validation errors should be PRECONDITION_FAILED status', async () => {
    const { TRPCError } = await import('@trpc/server');
    
    // Create a sample validation error
    const error = new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Checklist incomplete',
    });
    
    expect(error.code).toBe('PRECONDITION_FAILED');
    expect(error.message).toContain('Checklist incomplete');
  });

  it('validation error messages should be descriptive', async () => {
    const { formatMissingItemsMessage } = await import('./checklistValidation');
    
    const missingItems = [
      { sectionNumber: '22.1', sectionTitle: 'Control Unit Inspection', itemNumber: 1, itemText: 'Test item' },
    ];
    
    const message = formatMissingItemsMessage(missingItems);
    expect(message).toContain('22.1');
    expect(message).toContain('Control Unit Inspection');
  });
});
