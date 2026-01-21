import { appRouter } from './server/routers';

const FILE_ID = 90002;
const SITE_ID = 240002;
const JOB_ID = 390002;
const COMPANY_ID = 180002;

// Create test context
const ctx = {
  user: {
    id: 1,
    openId: 'real-data-import',
    name: 'Import User',
    email: 'import@test.com',
    role: 'office' as const,
    companyId: COMPANY_ID,
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
};

async function runImport() {
  try {
    const caller = appRouter.createCaller(ctx);

    console.log('Step 1: Previewing Excel import...\n');
    const preview = await caller.files.previewImportExcel({ fileId: FILE_ID });
    
    console.log('=== Preview Results ===');
    console.log(`Total Rows: ${preview.totalRows}`);
    console.log(`Has Site Sheet: ${preview.hasSiteSheet}`);
    if (preview.sitePreview) {
      console.log('\nSite Preview:');
      console.log(JSON.stringify(preview.sitePreview, null, 2));
    }
    console.log('\nDevice Counts:');
    console.log(`  Fire Alarm: ${preview.counts.fireAlarm}`);
    console.log(`  Extinguishers: ${preview.counts.extinguishers}`);
    console.log(`  Emergency Lights: ${preview.counts.emergencyLights}`);
    console.log(`  Sprinkler: ${preview.counts.sprinkler}`);

    console.log('\n\nStep 2: Importing devices...\n');
    const importResult = await caller.files.importExcelDevices({
      fileId: FILE_ID,
      siteId: SITE_ID,
      jobId: JOB_ID,
    });

    console.log('=== Import Results ===');
    console.log('\nImported (New):');
    console.log(`  Fire Alarm: ${importResult.imported.fireAlarm}`);
    console.log(`  Extinguishers: ${importResult.imported.extinguishers}`);
    console.log(`  Emergency Lights: ${importResult.imported.emergencyLights}`);
    console.log(`  Sprinkler: ${importResult.imported.sprinkler}`);

    console.log('\nUpdated (Existing):');
    console.log(`  Fire Alarm: ${importResult.updated.fireAlarm}`);
    console.log(`  Extinguishers: ${importResult.updated.extinguishers}`);
    console.log(`  Emergency Lights: ${importResult.updated.emergencyLights}`);
    console.log(`  Sprinkler: ${importResult.updated.sprinkler}`);

    console.log('\nSite Updated:');
    console.log(`  Fields Updated: ${importResult.siteUpdated.fieldsUpdated}`);
    console.log(`  Updated Fields: ${importResult.siteUpdated.updatedFields.join(', ')}`);

    console.log(`\nExcluded Rows: ${importResult.excluded.length}`);
    if (importResult.excluded.length > 0) {
      console.log('First 10 excluded rows:');
      importResult.excluded.slice(0, 10).forEach((ex, i) => {
        console.log(`  ${i + 1}. Sheet: ${ex.sheet}, Reason: ${ex.reason}`);
      });
    }

    const totalImported = 
      importResult.imported.fireAlarm +
      importResult.imported.extinguishers +
      importResult.imported.emergencyLights +
      importResult.imported.sprinkler;

    const totalUpdated =
      importResult.updated.fireAlarm +
      importResult.updated.extinguishers +
      importResult.updated.emergencyLights +
      importResult.updated.sprinkler;

    console.log('\n=== Summary ===');
    console.log(`Total New Devices: ${totalImported}`);
    console.log(`Total Updated Devices: ${totalUpdated}`);
    console.log(`Total Devices: ${totalImported + totalUpdated}`);
    console.log(`Site Fields Updated: ${importResult.siteUpdated.fieldsUpdated}`);

  } catch (error) {
    console.error('Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

runImport();
