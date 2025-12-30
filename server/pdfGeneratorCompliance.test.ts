import { describe, it, expect } from 'vitest';
import { generateComplianceReportPDF } from './pdfGeneratorCompliance';
import * as checklists from './complianceChecklists';
import fs from 'fs';
import path from 'path';

describe('CAN/ULC-S536 Compliance PDF Generator', () => {
  it('should generate a compliance PDF with cover page', async () => {
    const testData = {
      workOrderNumber: '#0313-2025ANNUAL',
      dateOfService: new Date('2025-01-15'),
      inspectionFrequency: 'Annual' as const,
      contactPerson: 'John Smith',
      contactPhone: '778-320-2245',
      buildingName: 'THE STANTON',
      buildingAddress: '2089 WEST 43RD AVENUE',
      city: 'VANCOUVER',
      postalCode: 'V6M 2B7',
      pmOrOwner: 'Property Management Inc',
      ownerPhone: '604-555-1234',
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: true,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: true,
        emergencyLighting: true,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'EDWARDS EST 3X',
      systemOperation: 'Single Stage' as const,
      fireSignalReceivingCentre: 'BARTEC',
      connectedToFireSignalReceivingCentre: true,
      systemFullyFunctional: false,
      deficienciesIdentified: true,
      deficienciesCorrectedDate: undefined,
      recommendationsIdentified: true,
      
      technicianName: 'Lester Abril',
      technicianCertificateNumber: '1448',
      secondaryTechnicianName: 'Alexander Smith',
      secondaryTechnicianCertificateNumber: '1449',
      companyName: 'Earth Wind and Fire',
      companyPhone: '604-299-1030',
      
      checklists: [
        checklists.getControlUnitInspectionChecklist('LOBBY', 'EDWARDS EST 3X'),
        checklists.getControlUnitTestChecklist('LOBBY', 'EDWARDS EST 3X', { DD: 'NO' }, 'CRU BUZZERS DIDN\'T WORK TROUBLE SHOOTING REQUIRED'),
        checklists.getPowerSupplyInspectionChecklist('LOBBY', 'EDWARDS EST 3X', 'P1 ELECTRICAL RM', '#24'),
        checklists.getEmergencyPowerSupplyChecklist('LOBBY', 'EDWARDS', 27.33, 0.15, 25.62, 0.39, 24.775, 4.71),
        checklists.getAnnunciatorTestChecklist('LOBBY', 'EDWARDS', { C: 'NO' }, 'CRU DEVICES NOT LISTED IN THE LED ANNUNCIATOR'),
      ],
      
      fireAlarmDevices: [
        { deviceType: 'Smoke Detector', location: 'LOBBY', result: 'PASS' as const },
        { deviceType: 'Heat Detector', location: 'MECHANICAL ROOM', result: 'PASS' as const },
        { deviceType: 'Pull Station', location: 'STAIRWELL A', result: 'PASS' as const },
        { deviceType: 'Horn/Strobe', location: 'CORRIDOR 1', result: 'DEFICIENT' as const, notes: 'Strobe not flashing' },
      ],
      
      fireExtinguishers: [
        { location: 'LOBBY', type: '10lb ABC', serialNumber: 'FE-001', result: 'PASS' as const },
        { location: 'KITCHEN', type: '5lb BC', serialNumber: 'FE-002', result: 'PASS' as const },
      ],
      
      emergencyLights: [
        { location: 'STAIRWELL A', functionalTest: 'PASS' as const, durationTest: 'N/A' as const },
        { location: 'EXIT DOOR 1', functionalTest: 'FAIL' as const, durationTest: 'N/A' as const, comments: 'Battery depleted' },
      ],
      
      deficiencies: [
        {
          system: 'Fire Alarm System',
          location: 'CORRIDOR 1',
          description: 'Horn/Strobe device not functioning properly - strobe not flashing during alarm test',
        },
        {
          system: 'Emergency Lighting',
          location: 'EXIT DOOR 1',
          description: 'Emergency light failed functional test - battery appears depleted and requires replacement',
        },
      ],
    };
    
    const pdfBuffer = await generateComplianceReportPDF(testData);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(10000);
    
    // Save test output for manual inspection
    const outputPath = path.join(process.cwd(), 'test-output-compliance.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`Test PDF saved to: ${outputPath}`);
  });
  
  it('should include all checklist sections', async () => {
    const testData = {
      workOrderNumber: 'TEST-001',
      dateOfService: new Date(),
      inspectionFrequency: 'Annual' as const,
      contactPerson: 'Test Contact',
      contactPhone: '555-1234',
      buildingName: 'Test Building',
      buildingAddress: '123 Test St',
      city: 'Test City',
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: false,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: false,
        emergencyLighting: false,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'TEST SYSTEM',
      systemOperation: 'Single Stage' as const,
      connectedToFireSignalReceivingCentre: false,
      systemFullyFunctional: true,
      deficienciesIdentified: false,
      recommendationsIdentified: false,
      
      technicianName: 'Test Technician',
      technicianCertificateNumber: '9999',
      companyName: 'Test Company',
      companyPhone: '555-0000',
      
      checklists: [
        checklists.getControlUnitInspectionChecklist('TEST LOCATION', 'TEST SYSTEM'),
        checklists.getControlUnitTestChecklist('TEST LOCATION', 'TEST SYSTEM'),
      ],
      
      fireAlarmDevices: [],
      fireExtinguishers: [],
      emergencyLights: [],
      deficiencies: [],
    };
    
    const pdfBuffer = await generateComplianceReportPDF(testData);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
  });
  
  it('should handle deficiencies correctly', async () => {
    const testData = {
      workOrderNumber: 'DEF-TEST-001',
      dateOfService: new Date(),
      inspectionFrequency: 'Annual' as const,
      contactPerson: 'Test Contact',
      contactPhone: '555-1234',
      buildingName: 'Test Building',
      buildingAddress: '123 Test St',
      city: 'Test City',
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: false,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: false,
        emergencyLighting: false,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'TEST SYSTEM',
      systemOperation: 'Single Stage' as const,
      connectedToFireSignalReceivingCentre: false,
      systemFullyFunctional: false,
      deficienciesIdentified: true,
      recommendationsIdentified: false,
      
      technicianName: 'Test Technician',
      technicianCertificateNumber: '9999',
      companyName: 'Test Company',
      companyPhone: '555-0000',
      
      checklists: [
        checklists.getControlUnitInspectionChecklist('TEST LOCATION', 'TEST SYSTEM'),
      ],
      
      fireAlarmDevices: [
        { deviceType: 'Smoke Detector', location: 'Room 101', result: 'DEFICIENT' as const, notes: 'Not responding' },
      ],
      
      fireExtinguishers: [],
      emergencyLights: [],
      
      deficiencies: [
        {
          system: 'Fire Alarm System',
          location: 'Room 101',
          description: 'Smoke detector not responding to test - requires replacement',
        },
        {
          system: 'Fire Alarm System',
          location: 'Control Panel',
          description: 'Trouble signal not clearing - requires investigation',
        },
      ],
    };
    
    const pdfBuffer = await generateComplianceReportPDF(testData);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
  });
  
  it('should include device tables when devices are present', async () => {
    const testData = {
      workOrderNumber: 'DEVICE-TEST-001',
      dateOfService: new Date(),
      inspectionFrequency: 'Annual' as const,
      contactPerson: 'Test Contact',
      contactPhone: '555-1234',
      buildingName: 'Test Building',
      buildingAddress: '123 Test St',
      city: 'Test City',
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: true,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: true,
        emergencyLighting: true,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'TEST SYSTEM',
      systemOperation: 'Single Stage' as const,
      connectedToFireSignalReceivingCentre: false,
      systemFullyFunctional: true,
      deficienciesIdentified: false,
      recommendationsIdentified: false,
      
      technicianName: 'Test Technician',
      technicianCertificateNumber: '9999',
      companyName: 'Test Company',
      companyPhone: '555-0000',
      
      checklists: [],
      
      fireAlarmDevices: [
        { deviceType: 'Smoke Detector', location: 'Room 101', result: 'PASS' as const },
        { deviceType: 'Smoke Detector', location: 'Room 102', result: 'PASS' as const },
        { deviceType: 'Heat Detector', location: 'Kitchen', result: 'PASS' as const },
      ],
      
      fireExtinguishers: [
        { location: 'Hallway A', type: '10lb ABC', serialNumber: 'FE-001', result: 'PASS' as const },
        { location: 'Hallway B', type: '10lb ABC', serialNumber: 'FE-002', result: 'PASS' as const },
      ],
      
      emergencyLights: [
        { location: 'Stairwell 1', functionalTest: 'PASS' as const, durationTest: 'PASS' as const },
        { location: 'Stairwell 2', functionalTest: 'PASS' as const, durationTest: 'PASS' as const },
      ],
      
      deficiencies: [],
    };
    
    const pdfBuffer = await generateComplianceReportPDF(testData);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(10000);
  });
  
  it('should handle secondary technician information', async () => {
    const testData = {
      workOrderNumber: 'TECH-TEST-001',
      dateOfService: new Date(),
      inspectionFrequency: 'Annual' as const,
      contactPerson: 'Test Contact',
      contactPhone: '555-1234',
      buildingName: 'Test Building',
      buildingAddress: '123 Test St',
      city: 'Test City',
      
      systemsInspected: {
        fireAlarmSystem: true,
        commonAreaDevices: false,
        inSuiteDevices: false,
        sprinklerSystem: false,
        fireExtinguishers: false,
        emergencyLighting: false,
        hydrant: false,
        winterization: false,
        generator: false,
        backflow: false,
        monitoring: false,
        smokeControl: false,
        suppressionSystems: false,
        standpipe: false,
        kitchen: false,
      },
      
      systemModel: 'TEST SYSTEM',
      systemOperation: 'Two Stage' as const,
      connectedToFireSignalReceivingCentre: true,
      fireSignalReceivingCentre: 'TEST MONITORING',
      systemFullyFunctional: true,
      deficienciesIdentified: false,
      recommendationsIdentified: false,
      
      technicianName: 'Primary Technician',
      technicianCertificateNumber: '1111',
      secondaryTechnicianName: 'Secondary Technician',
      secondaryTechnicianCertificateNumber: '2222',
      companyName: 'Test Company',
      companyPhone: '555-0000',
      
      checklists: [],
      fireAlarmDevices: [],
      fireExtinguishers: [],
      emergencyLights: [],
      deficiencies: [],
    };
    
    const pdfBuffer = await generateComplianceReportPDF(testData);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
  });
});
