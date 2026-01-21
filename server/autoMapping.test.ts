import { describe, it, expect } from 'vitest';
import { autoMapColumns, type FieldDefinition } from './autoMapping';

const DEVICE_FIELDS: FieldDefinition[] = [
  { key: 'deviceType', label: 'Device Type', required: true },
  { key: 'manufacturer', label: 'Manufacturer', required: false },
  { key: 'model', label: 'Model', required: false },
  { key: 'serialNumber', label: 'Serial Number', required: false },
  { key: 'location', label: 'Location', required: false },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

describe('autoMapColumns', () => {
  it('should map exact matches', () => {
    const headers = ['Device Type', 'Manufacturer', 'Model', 'Serial Number', 'Location', 'Barcode', 'Notes'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.totalMapped).toBe(7);
    expect(result.mapping.deviceType).toBe('Device Type');
    expect(result.mapping.manufacturer).toBe('Manufacturer');
    expect(result.mapping.model).toBe('Model');
    expect(result.mapping.serialNumber).toBe('Serial Number');
    expect(result.mapping.location).toBe('Location');
    expect(result.mapping.barcode).toBe('Barcode');
    expect(result.mapping.notes).toBe('Notes');
  });
  
  it('should map case-insensitive matches', () => {
    const headers = ['DEVICE TYPE', 'manufacturer', 'MoDel', 'SERIAL NUMBER'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.mapping.deviceType).toBe('DEVICE TYPE');
    expect(result.mapping.manufacturer).toBe('manufacturer');
    expect(result.mapping.model).toBe('MoDel');
    expect(result.mapping.serialNumber).toBe('SERIAL NUMBER');
  });
  
  it('should map synonyms correctly', () => {
    const headers = ['Type', 'Mfr', 'Model #', 'S/N', 'Area', 'Tag', 'Comments'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.mapping.deviceType).toBe('Type');
    expect(result.mapping.manufacturer).toBe('Mfr');
    expect(result.mapping.model).toBe('Model #');
    expect(result.mapping.serialNumber).toBe('S/N');
    expect(result.mapping.location).toBe('Area');
    expect(result.mapping.barcode).toBe('Tag');
    expect(result.mapping.notes).toBe('Comments');
    expect(result.totalMapped).toBe(7);
  });
  
  it('should handle punctuation and spacing variations', () => {
    const headers = ['Device-Type', 'Model Number', 'Serial#', 'Asset Tag'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.mapping.deviceType).toBe('Device-Type');
    expect(result.mapping.model).toBe('Model Number');
    expect(result.mapping.serialNumber).toBe('Serial#');
    expect(result.mapping.barcode).toBe('Asset Tag');
  });
  
  it('should prefer exact matches over partial matches', () => {
    const headers = ['Location', 'Device Location', 'Type', 'Device Type'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    // Should prefer "Location" over "Device Location" for location field
    expect(result.mapping.location).toBe('Location');
    // Should prefer "Type" or "Device Type" for deviceType (both are valid synonyms)
    expect(['Type', 'Device Type']).toContain(result.mapping.deviceType);
  });
  
  it('should not map headers below confidence threshold', () => {
    const headers = ['Completely Unrelated', 'Random Column', 'Another Field'];
    const result = autoMapColumns(headers, DEVICE_FIELDS, 60);
    
    expect(result.totalMapped).toBe(0);
    expect(Object.keys(result.mapping).length).toBe(0);
  });
  
  it('should not reuse the same header for multiple fields', () => {
    const headers = ['Device', 'Device', 'Device'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    // Only one field should be mapped to "Device"
    const mappedFields = Object.values(result.mapping).filter(h => h === 'Device');
    expect(mappedFields.length).toBe(1);
  });
  
  it('should handle real-world Fire-Pro template headers', () => {
    const headers = [
      'Unit #',
      'Location',
      'Type/Size',
      'Mfr',
      'Model',
      'Serial #',
      'Last Inspected',
      'Notes'
    ];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.mapping.location).toBe('Location');
    expect(result.mapping.deviceType).toBe('Type/Size');
    expect(result.mapping.manufacturer).toBe('Mfr');
    expect(result.mapping.model).toBe('Model');
    expect(result.mapping.serialNumber).toBe('Serial #');
    expect(result.mapping.notes).toBe('Notes');
    // Unit # could map to barcode but not guaranteed - it's ambiguous
    expect(result.totalMapped).toBeGreaterThanOrEqual(5);
  });
  
  it('should handle Individual device record headers', () => {
    const headers = [
      'Device Location',
      'Device Type',
      'Circuit Number or Address',
      'Manufacturer',
      'Model Number',
      'Serial Number'
    ];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.mapping.location).toBe('Device Location');
    expect(result.mapping.deviceType).toBe('Device Type');
    expect(result.mapping.manufacturer).toBe('Manufacturer');
    expect(result.mapping.model).toBe('Model Number');
    expect(result.mapping.serialNumber).toBe('Serial Number');
    expect(result.totalMapped).toBeGreaterThanOrEqual(5);
  });
  
  it('should return confidence scores for all mappings', () => {
    const headers = ['Device Type', 'Mfr', 'Model'];
    const result = autoMapColumns(headers, DEVICE_FIELDS);
    
    expect(result.confidence.deviceType).toBeGreaterThan(0);
    expect(result.confidence.manufacturer).toBeGreaterThan(0);
    expect(result.confidence.model).toBeGreaterThan(0);
    
    // Exact match should have highest confidence
    expect(result.confidence.deviceType).toBeGreaterThanOrEqual(90);
  });
});
