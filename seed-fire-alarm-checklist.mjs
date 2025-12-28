import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import fs from 'fs';

config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Load the extracted fire alarm data
const fireAlarmData = JSON.parse(fs.readFileSync('/home/ubuntu/fire-inspect/fire_alarm_complete.json', 'utf8'));

console.log(`Loading ${fireAlarmData.length} sections into fire_alarm_checklist_templates...`);

let totalItems = 0;

for (let sectionIdx = 0; sectionIdx < fireAlarmData.length; sectionIdx++) {
  const section = fireAlarmData[sectionIdx];
  const sectionName = section.section;
  const sectionOrder = sectionIdx + 1;
  
  console.log(`\nSection ${sectionOrder}: ${sectionName} (${section.items.length} items)`);
  
  for (const item of section.items) {
    // Extract item letter from col_a (A, B, C, etc.)
    const itemLetter = item.col_a && item.col_a.trim().length <= 3 ? item.col_a.trim() : null;
    
    // Extract description from col_b (main description column)
    const itemDescription = item.col_b || item.col_c || item.col_a || '';
    
    // Skip empty items
    if (!itemDescription.trim() || itemDescription.trim().length < 10) {
      continue;
    }
    
    // Determine requirement type based on section name
    let requirementType = 'both';
    if (sectionName.toLowerCase().includes('inspection') && !sectionName.toLowerCase().includes('test')) {
      requirementType = 'inspection';
    } else if (sectionName.toLowerCase().includes('test') && !sectionName.toLowerCase().includes('inspection')) {
      requirementType = 'test';
    }
    
    try {
      await connection.execute(
        `INSERT INTO fire_alarm_checklist_templates 
        (sectionName, sectionOrder, itemLetter, itemDescription, requirementType, isRequired) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [sectionName, sectionOrder, itemLetter, itemDescription.substring(0, 5000), requirementType, true]
      );
      totalItems++;
    } catch (error) {
      console.error(`Error inserting item: ${error.message}`);
    }
  }
}

console.log(`\n✓ Successfully inserted ${totalItems} checklist items`);

await connection.end();
