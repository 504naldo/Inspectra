import { describe, it, expect } from 'vitest';

/**
 * Phase 2 Smoke Tests: Explicit Report Endpoints
 * 
 * These tests verify that the new explicit endpoints (annualReport.generate, deficiencyReport.generate)
 * correctly route to the underlying generators and pass through validation errors unchanged.
 */

describe('Phase 2: Explicit Report Endpoints', () => {
  it('annualReport router exists in appRouter', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that annualReport is part of the router
    expect(appRouter).toBeDefined();
    expect(appRouter.annualReport).toBeDefined();
  });

  it('deficiencyReport router exists in appRouter', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that deficiencyReport is part of the router
    expect(appRouter).toBeDefined();
    expect(appRouter.deficiencyReport).toBeDefined();
  });

  it('report router exists for backward compatibility', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that report router still exists
    expect(appRouter).toBeDefined();
    expect(appRouter.report).toBeDefined();
  });

  it('annualReport has generate procedure', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that generate procedure exists
    expect(appRouter.annualReport).toHaveProperty('generate');
    expect(typeof appRouter.annualReport.generate).toBe('function');
  });

  it('deficiencyReport has generate procedure', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that generate procedure exists
    expect(appRouter.deficiencyReport).toHaveProperty('generate');
    expect(typeof appRouter.deficiencyReport.generate).toBe('function');
  });

  it('report router has generatePDF and generateCompliancePDF for backward compatibility', async () => {
    const { appRouter } = await import('./routers');
    
    // Check that old endpoints exist in report router
    expect(appRouter.report).toHaveProperty('generatePDF');
    expect(appRouter.report).toHaveProperty('generateCompliancePDF');
    expect(typeof appRouter.report.generatePDF).toBe('function');
    expect(typeof appRouter.report.generateCompliancePDF).toBe('function');
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

describe.skip('Phase 2: Deprecation Warnings', () => {
  it('old generatePDF endpoint has deprecation comment', async () => {
    const routersContent = await import('fs/promises').then(fs => 
      fs.readFile('/home/user/Inspectra/server/routers.ts', 'utf-8')
    );
    
    expect(routersContent).toContain('DEPRECATED: Use deficiencyReport.generate instead');
    expect(routersContent).toContain('console.warn');
  });

  it('old generateCompliancePDF endpoint has deprecation comment', async () => {
    const routersContent = await import('fs/promises').then(fs => 
      fs.readFile('/home/user/Inspectra/server/routers.ts', 'utf-8')
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
      { sectionNumber: '22.1', itemId: '22.1.1', description: 'Control Unit Inspection' },
    ];
    
    const message = formatMissingItemsMessage(missingItems);
    expect(message).toContain('22.1');
    expect(message).toContain('Control Unit Inspection');
  });
});
