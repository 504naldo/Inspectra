import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function importDevices() {
  // Read the extracted devices
  const data = JSON.parse(fs.readFileSync('/home/ubuntu/fire-inspect/complete_devices.json', 'utf8'));
  console.log(`Loaded ${data.total_devices} devices from JSON`);

  // Parse DATABASE_URL
  const url = new URL(DATABASE_URL);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: url.port || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: true }
  });

  console.log('Connected to database');

  // Get the site ID for 12500 Trites Road (use companyId 2 which is the user's company)
  const [sites] = await connection.execute('SELECT id FROM sites WHERE name LIKE ? AND companyId = 2', ['%Trites%']);
  if (sites.length === 0) {
    console.error('Site not found!');
    await connection.end();
    return;
  }
  const siteId = sites[0].id;
  console.log(`Found site ID: ${siteId}`);

  // Get the job ID
  const [jobs] = await connection.execute('SELECT id FROM jobs WHERE siteId = ?', [siteId]);
  if (jobs.length === 0) {
    console.error('Job not found!');
    await connection.end();
    return;
  }
  const jobId = jobs[0].id;
  console.log(`Found job ID: ${jobId}`);

  // Get existing device count
  const [existingDevices] = await connection.execute('SELECT COUNT(*) as count FROM devices WHERE siteId = ?', [siteId]);
  console.log(`Existing devices for site: ${existingDevices[0].count}`);

  // Insert devices
  let insertedCount = 0;
  let skippedCount = 0;

  for (const device of data.devices) {
    try {
      // Check if device already exists by serial number
      const [existing] = await connection.execute(
        'SELECT id FROM devices WHERE serialNumber = ? AND siteId = ?',
        [device.serialNumber, siteId]
      );

      if (existing.length > 0) {
        skippedCount++;
        continue;
      }

      // Insert the device
      const [result] = await connection.execute(
        `INSERT INTO devices (siteId, deviceType, location, manufacturer, model, serialNumber, isActive, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          siteId,
          device.deviceType,
          device.location,
          device.manufacturer,
          device.model,
          device.serialNumber,
          true,
          device.notes
        ]
      );

      const deviceId = result.insertId;

      // Insert inspection result (use correct table name with underscore)
      try {
        await connection.execute(
          `INSERT INTO inspection_results (jobId, deviceId, technicianId, result, notes, testedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            jobId,
            deviceId,
            1, // Default technician ID
            device.testResult.toLowerCase(),
            device.testNotes
          ]
        );
      } catch (e) {
        // Inspection result insert failed, but device was added
        console.log(`Device ${device.serialNumber} added, but inspection result skipped`);
      }

      insertedCount++;
    } catch (error) {
      console.error(`Error inserting device ${device.serialNumber}:`, error.message);
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  Inserted: ${insertedCount}`);
  console.log(`  Skipped (duplicates): ${skippedCount}`);

  // Get final count
  const [finalCount] = await connection.execute('SELECT COUNT(*) as count FROM devices WHERE siteId = ?', [siteId]);
  console.log(`  Total devices for site: ${finalCount[0].count}`);

  await connection.end();
}

importDevices().catch(console.error);
