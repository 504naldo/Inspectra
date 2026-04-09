import { describe, it, expect } from 'vitest';
import { auditChecklistCompleteness, formatMissingItemsMessage } from './checklistValidation';
import type { InspectionChecklistResponse } from '../drizzle/schema';

// Full checklist structure: 122 items across 15 sections
const ALL_SECTIONS: Array<{ section: string; items: string[] }> = [
  { section: '22.1',  items: ['A','B','C','D','E','F','G','H','I','J'] },
  { section: '22.2',  items: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','BB','CC','DD'] },
  { section: '22.4',  items: ['A','B','C','D','E','F','G','H'] },
  { section: '22.5',  items: ['A','B','C','D','E','F','G','H'] },
  { section: '22.6',  items: ['A','B','C','D','E','F','G','H','I','J','K','L','M'] },
  { section: '22.7',  items: ['A','B','C','D','E','F'] },
  { section: '22.8',  items: ['A','B','C','D','E'] },
  { section: '22.9',  items: ['A','B','C','D'] },
  { section: '22.10', items: ['A','B','C','D','E','F'] },
  { section: '22.11', items: ['A','B','C','D','E'] },
  { section: '22.12', items: ['A','B','C','D','E'] },
  { section: '22.13', items: ['A','B','C','D'] },
  { section: '22.14', items: ['A','B','C','D','E','F','G','H'] },
  { section: '22.15', items: ['A','B','C','D','E'] },
  { section: '22.16', items: ['A','B','C','D','E'] },
];

const TOTAL_ITEMS = ALL_SECTIONS.reduce((sum, s) => sum + s.items.length, 0); // 122

function makeResponse(id: number, jobId: number, sectionNumber: string, itemId: string, status: 'PASS' | 'DEFICIENT' | 'NA'): InspectionChecklistResponse {
  return { id, jobId, sectionNumber, itemId, status, comment: null, createdAt: new Date(), updatedAt: new Date() };
}

function buildAllResponses(): InspectionChecklistResponse[] {
  const responses: InspectionChecklistResponse[] = [];
  for (const { section, items } of ALL_SECTIONS) {
    for (const itemId of items) {
      responses.push(makeResponse(responses.length + 1, 1, section, itemId, 'PASS'));
    }
  }
  return responses;
}

describe('Checklist Validation and Completeness Audit', () => {
  it('should detect incomplete checklist with no responses', () => {
    const responses: InspectionChecklistResponse[] = [];

    const result = auditChecklistCompleteness(responses);

    expect(result.isComplete).toBe(false);
    expect(result.totalRequired).toBe(TOTAL_ITEMS); // 122 items across 15 sections
    expect(result.totalCompleted).toBe(0);
    expect(result.completionPercentage).toBe(0);
    expect(result.missingItems.length).toBe(TOTAL_ITEMS);
  });

  it('should detect partially complete checklist', () => {
    const responses: InspectionChecklistResponse[] = [
      makeResponse(1, 1, '22.1', 'A', 'PASS'),
      makeResponse(2, 1, '22.1', 'B', 'PASS'),
      makeResponse(3, 1, '22.1', 'C', 'DEFICIENT'),
    ];

    const result = auditChecklistCompleteness(responses);

    expect(result.isComplete).toBe(false);
    expect(result.totalCompleted).toBe(3);
    expect(result.completionPercentage).toBe(Math.round((3 / TOTAL_ITEMS) * 100));
    expect(result.missingItems.length).toBe(TOTAL_ITEMS - 3);
  });

  it('should detect complete checklist with all items', () => {
    const responses = buildAllResponses();

    const result = auditChecklistCompleteness(responses);

    expect(result.isComplete).toBe(true);
    expect(result.totalRequired).toBe(TOTAL_ITEMS);
    expect(result.totalCompleted).toBe(TOTAL_ITEMS);
    expect(result.completionPercentage).toBe(100);
    expect(result.missingItems.length).toBe(0);
  });

  it('should format missing items message correctly', () => {
    const responses: InspectionChecklistResponse[] = [
      makeResponse(1, 1, '22.1', 'A', 'PASS'),
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
      makeResponse(1, 1, '22.1', 'A', 'PASS'),
      makeResponse(2, 1, '22.1', 'B', 'DEFICIENT'),
      makeResponse(3, 1, '22.1', 'C', 'NA'),
    ];

    const result = auditChecklistCompleteness(responses);

    // All statuses count as "completed" - the audit only cares that items are answered
    expect(result.totalCompleted).toBe(3);
    expect(result.missingItems.length).toBe(TOTAL_ITEMS - 3);
  });

  it('should identify specific missing items by section', () => {
    const responses: InspectionChecklistResponse[] = [];

    // Complete Section 22.1 entirely
    for (const itemId of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      responses.push(makeResponse(responses.length + 1, 1, '22.1', itemId, 'PASS'));
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
