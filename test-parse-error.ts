import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = '/home/ubuntu/upload/#0350-2025ANNUAL-2095WEST46THAVENUE,VANCOUVER-JAN20-25ver10.1.xlsm';

console.log('Testing parse with real file...\n');

try {
  // Read file
  const fileBuffer = fs.readFileSync(filePath);
  console.log('✓ File read successfully:', fileBuffer.length, 'bytes\n');
  
  // Parse workbook
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  console.log('✓ Workbook parsed successfully\n');
  console.log('Sheet names:', workbook.SheetNames, '\n');
  
  // Try to get first sheet
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  console.log('✓ First sheet accessed:', firstSheetName, '\n');
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  console.log('✓ Sheet converted to JSON\n');
  console.log('Total rows:', data.length);
  console.log('First 5 rows:', JSON.stringify(data.slice(0, 5), null, 2), '\n');
  
  // Try smart default selection
  const ignoredKeywords = ['labour', 'rate', 'pricing', 'parts', 'invoice', 'cost', 'summary'];
  const smartDefault = workbook.SheetNames.find(name => 
    !ignoredKeywords.some(keyword => name.toLowerCase().includes(keyword))
  ) || workbook.SheetNames[0];
  
  console.log('Smart default sheet:', smartDefault, '\n');
  
  // Test "Individual devices" preference
  const individualDevicesSheet = workbook.SheetNames.find(name => 
    name.toLowerCase().trim() === 'individual devices'
  );
  console.log('Individual devices sheet found:', individualDevicesSheet || 'No', '\n');
  
  console.log('✅ Parse test completed successfully!');
  
} catch (error) {
  console.error('❌ Parse error:', error);
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }
}
