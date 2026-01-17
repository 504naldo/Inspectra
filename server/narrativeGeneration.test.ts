import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock user context for testing
function createTestContext(role: 'admin' | 'office' | 'technician' | 'customer' = 'technician'): TrpcContext {
  return {
    user: {
      id: 1,
      openId: 'test-user',
      email: 'test@example.com',
      name: 'Test User',
      role,
      companyId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    req: {} as any,
    res: {} as any,
  };
}

describe('AI Narrative Generation', () => {

  it('should reject generation with missing location', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.ai.generateDeficiencyNarrative({
        deviceType: 'Smoke Detector',
        location: '', // Missing
        observedIssue: 'Device failed sensitivity test',
        testOutcome: 'FAIL',
      })
    ).rejects.toThrow(/Missing required fields.*location/);
  });

  it('should reject generation with "Unknown location"', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.ai.generateDeficiencyNarrative({
        deviceType: 'Smoke Detector',
        location: 'Unknown location', // Invalid
        observedIssue: 'Device failed sensitivity test',
        testOutcome: 'FAIL',
      })
    ).rejects.toThrow(/Missing required fields.*location/);
  });

  it('should reject generation with missing observed issue', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.ai.generateDeficiencyNarrative({
        deviceType: 'Smoke Detector',
        location: 'Main Lobby',
        observedIssue: '', // Missing
        testOutcome: 'FAIL',
      })
    ).rejects.toThrow(/Missing required fields.*observed issue/);
  });

  it('should reject generation with missing device type', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.ai.generateDeficiencyNarrative({
        deviceType: '', // Missing
        location: 'Main Lobby',
        observedIssue: 'Device failed sensitivity test',
        testOutcome: 'FAIL',
      })
    ).rejects.toThrow(/Missing required fields.*device type/);
  });

  it('should reject generation with multiple missing fields', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.ai.generateDeficiencyNarrative({
        deviceType: '',
        location: '',
        observedIssue: '',
        testOutcome: 'FAIL',
      })
    ).rejects.toThrow(/Missing required fields.*location.*observed issue.*device type/);
  });

  it('should generate narrative with valid inputs', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.ai.generateDeficiencyNarrative({
      deviceType: 'Smoke Detector',
      location: 'Main Lobby Ceiling',
      observedIssue: 'Device failed sensitivity test - no response to smoke',
      testOutcome: 'FAIL',
      codeReference: 'CAN/ULC-S536',
    });

    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('correctiveAction');
    expect(result).toHaveProperty('customerExplanation');
    expect(result.description).toBeTruthy();
    expect(result.correctiveAction).toBeTruthy();
    expect(result.customerExplanation).toBeTruthy();
    expect(typeof result.description).toBe('string');
    expect(typeof result.correctiveAction).toBe('string');
    expect(typeof result.customerExplanation).toBe('string');
  });

  it('should generate narrative without optional code reference', async () => {
    const ctx = createTestContext('technician');
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.ai.generateDeficiencyNarrative({
      deviceType: 'Fire Extinguisher',
      location: 'Electrical Room',
      observedIssue: 'Pressure gauge in red zone',
      testOutcome: 'FAIL',
    });

    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('correctiveAction');
    expect(result).toHaveProperty('customerExplanation');
    expect(result.description).toBeTruthy();
    expect(result.correctiveAction).toBeTruthy();
    expect(result.customerExplanation).toBeTruthy();
  });
});
