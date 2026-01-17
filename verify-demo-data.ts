import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

async function verifyDemoData() {
  console.log('🔍 Verifying Demo Test Facility data...\n');

  try {
    // Find the demo site
    const [site] = await db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.name, 'Demo Test Facility'))
      .limit(1);

    if (!site) {
      console.error('❌ Demo Test Facility site not found!');
      return;
    }

    console.log(`✓ Site found: ${site.name} (ID: ${site.id})`);

    // Find the demo job
    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.siteId, site.id))
      .limit(1);

    if (!job) {
      console.error('❌ Demo job not found!');
      return;
    }

    console.log(`✓ Job found: ${job.title} (ID: ${job.id})`);
    console.log(`  - Status: ${job.status}`);
    console.log(`  - Type: ${job.jobType}`);

    // Count devices by category
    const devices = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.siteId, site.id));

    const fireAlarmCount = devices.filter(d => d.category === 'FIRE_ALARM_DEVICE').length;
    const extinguisherCount = devices.filter(d => d.category === 'FIRE_EXTINGUISHER').length;
    const emergencyLightCount = devices.filter(d => d.category === 'EMERGENCY_LIGHT').length;

    console.log(`\n📊 Device Counts:`);
    console.log(`  - Fire Alarm Devices: ${fireAlarmCount} (expected: 15)`);
    console.log(`  - Fire Extinguishers: ${extinguisherCount} (expected: 8)`);
    console.log(`  - Emergency Lights: ${emergencyLightCount} (expected: 6)`);
    console.log(`  - Total: ${devices.length} (expected: 29)`);

    // Show sample devices
    console.log(`\n📋 Sample Devices:`);
    const sampleDevices = devices.slice(0, 5);
    for (const device of sampleDevices) {
      console.log(`  - ${device.category}: ${device.deviceType} at ${device.location}`);
    }

    // Count deficiencies
    const deficiencies = await db
      .select()
      .from(schema.deficiencies)
      .where(eq(schema.deficiencies.jobId, job.id));

    console.log(`\n🔥 Deficiencies: ${deficiencies.length} (expected: 4)`);
    for (const def of deficiencies) {
      console.log(`  - [${def.severity.toUpperCase()}] ${def.title}`);
    }

    // Verify all counts
    const allCorrect = 
      fireAlarmCount === 15 &&
      extinguisherCount === 8 &&
      emergencyLightCount === 6 &&
      deficiencies.length === 4;

    if (allCorrect) {
      console.log(`\n✅ All data verified successfully!`);
      console.log(`\n🎯 Test the app by navigating to:`);
      console.log(`   Job Details: /tech/jobs/${job.id}`);
    } else {
      console.log(`\n⚠️  Some counts don't match expected values.`);
    }

  } catch (error) {
    console.error('❌ Error verifying demo data:', error);
    throw error;
  }
}

// Run the verification script
verifyDemoData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
