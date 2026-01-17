import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './drizzle/schema.js';
import { eq, and } from 'drizzle-orm';

const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

async function seedDemoFacility() {
  console.log('🌱 Seeding Demo Test Facility...\n');

  try {
    // Get the first company (assuming user's company)
    const [company] = await db.select().from(schema.companies).limit(1);
    if (!company) {
      throw new Error('No company found. Please create a company first.');
    }
    console.log(`✓ Using company: ${company.name} (ID: ${company.id})`);

    // Create or get customer organization
    let [customerOrg] = await db
      .select()
      .from(schema.customerOrgs)
      .where(
        and(
          eq(schema.customerOrgs.companyId, company.id),
          eq(schema.customerOrgs.name, 'Demo Test Organization')
        )
      )
      .limit(1);

    if (!customerOrg) {
      [customerOrg] = await db.insert(schema.customerOrgs).values({
        companyId: company.id,
        name: 'Demo Test Organization',
        contactName: 'John Demo',
        contactEmail: 'john@demo.test',
        contactPhone: '604-555-0100',
        address: '1234 Demo Way, Vancouver, BC V6B 1A1',
      }).$returningId();
      
      const [created] = await db
        .select()
        .from(schema.customerOrgs)
        .where(eq(schema.customerOrgs.id, customerOrg.id))
        .limit(1);
      customerOrg = created;
      console.log(`✓ Created customer org: ${customerOrg.name} (ID: ${customerOrg.id})`);
    } else {
      console.log(`✓ Using existing customer org: ${customerOrg.name} (ID: ${customerOrg.id})`);
    }

    // Create or get demo site
    let [site] = await db
      .select()
      .from(schema.sites)
      .where(
        and(
          eq(schema.sites.companyId, company.id),
          eq(schema.sites.name, 'Demo Test Facility')
        )
      )
      .limit(1);

    if (!site) {
      [site] = await db.insert(schema.sites).values({
        companyId: company.id,
        customerOrgId: customerOrg.id,
        name: 'Demo Test Facility',
        address: '1234 Demo Way',
        city: 'Vancouver',
        state: 'BC',
        postalCode: 'V6B 1A1',
        contactName: 'John Demo',
        contactPhone: '604-555-0100',
        notes: 'Commercial multi-storey facility with Basement, Level 1, Level 2, and Parkade',
      }).$returningId();

      const [created] = await db
        .select()
        .from(schema.sites)
        .where(eq(schema.sites.id, site.id))
        .limit(1);
      site = created;
      console.log(`✓ Created site: ${site.name} (ID: ${site.id})`);
    } else {
      console.log(`✓ Using existing site: ${site.name} (ID: ${site.id})`);
    }

    // Get a technician user
    const [technician] = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.companyId, company.id),
          eq(schema.users.role, 'technician')
        )
      )
      .limit(1);

    if (!technician) {
      console.warn('⚠ No technician found. Job will be created without assignment.');
    } else {
      console.log(`✓ Using technician: ${technician.name} (ID: ${technician.id})`);
    }

    // Create or get demo job
    let [job] = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.companyId, company.id),
          eq(schema.jobs.siteId, site.id),
          eq(schema.jobs.jobNumber, 'DEMO-2026-001')
        )
      )
      .limit(1);

    if (!job) {
      [job] = await db.insert(schema.jobs).values({
        companyId: company.id,
        siteId: site.id,
        customerOrgId: customerOrg.id,
        assignedTechnicianId: technician?.id || null,
        jobNumber: 'DEMO-2026-001',
        title: 'Full System Demo Inspection',
        description: 'Comprehensive inspection covering Fire Alarm, Sprinkler, Extinguishers, and Emergency Lighting',
        jobType: 'annual',
        status: 'in_progress',
        priority: 'medium',
        scheduledDate: new Date(),
        startedAt: new Date(),
      }).$returningId();

      const [created] = await db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id))
        .limit(1);
      job = created;
      console.log(`✓ Created job: ${job.title} (ID: ${job.id})`);
    } else {
      console.log(`✓ Using existing job: ${job.title} (ID: ${job.id})`);
    }

    console.log('\n📦 Seeding devices...\n');

    // Clear existing devices for this site to avoid duplicates
    await db.delete(schema.devices).where(eq(schema.devices.siteId, site.id));
    console.log('✓ Cleared existing devices');

    // A) Fire Alarm Devices (15 devices with realistic walk order)
    const fireAlarmDevices = [
      // Smoke Detectors
      { location: 'Lobby Ceiling', deviceType: 'Smoke Detector', sequenceOrder: 1 },
      { location: 'Electrical Room', deviceType: 'Smoke Detector', sequenceOrder: 2 },
      { location: 'Corridor Level 1', deviceType: 'Smoke Detector', sequenceOrder: 3 },
      { location: 'Corridor Level 2', deviceType: 'Smoke Detector', sequenceOrder: 4 },
      // Heat Detectors
      { location: 'Electrical Room Ceiling', deviceType: 'Heat Detector', sequenceOrder: 5 },
      { location: 'Mechanical Room', deviceType: 'Heat Detector', sequenceOrder: 6 },
      { location: 'Parkade Ceiling', deviceType: 'Heat Detector', sequenceOrder: 7 },
      // Manual Pull Stations
      { location: 'Main Entrance', deviceType: 'Manual Pull Station', sequenceOrder: 8 },
      { location: 'Exit Stairwell Level 1', deviceType: 'Manual Pull Station', sequenceOrder: 9 },
      { location: 'Exit Stairwell Level 2', deviceType: 'Manual Pull Station', sequenceOrder: 10 },
      // Notification Devices
      { location: 'Lobby', deviceType: 'Horn/Strobe', sequenceOrder: 11 },
      { location: 'Corridor Level 1', deviceType: 'Horn/Strobe', sequenceOrder: 12 },
      { location: 'Corridor Level 2', deviceType: 'Horn/Strobe', sequenceOrder: 13 },
      { location: 'Parkade', deviceType: 'Horn/Strobe', sequenceOrder: 14 },
      { location: 'Stairwell', deviceType: 'Horn/Strobe', sequenceOrder: 15 },
    ];

    for (const device of fireAlarmDevices) {
      await db.insert(schema.devices).values({
        companyId: company.id,
        siteId: site.id,
        category: 'FIRE_ALARM_DEVICE',
        deviceType: device.deviceType,
        location: device.location,
        barcode: `FA-${String(device.sequenceOrder).padStart(3, '0')}`,
        externalRef: `DEMO-FA-${device.sequenceOrder}`,
        isActive: true,
      });
    }
    console.log(`✓ Created ${fireAlarmDevices.length} fire alarm devices`);

    // B) Fire Extinguishers (8 devices)
    const extinguishers = [
      { location: 'Main Lobby', type: 'ABC 10lb', sequenceOrder: 16 },
      { location: 'Electrical Room', type: 'ABC 10lb', sequenceOrder: 17 },
      { location: 'Mechanical Room', type: 'ABC 10lb', sequenceOrder: 18 },
      { location: 'Corridor Level 1', type: 'ABC 5lb', sequenceOrder: 19 },
      { location: 'Corridor Level 2', type: 'ABC 5lb', sequenceOrder: 20 },
      { location: 'Parkade Ramp', type: 'ABC 10lb', sequenceOrder: 21 },
      { location: 'Parkade Electrical', type: 'ABC 10lb', sequenceOrder: 22 },
      { location: 'Storage Room', type: 'K-Class 6L', sequenceOrder: 23 },
    ];

    for (const ext of extinguishers) {
      await db.insert(schema.devices).values({
        companyId: company.id,
        siteId: site.id,
        category: 'FIRE_EXTINGUISHER',
        deviceType: ext.type,
        location: ext.location,
        barcode: `EXT-${String(ext.sequenceOrder - 15).padStart(3, '0')}`,
        externalRef: `DEMO-EXT-${ext.sequenceOrder}`,
        isActive: true,
      });
    }
    console.log(`✓ Created ${extinguishers.length} fire extinguishers`);

    // C) Emergency Lights (6 devices)
    const emergencyLights = [
      { location: 'Lobby Exit', sequenceOrder: 24 },
      { location: 'Stairwell Level 1', sequenceOrder: 25 },
      { location: 'Stairwell Level 2', sequenceOrder: 26 },
      { location: 'Corridor Level 1', sequenceOrder: 27 },
      { location: 'Corridor Level 2', sequenceOrder: 28 },
      { location: 'Parkade Exit', sequenceOrder: 29 },
    ];

    for (const light of emergencyLights) {
      await db.insert(schema.devices).values({
        companyId: company.id,
        siteId: site.id,
        category: 'EMERGENCY_LIGHT',
        deviceType: 'Emergency Light LED',
        location: light.location,
        barcode: `LIGHT-${String(light.sequenceOrder - 23).padStart(3, '0')}`,
        externalRef: `DEMO-LIGHT-${light.sequenceOrder}`,
        notes: 'Battery backup: 90 minutes',
        isActive: true,
      });
    }
    console.log(`✓ Created ${emergencyLights.length} emergency lights`);

    console.log('\n🔥 Seeding sample deficiencies...\n');

    // Get some devices for deficiency linking
    const devices = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.siteId, site.id));

    const fireAlarmDevice = devices.find(d => d.category === 'FIRE_ALARM_DEVICE');
    const emergencyLightDevice = devices.find(d => d.category === 'EMERGENCY_LIGHT');
    const extinguisherDevice = devices.find(d => d.category === 'FIRE_EXTINGUISHER');

    // Get admin or technician for reportedById
    const [reporter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.companyId, company.id))
      .limit(1);

    if (!reporter) {
      console.warn('⚠ No user found for deficiency reporting. Skipping deficiencies.');
    } else {
      // Create sample deficiencies
      const deficiencies = [
        {
          jobId: job.id,
          deviceId: fireAlarmDevice?.id || null,
          reportedById: reporter.id,
          status: 'open',
          severity: 'critical',
          systemCategory: 'FIRE_ALARM',
          title: 'Smoke Detector Failed Test',
          description: 'Smoke detector in Electrical Room did not respond to smoke test.',
          observedIssue: 'Device did not activate when smoke was introduced',
          correctiveAction: 'Replace smoke detector unit',
          customerExplanation: 'The smoke detector requires immediate replacement to ensure fire safety compliance.',
          codeReference: 'CAN/ULC-S536 Section 5.2',
        },
        {
          jobId: job.id,
          deviceId: emergencyLightDevice?.id || null,
          reportedById: reporter.id,
          status: 'open',
          severity: 'minor',
          systemCategory: 'EMERGENCY_LIGHTING',
          title: 'Emergency Light Battery Failure',
          description: 'Emergency light battery did not maintain illumination for required 90 minutes.',
          observedIssue: 'Battery depleted after 45 minutes during test',
          correctiveAction: 'Replace battery pack',
          customerExplanation: 'The emergency light battery needs replacement to meet the 90-minute backup requirement.',
          codeReference: 'BC Building Code 3.2.7',
        },
        {
          jobId: job.id,
          deviceId: extinguisherDevice?.id || null,
          reportedById: reporter.id,
          status: 'open',
          severity: 'major',
          systemCategory: 'FIRE_EXTINGUISHER',
          title: 'Fire Extinguisher Overdue 6-Year Maintenance',
          description: 'Fire extinguisher in Main Lobby is overdue for 6-year internal inspection.',
          observedIssue: 'Last internal inspection was 7 years ago',
          correctiveAction: 'Perform 6-year internal inspection and recharge',
          customerExplanation: 'The fire extinguisher requires a complete internal inspection and recharge to maintain certification.',
          codeReference: 'NFPA 10 Section 7.3.1',
        },
        {
          jobId: job.id,
          deviceId: null,
          reportedById: reporter.id,
          status: 'open',
          severity: 'minor',
          systemCategory: 'SPRINKLER',
          title: 'Sprinkler Gauge Out of Date',
          description: 'Pressure gauge on wet sprinkler system is past its 5-year certification date.',
          observedIssue: 'Gauge certification expired 6 months ago',
          correctiveAction: 'Replace pressure gauge with certified unit',
          customerExplanation: 'The pressure gauge needs replacement to ensure accurate system monitoring.',
          codeReference: 'NFPA 25 Section 5.2.4',
        },
      ];

      for (const def of deficiencies) {
        await db.insert(schema.deficiencies).values(def);
      }
      console.log(`✓ Created ${deficiencies.length} sample deficiencies`);
    }

    console.log('\n✅ Demo Test Facility seeding complete!\n');
    console.log('Summary:');
    console.log(`  - Site: ${site.name} (ID: ${site.id})`);
    console.log(`  - Job: ${job.title} (ID: ${job.id})`);
    console.log(`  - Fire Alarm Devices: 15`);
    console.log(`  - Fire Extinguishers: 8`);
    console.log(`  - Emergency Lights: 6`);
    console.log(`  - Deficiencies: 4`);
    console.log(`\n🎯 Navigate to Job ID ${job.id} to start testing!\n`);

  } catch (error) {
    console.error('❌ Error seeding demo facility:', error);
    throw error;
  }
}

// Run the seed script
seedDemoFacility()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
