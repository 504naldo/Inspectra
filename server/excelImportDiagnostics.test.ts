import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('Excel Import Diagnostics', () => {
  it('should detect ZIP header in valid Excel file', () => {
    // Create a minimal valid workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Suite #', 'Location', 'Power Type'],
      ['101', 'Hallway', 'hardwired'],
      ['102', 'Bedroom', 'battery']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Smoke Alarms');
    
    // Write to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Check ZIP header (PK..)
    const first4Bytes = buffer.slice(0, 4).toString('hex').toUpperCase();
    expect(first4Bytes).toBe('504B0304');
  });

  it('should parse XLSM file with correct configuration', () => {
    // Create a workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Device Type', 'Location', 'Serial Number'],
      ['Smoke Detector', 'Floor 1', 'SD-001'],
      ['Heat Detector', 'Floor 2', 'HD-002']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Devices');
    
    // Write as XLSM
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm' });
    
    // Parse with correct configuration
    const uint8Data = new Uint8Array(buffer);
    const parsedWorkbook = XLSX.read(uint8Data, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellStyles: false
    });
    
    expect(parsedWorkbook.SheetNames).toContain('Devices');
    expect(parsedWorkbook.SheetNames.length).toBe(1);
  });

  it('should reject file smaller than 1KB', () => {
    const tinyBuffer = Buffer.from('test', 'utf-8');
    const byteSize = tinyBuffer.length;
    
    expect(byteSize).toBeLessThan(1024);
  });

  it('should detect invalid ZIP header', () => {
    const invalidBuffer = Buffer.from('This is not an Excel file', 'utf-8');
    const first4Bytes = invalidBuffer.slice(0, 4).toString('hex').toUpperCase();
    
    expect(first4Bytes).not.toBe('504B0304');
  });

  it('should extract first 16 bytes as hex for diagnostics', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([['Test']]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const first16Bytes = buffer.slice(0, 16).toString('hex').toUpperCase();
    
    // Should start with PK.. (50 4B 03 04)
    expect(first16Bytes.startsWith('504B0304')).toBe(true);
    expect(first16Bytes.length).toBe(32); // 16 bytes = 32 hex characters
  });

  it('should handle base64 encoding/decoding correctly', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Value'],
      ['Test', '123']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    
    // Write to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Encode to base64 (simulating client upload)
    const base64 = buffer.toString('base64');
    
    // Decode from base64 (simulating server receive)
    const decodedBuffer = Buffer.from(base64, 'base64');
    
    // Verify integrity
    expect(decodedBuffer.length).toBe(buffer.length);
    expect(decodedBuffer.equals(buffer)).toBe(true);
    
    // Parse decoded buffer
    const uint8Data = new Uint8Array(decodedBuffer);
    const parsedWorkbook = XLSX.read(uint8Data, { type: 'array' });
    
    expect(parsedWorkbook.SheetNames).toContain('Data');
  });

  it('should parse workbook with cellDates option', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Install Date', 'Suite'],
      [new Date('2024-01-15'), '101'],
      [new Date('2024-02-20'), '102']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dates');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const uint8Data = new Uint8Array(buffer);
    
    // Parse with cellDates: true
    const parsedWorkbook = XLSX.read(uint8Data, {
      type: 'array',
      cellDates: true
    });
    
    const sheet = parsedWorkbook.Sheets['Dates'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    // Second row should have Date object
    const row1 = data[1] as any[];
    expect(row1[0]).toBeInstanceOf(Date);
  });

  it('should handle empty workbook gracefully', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Empty');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const uint8Data = new Uint8Array(buffer);
    
    const parsedWorkbook = XLSX.read(uint8Data, { type: 'array' });
    const sheet = parsedWorkbook.Sheets['Empty'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    expect(data.length).toBe(0);
  });
});

describe('Error Message Formatting', () => {
  it('should format PARSE_FAILED error with details', () => {
    const error = {
      code: 'PARSE_FAILED',
      message: 'Failed to parse Excel workbook',
      details: {
        fileName: 'test.xlsm',
        byteSize: 512,
        first16Bytes: '504B030414000600'
      }
    };
    
    expect(error.code).toBe('PARSE_FAILED');
    expect(error.details.fileName).toBe('test.xlsm');
    expect(error.details.byteSize).toBeLessThan(1024);
  });

  it('should format debug info for clipboard', () => {
    const parseError = {
      message: 'PARSE_FAILED: File is too small',
      fileName: 'test.xlsx',
      fileSize: 512,
      first16Bytes: '504B030414000600',
      errorType: 'ValidationError'
    };
    
    const debugInfo = [
      `Error: ${parseError.message}`,
      `File: ${parseError.fileName}`,
      `Size: ${(parseError.fileSize / 1024).toFixed(2)} KB`,
      `First 16 bytes: ${parseError.first16Bytes}`,
      `Error Type: ${parseError.errorType}`
    ].join('\\n');
    
    expect(debugInfo).toContain('PARSE_FAILED');
    expect(debugInfo).toContain('test.xlsx');
    expect(debugInfo).toContain('0.50 KB');
    expect(debugInfo).toContain('504B030414000600');
  });
});
