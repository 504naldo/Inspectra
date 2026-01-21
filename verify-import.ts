import { getDb } from './server/db';
import { sites, devices } from './drizzle/schema';
import { eq } from 'drizzle-orm';

const SITE_ID = 240002;
const COMPANY_ID = 180002;

async function verifyImport() {
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Check site info
    console.log('=== Site Information ===');
    const [site] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, SITE_ID))
      .limit(1);

    if (site) {
      console.log(`Name: ${site.name}`);
      console.log(`Address: ${site.address}`);
      console.log(`City: ${site.city}`);
      console.log(`State: ${site.state}`);
      console.log(`Postal Code: ${site.postalCode}`);
      console.log(`Contact Name: ${site.contactName}`);
      console.log(`Contact Phone: ${site.contactPhone}`);
    }

    // Check devices by category
    console.log('\n=== Devices by Category ===');
    const allDevices = await db
      .select()
      .from(devices)
      .where(eq(devices.siteId, SITE_ID));

    const byCategory: Record<string, any[]> = {};
    allDevices.forEach(device => {
      if (!byCategory[device.category]) {
        byCategory[device.category] = [];
      }
      byCategory[device.category].push(device);
    });

    for (const [category, devs] of Object.entries(byCategory)) {
      console.log(`\n${category}: ${devs.length} devices`);
      console.log('Sample devices:');
      devs.slice(0, 3).forEach((dev, i) => {
        console.log(`  ${i + 1}. Location: ${dev.location}, Type: ${dev.deviceType}, Ref: ${dev.externalRef}`);
      });
    }

    console.log(`\n=== Total Devices: ${allDevices.length} ===`);

  } catch (error) {
    console.error('Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

verifyImport();
