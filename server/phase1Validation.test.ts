/**
 * Phase 1 Validation Tests
 * 
 * Tests for hard validation enforcement in existing report endpoints:
 * - Checklist completeness blocking
 * - Device location enforcement
 * - Deficiency location enforcement
 */

import { describe, it, expect } from 'vitest';
import { auditChecklistCompleteness, formatMissingItemsMessage, REQUIRED_CHECKLIST_ITEMS } from './checklistValidation';
import { 
  validateFireAlarmDeviceLocations, 
  validateFireExtinguisherLocations, 
  validateEmergencyLightLocations,
  validateAnnualReportLocations,
  validateDeficiencyLocations,
  validateDeficiencyReportLocations 
} from './locationValidation';

describe('Phase 1: Hard Validation Enforcement', () => {
  
  describe('generateCompliancePDF - Checklist Completeness', () => {
    it('should block generation when checklist is incomplete', () => {
      // Test checklist validation
      // Using imported function
      
      // Simulate incomplete checklist (only 50 out of 122 items — use real item IDs)
      const incompleteResponses = REQUIRED_CHECKLIST_ITEMS.slice(0, 50).map((item: any) => ({
        sectionNumber: item.sectionNumber,
        itemId: item.itemId,
        status: 'PASS' as const,
        comment: null,
      }));
      
      const result = auditChecklistCompleteness(incompleteResponses);
      
      expect(result.isComplete).toBe(false);
      expect(result.totalRequired).toBe(122);
      expect(result.totalCompleted).toBe(50);
      expect(result.completionPercentage).toBe(41); // 50/122 = 41%
      expect(result.missingItems.length).toBeGreaterThan(0);
    });
    
    it('should provide detailed missing items list', () => {
      // Using imported functions
      
      // Empty checklist
      const result = auditChecklistCompleteness([]);
      const message = formatMissingItemsMessage(result.missingItems);
      
      expect(message).toContain('Section 22.1');
      expect(message).toContain('Section 22.2');
      expect(result.missingItems.length).toBe(122);
    });
    
    it('should pass when checklist is 100% complete', () => {
      // Using imported functions
      
      // Complete all 122 items
      const completeResponses = REQUIRED_CHECKLIST_ITEMS.map((item: any) => ({
        sectionNumber: item.sectionNumber,
        itemId: item.itemId,
        status: 'PASS' as const,
        comment: null,
      }));
      
      const result = auditChecklistCompleteness(completeResponses);
      
      expect(result.isComplete).toBe(true);
      expect(result.totalCompleted).toBe(122);
      expect(result.completionPercentage).toBe(100);
      expect(result.missingItems.length).toBe(0);
    });
  });
  
  describe('generateCompliancePDF - Device Location Validation', () => {
    it('should detect missing fire alarm device locations', () => {
      // Using imported function
      
      const devices = [
        { id: 1, deviceType: 'Smoke Detector', location: 'Room 101', identification: 'SD-001' },
        { id: 2, deviceType: 'Heat Detector', location: null, identification: 'HD-002' },
        { id: 3, deviceType: 'Pull Station', location: '', identification: 'PS-003' },
      ];
      
      const result = validateFireAlarmDeviceLocations(devices);
      
      expect(result.isValid).toBe(false);
      expect(result.missing.length).toBe(2); // IDs 2 and 3
      expect(result.missing[0].id).toBe(2);
      expect(result.missing[1].id).toBe(3);
    });
    
    it('should detect missing fire extinguisher locations', () => {
      // Using imported function
      
      const extinguishers = [
        { id: 10, location: 'Hallway A', serialNumber: 'EXT-001' },
        { id: 11, location: null, serialNumber: 'EXT-002' },
      ];
      
      const result = validateFireExtinguisherLocations(extinguishers);
      
      expect(result.isValid).toBe(false);
      expect(result.missing.length).toBe(1);
      expect(result.missing[0].id).toBe(11);
    });
    
    it('should detect missing emergency light locations', () => {
      // Using imported function
      
      const lights = [
        { id: 20, location: 'Exit Door 1', identification: 'EL-001' },
        { id: 21, location: '', identification: 'EL-002' },
      ];
      
      const result = validateEmergencyLightLocations(lights);
      
      expect(result.isValid).toBe(false);
      expect(result.missing.length).toBe(1);
    });
    
    it('should pass when all device locations are present', () => {
      // Using imported function
      
      const result = validateAnnualReportLocations({
        fireAlarmDevices: [
          { id: 1, deviceType: 'Smoke', location: 'Room 1', identification: 'SD-1' },
        ],
        fireExtinguishers: [
          { id: 10, location: 'Hall A', serialNumber: 'EXT-1' },
        ],
        emergencyLights: [
          { id: 20, location: 'Exit 1', identification: 'EL-1' },
        ],
      });
      
      expect(result.isValid).toBe(true);
      expect(result.totalMissing).toBe(0);
    });
  });
  
  describe('generatePDF - Deficiency Location Validation', () => {
    it('should detect missing deficiency locations', () => {
      // Using imported function
      
      const deficiencies = [
        { id: 100, description: 'Smoke detector not responding', severity: 'critical', location: 'Room 101' },
        { id: 101, description: 'Fire extinguisher expired', severity: 'major', location: null },
        { id: 102, description: 'Emergency light not working', severity: 'minor', location: '' },
      ];
      
      const result = validateDeficiencyLocations(deficiencies);
      
      expect(result.isValid).toBe(false);
      expect(result.missing.length).toBe(2); // IDs 101 and 102
    });
    
    it('should pass when all deficiency locations are present', () => {
      // Using imported function
      
      const deficiencies = [
        { id: 100, description: 'Issue 1', severity: 'critical', location: 'Room 101' },
        { id: 101, description: 'Issue 2', severity: 'major', location: 'Hallway A' },
      ];
      
      const result = validateDeficiencyReportLocations(deficiencies);
      
      expect(result.isValid).toBe(true);
      expect(result.totalMissing).toBe(0);
    });
  });
  
  describe('Error Response Payloads', () => {
    it('should format checklist incomplete error correctly', () => {
      // Using imported function
      
      const missingItems = [
        { sectionNumber: '22.1', itemId: 'A', description: 'Control unit location verified' },
        { sectionNumber: '22.2', itemId: 'B', description: 'Alarm signal operates' },
      ];
      
      const message = formatMissingItemsMessage(missingItems);
      
      expect(message).toContain('Section 22.1');
      expect(message).toContain('- A:');
      expect(message).toContain('Control unit location verified');
    });
    
    it('should format device location error correctly', () => {
      const missingDevices = [
        { id: 1, type: 'Fire Alarm Device', deviceType: 'Smoke Detector', identification: 'SD-001' },
        { id: 2, type: 'Fire Extinguisher', identification: 'EXT-002' },
      ];
      
      const missingList = missingDevices
        .map(d => `  - ${d.type} (ID: ${d.id}${d.identification ? `, ${d.identification}` : ''}${d.deviceType ? `, Type: ${d.deviceType}` : ''})`)
        .join('\\n');
      
      expect(missingList).toContain('Fire Alarm Device (ID: 1, SD-001, Type: Smoke Detector)');
      expect(missingList).toContain('Fire Extinguisher (ID: 2, EXT-002)');
    });
    
    it('should format deficiency location error correctly', () => {
      const missingDeficiencies = [
        { id: 100, description: 'Smoke detector not responding to test', severity: 'critical' },
      ];
      
      const missingList = missingDeficiencies
        .map(d => `  - Deficiency #${d.id}: ${d.description.substring(0, 60)}${d.description.length > 60 ? '...' : ''} (${d.severity})`)
        .join('\\n');
      
      expect(missingList).toContain('Deficiency #100');
      expect(missingList).toContain('Smoke detector not responding to test');
      expect(missingList).toContain('critical');
    });
  });
});
