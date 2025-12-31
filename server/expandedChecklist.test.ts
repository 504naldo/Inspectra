import { describe, it, expect } from 'vitest';
import { auditChecklistCompleteness } from './checklistValidation';
import type { InspectionChecklistResponse } from '../drizzle/schema';

describe('Expanded CAN/ULC-S536 Checklist Coverage (122 items)', () => {
  it('should require all 122 checklist items across 15 sections', () => {
    const audit = auditChecklistCompleteness([]);
    
    expect(audit.totalRequired).toBe(122);
    expect(audit.totalCompleted).toBe(0);
    expect(audit.completionPercentage).toBe(0);
    expect(audit.isComplete).toBe(false);
    expect(audit.missingItems.length).toBe(122);
  });
  
  it('should include items from all 15 sections (22.1, 22.2, 22.4-22.16)', () => {
    const audit = auditChecklistCompleteness([]);
    
    const sections = new Set(audit.missingItems.map(item => item.sectionNumber));
    
    expect(sections.has('22.1')).toBe(true); // Control Unit Inspection
    expect(sections.has('22.2')).toBe(true); // Control Unit Test
    expect(sections.has('22.4')).toBe(true); // Power Supply
    expect(sections.has('22.5')).toBe(true); // Emergency Power
    expect(sections.has('22.6')).toBe(true); // Annunciator
    expect(sections.has('22.7')).toBe(true); // Circuit Supervision
    expect(sections.has('22.8')).toBe(true); // Smoke Detectors
    expect(sections.has('22.9')).toBe(true); // Heat Detectors
    expect(sections.has('22.10')).toBe(true); // Duct Detectors
    expect(sections.has('22.11')).toBe(true); // Manual Pull Stations
    expect(sections.has('22.12')).toBe(true); // Waterflow Devices
    expect(sections.has('22.13')).toBe(true); // Supervisory Devices
    expect(sections.has('22.14')).toBe(true); // Fire Signal Receiving Centre
    expect(sections.has('22.15')).toBe(true); // Audible Signaling
    expect(sections.has('22.16')).toBe(true); // Visual Signaling
    
    expect(sections.size).toBe(15); // 15 unique sections (22.1, 22.2, 22.4-22.16)
  });
  
  it('should detect partial completion with mix of old and new sections', () => {
    const responses: InspectionChecklistResponse[] = [
      // Complete section 22.1 (10 items)
      ...Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: String.fromCharCode(65 + i), // A, B, C...
        status: 'PASS' as const,
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      // Complete section 22.7 (6 items)
      ...Array.from({ length: 6 }, (_, i) => ({
        id: i + 11,
        jobId: 1,
        sectionNumber: '22.7',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS' as const,
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      // Complete section 22.15 (5 items)
      ...Array.from({ length: 5 }, (_, i) => ({
        id: i + 17,
        jobId: 1,
        sectionNumber: '22.15',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS' as const,
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    ];
    
    const audit = auditChecklistCompleteness(responses);
    
    expect(audit.totalRequired).toBe(122);
    expect(audit.totalCompleted).toBe(21); // 10 + 6 + 5
    expect(audit.completionPercentage).toBe(17); // 21/122 ≈ 17.2%
    expect(audit.isComplete).toBe(false);
    expect(audit.missingItems.length).toBe(101); // 122 - 21
  });
  
  it('should detect complete checklist with all 122 items', () => {
    // Create responses for all 122 items
    const responses: InspectionChecklistResponse[] = [];
    let id = 1;
    
    // Section 22.1: 10 items (A-J)
    for (let i = 0; i < 10; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.1',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.2: 30 items (A-Z, AA-DD)
    for (let i = 0; i < 26; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.2',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    ['AA', 'BB', 'CC', 'DD'].forEach(itemId => {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.2',
        itemId,
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    
    // Section 22.4: 8 items (A-H)
    for (let i = 0; i < 8; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.4',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.5: 8 items (A-H)
    for (let i = 0; i < 8; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.5',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.6: 13 items (A-M)
    for (let i = 0; i < 13; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.6',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.7: 6 items (A-F)
    for (let i = 0; i < 6; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.7',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.8: 5 items (A-E)
    for (let i = 0; i < 5; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.8',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.9: 4 items (A-D)
    for (let i = 0; i < 4; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.9',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.10: 6 items (A-F)
    for (let i = 0; i < 6; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.10',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.11: 5 items (A-E)
    for (let i = 0; i < 5; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.11',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.12: 5 items (A-E)
    for (let i = 0; i < 5; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.12',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.13: 4 items (A-D)
    for (let i = 0; i < 4; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.13',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.14: 8 items (A-H)
    for (let i = 0; i < 8; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.14',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.15: 5 items (A-E)
    for (let i = 0; i < 5; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.15',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    // Section 22.16: 5 items (A-E)
    for (let i = 0; i < 5; i++) {
      responses.push({
        id: id++,
        jobId: 1,
        sectionNumber: '22.16',
        itemId: String.fromCharCode(65 + i),
        status: 'PASS',
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    const audit = auditChecklistCompleteness(responses);
    
    expect(audit.totalRequired).toBe(122);
    expect(audit.totalCompleted).toBe(122);
    expect(audit.completionPercentage).toBe(100);
    expect(audit.isComplete).toBe(true);
    expect(audit.missingItems.length).toBe(0);
  });
  
  it('should verify new sections have correct item counts', () => {
    const audit = auditChecklistCompleteness([]);
    
    const countBySection = new Map<string, number>();
    audit.missingItems.forEach(item => {
      const count = countBySection.get(item.sectionNumber) || 0;
      countBySection.set(item.sectionNumber, count + 1);
    });
    
    expect(countBySection.get('22.1')).toBe(10);
    expect(countBySection.get('22.2')).toBe(30);
    expect(countBySection.get('22.4')).toBe(8);
    expect(countBySection.get('22.5')).toBe(8);
    expect(countBySection.get('22.6')).toBe(13);
    expect(countBySection.get('22.7')).toBe(6);
    expect(countBySection.get('22.8')).toBe(5);
    expect(countBySection.get('22.9')).toBe(4);
    expect(countBySection.get('22.10')).toBe(6);
    expect(countBySection.get('22.11')).toBe(5);
    expect(countBySection.get('22.12')).toBe(5);
    expect(countBySection.get('22.13')).toBe(4);
    expect(countBySection.get('22.14')).toBe(8);
    expect(countBySection.get('22.15')).toBe(5);
    expect(countBySection.get('22.16')).toBe(5);
    
    // Total: 10+30+8+8+13+6+5+4+6+5+5+4+8+5+5 = 122
  });
});
