import { getDb } from './server/db';
import { companies, customerOrgs, sites, jobs, attachments } from './drizzle/schema';
import { eq } from 'drizzle-orm';

const FILE_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/113852657/exn2eFaTD5Fz53yXRQGbFV/real-data/0350-2025ANNUAL-2095WEST46THAVENUE-1768960593094.xlsm';
const FILE_KEY = 'real-data/0350-2025ANNUAL-2095WEST46THAVENUE-1768960593094.xlsm';
const FILE_SIZE = 3699450;

async function setupAndImport() {
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    console.log('Creating company...');
    const [company] = await db.insert(companies).values({
      name: '2095 West 46th Avenue Building',
      email: 'admin@2095west46th.com',
    });
    const companyId = (company as any).insertId;
    console.log(`Company created: ID ${companyId}`);

    console.log('Creating customer org...');
    const [customerOrg] = await db.insert(customerOrgs).values({
      companyId,
      name: '2095 West 46th Avenue - Vancouver',
      contactName: 'Building Manager',
      contactEmail: 'manager@2095west46th.com',
    });
    const customerOrgId = (customerOrg as any).insertId;
    console.log(`Customer org created: ID ${customerOrgId}`);

    console.log('Creating site...');
    const [site] = await db.insert(sites).values({
      companyId,
      customerOrgId,
      name: '2095 West 46th Avenue',
      address: '2095 West 46th Avenue',
      city: 'Vancouver',
      state: 'BC',
      postalCode: '',
    });
    const siteId = (site as any).insertId;
    console.log(`Site created: ID ${siteId}`);

    console.log('Creating job...');
    const [job] = await db.insert(jobs).values({
      companyId,
      siteId,
      customerOrgId,
      jobNumber: '0350-2025ANNUAL',
      title: '2025 Annual Inspection - 2095 West 46th Avenue',
      jobType: 'annual',
      status: 'in_progress',
      scheduledDate: new Date('2025-01-20'),
    });
    const jobId = (job as any).insertId;
    console.log(`Job created: ID ${jobId}`);

    console.log('Creating attachment record...');
    const [attachment] = await db.insert(attachments).values({
      entityType: 'job',
      entityId: jobId,
      siteId,
      jobId,
      uploadedById: 1,
      fileName: '#0350-2025ANNUAL-2095WEST46THAVENUE,VANCOUVER-JAN20-25ver10.1.xlsm',
      fileKey: FILE_KEY,
      fileUrl: FILE_URL,
      mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      fileSize: FILE_SIZE,
      uploadStatus: 'completed',
      importStatus: 'none',
    });
    const attachmentId = (attachment as any).insertId;
    console.log(`Attachment created: ID ${attachmentId}`);

    console.log('\n=== Setup Complete ===');
    console.log(JSON.stringify({
      companyId,
      customerOrgId,
      siteId,
      jobId,
      attachmentId,
    }, null, 2));

    console.log('\nNow you can import using:');
    console.log(`  trpc.files.previewImportExcel({ fileId: ${attachmentId} })`);
    console.log(`  trpc.files.importExcelDevices({ fileId: ${attachmentId}, siteId: ${siteId}, jobId: ${jobId} })`);

  } catch (error) {
    console.error('Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

setupAndImport();
