import * as fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = '/home/ubuntu/upload/#0350-2025ANNUAL-2095WEST46THAVENUE,VANCOUVER-JAN20-25ver10.1.xlsm';

console.log('Testing end-to-end parse flow...\n');

try {
  // Step 1: Read file as ArrayBuffer (simulating FileReader)
  console.log('Step 1: Reading file as ArrayBuffer...');
  const fileBuffer = fs.readFileSync(filePath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );
  console.log('✓ File read as ArrayBuffer:', arrayBuffer.byteLength, 'bytes\n');
  
  // Step 2: Convert to base64 (simulating frontend btoa)
  console.log('Step 2: Converting to base64...');
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const base64 = Buffer.from(binaryString, 'binary').toString('base64');
  console.log('✓ Converted to base64:', base64.length, 'characters\n');
  
  // Step 3: Parse on backend (simulating parseFile mutation)
  console.log('Step 3: Parsing on backend...');
  const buffer = Buffer.from(base64, 'base64');
  console.log('✓ Decoded base64 to buffer:', buffer.length, 'bytes');
  
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  console.log('✓ Workbook parsed\n');
  
  // Step 4: Smart default selection
  console.log('Step 4: Selecting smart default sheet...');
  
  const getDefaultSheetName = () => {
    // Priority 1: Exact match for "Individual devices" or "Individual device record"
    const exactMatches = ['individual devices', 'individual device record', 'device list'];
    for (const target of exactMatches) {
      const match = workbook.SheetNames.find(name => 
        name.toLowerCase().trim() === target
      );
      if (match) return match;
    }
    
    // Priority 2: Contains high-priority device keywords (ordered by specificity)
    const highPriorityKeywords = [
      "individual device",  // Matches "Individual device record"
      "device list",
      "fire alarm devices"
    ];
    
    for (const keyword of highPriorityKeywords) {
      const match = workbook.SheetNames.find(name => 
        name.toLowerCase().includes(keyword)
      );
      if (match) return match;
    }
    
    // Priority 3: Contains general device keywords
    const generalKeywords = [
      "devices", "smoke", "heat", "pull",
      "extinguisher", "emergency light", "sprinkler"
    ];
    
    for (const keyword of generalKeywords) {
      const match = workbook.SheetNames.find(name => 
        name.toLowerCase().includes(keyword)
      );
      if (match) return match;
    }
    
    // Fallback: first sheet
    return workbook.SheetNames[0];
  };
  
  const defaultSheetName = getDefaultSheetName();
  console.log('✓ Smart default:', defaultSheetName, '\n');
  
  // Step 5: Parse sheet data
  console.log('Step 5: Parsing sheet data...');
  const sheet = workbook.Sheets[defaultSheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  if (data.length === 0) {
    throw new Error('Sheet is empty');
  }
  
  // Convert headers to strings (handle numbers, dates, etc.)
  const headers = (data[0] as any[]).map(h => String(h || ''));
  const rows = data.slice(1, 11);
  const totalRows = data.length - 1;
  
  console.log('✓ Headers:', headers.slice(0, 5));
  console.log('✓ Total rows:', totalRows);
  console.log('✓ Preview rows:', rows.length, '\n');
  
  // Step 6: Check device headers
  console.log('Step 6: Checking device headers...');
  const deviceHeaders = ['location', 'device', 'type', 'model', 'serial'];
  const hasDeviceHeaders = headers.some(h => {
    const headerStr = String(h || '').toLowerCase();
    return deviceHeaders.some(dh => headerStr.includes(dh));
  });
  console.log('✓ Has device headers:', hasDeviceHeaders, '\n');
  
  console.log('✅ End-to-end parse test completed successfully!');
  console.log('\nResult:');
  console.log({
    sheetName: defaultSheetName,
    sheetNames: workbook.SheetNames,
    totalRows,
    hasDeviceHeaders,
    headersCount: headers.length,
  });
  
} catch (error) {
  console.error('\n❌ Parse error:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }
}
