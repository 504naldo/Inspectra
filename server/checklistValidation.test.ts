import { describe, it, expect } from 'vitest';
import { auditChecklistCompleteness, formatMissingItemsMessage } from './checklistValidation';
import type { InspectionChecklistResponse } from '../drizzle/schema';

describe('Checklist Validation and Completeness Audit', () => {
  it('should detect incomplete checklist with no responses', () => {
    const responses: InspectionChecklistResponse[] = [];
    
    const result = auditChecklistCompleteness(responses);
    
    expect(result.isComplete).toBe(false);
    expect(result.totalRequired).toBe(69); // 10 + 30 + 8 + 8 + 13
    expect(result.totalCompleted).toBe(0);
    expect(result.completionPercentage).toBe(0);
    expect(result.missingItems.length).toBe(69);
  });
  
  it('should detect partially complete checklist', () => {
    const responses: InspectionChecklistResponse[] = [
      {
        id: 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'A',
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'B',
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'C',
        status: 'DEFICIENT',
        comment: 'Needs attention',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    
    const result = auditChecklistCompleteness(responses);
    
    expect(result.isComplete).toBe(false);
    expect(result.totalCompleted).toBe(3);
    expect(result.completionPercentage).toBe(4); // 3/69 ≈ 4%
    expect(result.missingItems.length).toBe(66);
  });
  
  it('should detect complete checklist with all 69 items', () => {
    const responses: InspectionChecklistResponse[] = [];
    
    // Section 22.1: 10 items
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.2: 30 items
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'BB', 'CC', 'DD']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.2',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.4: 8 items
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.4',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.5: 8 items
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.5',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.6: 13 items
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.6',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    const result = auditChecklistCompleteness(responses);
    
    expect(result.isComplete).toBe(true);
    expect(result.totalRequired).toBe(69);
    expect(result.totalCompleted).toBe(69);
    expect(result.completionPercentage).toBe(100);
    expect(result.missingItems.length).toBe(0);
  });
  
  it('should format missing items message correctly', () => {
    const responses: InspectionChecklistResponse[] = [
      {
        id: 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'A',
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    
    const result = auditChecklistCompleteness(responses);
    const message = formatMissingItemsMessage(result.missingItems);
    
    expect(message).toContain('Incomplete checklist items:');
    expect(message).toContain('Section 22.1:');
    expect(message).toContain('Section 22.2:');
    expect(message).toContain('Section 22.4:');
    expect(message).toContain('Section 22.5:');
    expect(message).toContain('Section 22.6:');
  });
  
  it('should handle mix of PASS, DEFICIENT, and NA statuses', () => {
    const responses: InspectionChecklistResponse[] = [
      {
        id: 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'A',
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'B',
        status: 'DEFICIENT',
        comment: 'Requires repair',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: 'C',
        status: 'NA',
        comment: 'Not applicable to this system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    
    const result = auditChecklistCompleteness(responses);
    
    // All statuses count as "completed" - the audit only cares that items are answered
    expect(result.totalCompleted).toBe(3);
    expect(result.missingItems.length).toBe(66);
  });
  
  it('should identify specific missing items by section', () => {
    const responses: InspectionChecklistResponse[] = [];
    
    // Complete Section 22.1 entirely
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      responses.push({
        id: responses.length + 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    const result = auditChecklistCompleteness(responses);
    
    // Section 22.1 should have no missing items
    const section221Missing = result.missingItems.filter(m => m.sectionNumber === '22.1');
    expect(section221Missing.length).toBe(0);
    
    // Other sections should have missing items
    const section222Missing = result.missingItems.filter(m => m.sectionNumber === '22.2');
    expect(section222Missing.length).toBe(30);
    
    const section224Missing = result.missingItems.filter(m => m.sectionNumber === '22.4');
    expect(section224Missing.length).toBe(8);
  });
});
