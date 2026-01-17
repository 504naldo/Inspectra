import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

async function debugExtinguishers() {
  console.log('🔍 Checking fire extinguisher data...\n');

  // Get all fire extinguishers
  const extinguishers = await db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.category, 'FIRE_EXTINGUISHER'));

  console.log(`Total Fire Extinguishers in DB: ${extinguishers.length}`);
  
  if (extinguishers.length > 0) {
    console.log('\nFire Extinguisher Details:');
    for (const ext of extinguishers) {
      console.log(`  - ID: ${ext.id}, Site: ${ext.siteId}, Type: ${ext.deviceType}, Location: ${ext.location}`);
    }

    // Check the demo site specifically
    const demoSiteId = 120001;
    const demoExtinguishers = extinguishers.filter(e => e.siteId === demoSiteId);
    console.log(`\nFire Extinguishers for Demo Site (${demoSiteId}): ${demoExtinguishers.length}`);
  } else {
    console.log('❌ No fire extinguishers found in database!');
  }

  // Also check all device categories
  const allDevices = await db.select().from(schema.devices);
  const categoryCounts = allDevices.reduce((acc, d) => {
    acc[d.category || 'NULL'] = (acc[d.category || 'NULL'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nAll Device Categories:');
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count}`);
  });
}

debugExtinguishers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
