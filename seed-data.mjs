#!/usr/bin/env node
/**
 * Seed script to populate Fire Inspect Pro with data from the Excel file
 * Run with: node seed-data.mjs
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Read extracted data
const data = JSON.parse(readFileSync('./final_extracted_data.json', 'utf-8'));

async function seed() {
  // Connect to database
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  console.log('Starting database seed...');
  console.log('Data summary:');
  console.log(`  - Site: ${data.site.name}`);
  console.log(`  - Devices: ${data.devices.length}`);
  console.log(`  - Deficiencies: ${data.deficiencies.length}`);

  try {
    // Check if we already have data
    const [existingCompanies] = await connection.execute('SELECT COUNT(*) as count FROM companies');
    if (existingCompanies[0].count > 0) {
      console.log('\n⚠️  Data already exists. Skipping seed to avoid duplicates.');
      console.log('   To re-seed, clear the database first.');
      
      // Show existing data counts
      const [jobs] = await connection.execute('SELECT COUNT(*) as count FROM jobs');
      const [devices] = await connection.execute('SELECT COUNT(*) as count FROM devices');
      const [deficiencies] = await connection.execute('SELECT COUNT(*) as count FROM deficiencies');
      
      console.log('\nExisting data:');
      console.log(`  - Jobs: ${jobs[0].count}`);
      console.log(`  - Devices: ${devices[0].count}`);
      console.log(`  - Deficiencies: ${deficiencies[0].count}`);
      
      await connection.end();
      return;
    }

    // 1. Create company
    console.log('\n1. Creating company...');
    const [companyResult] = await connection.execute(
      `INSERT INTO companies (name, address, phone, email, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      ['E.W.F. Services Inc', '12500 Trites Road, Richmond, BC', '', '']
    );
    const companyId = companyResult.insertId;
    console.log(`   Company ID: ${companyId}`);

    // 2. Create customer organization
    console.log('\n2. Creating customer organization...');
    const [customerResult] = await connection.execute(
      `INSERT INTO customer_orgs (companyId, name, contactName, contactEmail, contactPhone, address, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [companyId, 'Trites Road Strata', data.customer.contact_name || 'Gerald Phang', '', '', `${data.site.address}, ${data.site.city}, ${data.site.state}`]
    );
    const customerOrgId = customerResult.insertId;
    console.log(`   Customer Org ID: ${customerOrgId}`);

    // 3. Create site
    console.log('\n3. Creating site...');
    const [siteResult] = await connection.execute(
      `INSERT INTO sites (companyId, customerOrgId, name, address, city, state, postalCode, contactName, contactPhone, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [companyId, customerOrgId, data.site.name, data.site.address, data.site.city, data.site.state, '', data.customer.contact_name || '', '', data.job.notes || '']
    );
    const siteId = siteResult.insertId;
    console.log(`   Site ID: ${siteId}`);

    // 4. Create areas for the site
    console.log('\n4. Creating areas...');
    const areas = ['Parkade', 'Main Floor', 'Electrical Room', 'Office', 'Stairwells'];
    const areaIds = {};
    
    for (const areaName of areas) {
      const [areaResult] = await connection.execute(
        `INSERT INTO areas (siteId, name, floor, description, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [siteId, areaName, '', '']
      );
      areaIds[areaName] = areaResult.insertId;
      console.log(`   Area: ${areaName} (ID: ${areaResult.insertId})`);
    }

    // 5. Create devices
    console.log('\n5. Creating devices...');
    let deviceCount = 0;
    const deviceIds = [];
    
    for (const device of data.devices) {
      // Determine area based on location
      let areaId = areaIds['Main Floor'];
      const locationLower = (device.location || '').toLowerCase();
      
      if (locationLower.includes('parkade') || locationLower.includes('parking') || locationLower.includes('stall')) {
        areaId = areaIds['Parkade'];
      } else if (locationLower.includes('electrical')) {
        areaId = areaIds['Electrical Room'];
      } else if (locationLower.includes('office') || locationLower.includes('kitchen')) {
        areaId = areaIds['Office'];
      } else if (locationLower.includes('stair')) {
        areaId = areaIds['Stairwells'];
      }

      const [deviceResult] = await connection.execute(
        `INSERT INTO devices (siteId, areaId, deviceType, manufacturer, model, serialNumber, location, installDate, lastInspectionDate, isActive, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, NOW(), NOW())`,
        [siteId, areaId, device.device_type, device.manufacturer || '', device.model || '', device.serial_number || '', device.location || '', device.notes || '']
      );
      deviceIds.push(deviceResult.insertId);
      deviceCount++;
    }
    console.log(`   Created ${deviceCount} devices`);

    // 6. Create job/inspection
    console.log('\n6. Creating job...');
    const [jobResult] = await connection.execute(
      `INSERT INTO jobs (companyId, siteId, customerOrgId, jobNumber, title, description, jobType, status, priority, scheduledDate, assignedTechnicianId, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NOW(), NOW())`,
      [companyId, siteId, customerOrgId, data.job.job_number, `Annual Inspection - ${data.site.name}`, 'Annual fire alarm and life safety inspection', 'annual', 'in_progress', 'medium', new Date(data.job.scheduled_date), data.job.notes || '']
    );
    const jobId = jobResult.insertId;
    console.log(`   Job ID: ${jobId}`);

    // 7. Create deficiencies (using correct schema: title, reportedById required)
    console.log('\n7. Creating deficiencies...');
    let defCount = 0;
    
    for (const def of data.deficiencies) {
      // Map severity
      let severityValue = 'major';
      if (def.severity === 'high') severityValue = 'critical';
      else if (def.severity === 'low') severityValue = 'minor';
      else if (def.severity === 'observation') severityValue = 'observation';
      
      const title = def.description.substring(0, 250);
      
      const [defResult] = await connection.execute(
        `INSERT INTO deficiencies (jobId, deviceId, reportedById, status, severity, title, description, observedIssue, correctiveAction, customerExplanation, aiGenerated, createdAt, updatedAt)
         VALUES (?, NULL, 1, 'open', ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [jobId, severityValue, title, def.description, def.location || '', '', '']
      );
      defCount++;
    }
    console.log(`   Created ${defCount} deficiencies`);

    // 8. Create inspection results
    console.log('\n8. Creating inspection results...');
    let resultCount = 0;
    
    for (let i = 0; i < Math.min(deviceIds.length, 20); i++) {
      const result = Math.random() > 0.1 ? 'pass' : 'fail';
      await connection.execute(
        `INSERT INTO inspection_results (jobId, deviceId, result, notes, testedAt, testedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, NOW(), NULL, NOW(), NOW())`,
        [jobId, deviceIds[i], result, '']
      );
      resultCount++;
    }
    console.log(`   Created ${resultCount} inspection results`);

    console.log('\n✅ Database seeded successfully!');
    console.log('\nSummary:');
    console.log(`  - 1 Company: E.W.F. Services Inc`);
    console.log(`  - 1 Customer: Trites Road Strata`);
    console.log(`  - 1 Site: ${data.site.name}`);
    console.log(`  - ${Object.keys(areaIds).length} Areas`);
    console.log(`  - ${deviceCount} Devices`);
    console.log(`  - 1 Job: ${data.job.job_number}`);
    console.log(`  - ${defCount} Deficiencies`);
    console.log(`  - ${resultCount} Inspection Results`);

  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

seed().catch(console.error);
