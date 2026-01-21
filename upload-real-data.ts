import { readFileSync } from 'fs';
import { storagePut } from './server/storage';

async function uploadFile() {
  try {
    const filePath = '/home/ubuntu/upload/#0350-2025ANNUAL-2095WEST46THAVENUE,VANCOUVER-JAN20-25ver10.1.xlsm';
    const fileBuffer = readFileSync(filePath);
    
    const fileKey = `real-data/0350-2025ANNUAL-2095WEST46THAVENUE-${Date.now()}.xlsm`;
    const result = await storagePut(fileKey, fileBuffer, 'application/vnd.ms-excel.sheet.macroEnabled.12');
    
    console.log(JSON.stringify({
      fileKey: result.key,
      fileUrl: result.url,
      fileSize: fileBuffer.length
    }, null, 2));
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

uploadFile();
