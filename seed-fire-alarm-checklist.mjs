import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// Clear existing checklist templates
await connection.execute('DELETE FROM fire_alarm_checklist_templates');
console.log('Cleared existing checklist templates');

// Define the fire alarm checklist sections with input types based on PDF analysis
const checklistSections = [
  {
    sectionName: 'Documentation',
    sectionOrder: 1,
    items: [
      { letter: 'A', description: 'Verify that the following documentation is available at the building', inputType: 'checkbox' },
      { letter: 'B', description: 'Record drawings', inputType: 'checkbox' },
      { letter: 'C', description: 'Wiring diagrams', inputType: 'checkbox' },
      { letter: 'D', description: 'Operating and maintenance instructions', inputType: 'checkbox' },
      { letter: 'E', description: 'Verification and commissioning report', inputType: 'checkbox' },
      { letter: 'F', description: 'Previous test and inspection reports', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Control Unit/Transponder Inspection & Test',
    sectionOrder: 2,
    items: [
      { letter: 'A', description: 'Verify that the control unit/transponder is securely mounted', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify that the control unit/transponder is clean and free from damage', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify that all connections are tight and free from corrosion', inputType: 'checkbox' },
      { letter: 'D', description: 'Firmware/Software Version', inputType: 'text', numericLabel: 'Version:', numericUnit: '' },
      { letter: 'E', description: 'Verify operation of all control unit/transponder indicators', inputType: 'checkbox' },
      { letter: 'F', description: 'Verify operation of all control unit/transponder controls', inputType: 'checkbox' },
      { letter: 'G', description: 'Test ground fault detection', inputType: 'checkbox' },
      { letter: 'H', description: 'Test trouble signal transmission', inputType: 'checkbox' },
      { letter: 'I', description: 'Test supervisory signal transmission', inputType: 'checkbox' },
      { letter: 'J', description: 'Test alarm signal transmission', inputType: 'checkbox' },
      { letter: 'K', description: 'Verify that all zone/device labels are correct and legible', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Voice Communication Test',
    sectionOrder: 3,
    items: [
      { letter: 'A', description: 'Test microphone operation', inputType: 'checkbox' },
      { letter: 'B', description: 'Test speaker operation in all zones', inputType: 'checkbox' },
      { letter: 'C', description: 'Test pre-recorded messages', inputType: 'checkbox' },
      { letter: 'D', description: 'Test manual voice communication', inputType: 'checkbox' },
      { letter: 'E', description: 'Test automatic voice communication', inputType: 'checkbox' },
      { letter: 'F', description: 'Verify intelligibility of voice messages', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Emergency Power Supply Test',
    sectionOrder: 4,
    items: [
      { letter: 'A', description: 'Battery Manufacturer', inputType: 'text', numericLabel: 'Manufacturer:', numericUnit: '' },
      { letter: 'B', description: 'Battery Model', inputType: 'text', numericLabel: 'Model:', numericUnit: '' },
      { letter: 'C', description: 'Battery Rated Voltage', inputType: 'voltage', numericLabel: 'Voltage:', numericUnit: 'V' },
      { letter: 'D', description: 'Battery Rated Capacity', inputType: 'numeric', numericLabel: 'Capacity:', numericUnit: 'A•h' },
      { letter: 'E', description: 'Battery Quantity', inputType: 'numeric', numericLabel: 'Quantity:', numericUnit: '' },
      { letter: 'F', description: 'Battery Installation Year', inputType: 'year', numericLabel: 'Year:', numericUnit: '' },
      { letter: 'G', description: 'Verify battery connections are clean and tight', inputType: 'checkbox' },
      { letter: 'H', description: 'Charger Voltage (Normal)', inputType: 'voltage', numericLabel: 'Voltage:', numericUnit: 'V' },
      { letter: 'I', description: 'Charger Current (Normal)', inputType: 'current', numericLabel: 'Current:', numericUnit: 'A' },
      { letter: 'J', description: 'Disconnect AC power and verify automatic transfer to battery', inputType: 'checkbox' },
      { letter: 'K', description: 'Battery Voltage (Under Load)', inputType: 'voltage', numericLabel: 'Voltage:', numericUnit: 'V' },
      { letter: 'L', description: 'Battery Current (Under Load)', inputType: 'current', numericLabel: 'Current:', numericUnit: 'A' },
      { letter: 'M', description: 'Verify trouble signal is transmitted', inputType: 'checkbox' },
      { letter: 'N', description: 'Reconnect AC power and verify automatic transfer', inputType: 'checkbox' },
      { letter: 'O', description: 'AC Voltage Restored', inputType: 'voltage', numericLabel: 'Voltage:', numericUnit: 'V' },
      { letter: 'P', description: 'Charger Voltage (Charging)', inputType: 'voltage', numericLabel: 'Voltage:', numericUnit: 'V' },
      { letter: 'Q', description: 'Charger Current (Charging)', inputType: 'current', numericLabel: 'Current:', numericUnit: 'A' },
      { letter: 'R', description: 'Time for automatic transfer (seconds)', inputType: 'time', numericLabel: 'Time:', numericUnit: 's' },
    ]
  },
  {
    sectionName: 'Emergency Power Generator Tests',
    sectionOrder: 5,
    items: [
      { letter: 'A', description: 'Test generator automatic start on AC power failure', inputType: 'checkbox' },
      { letter: 'B', description: 'Test generator automatic transfer switch', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify generator runs under load for minimum 30 minutes', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Annunciator/Display Test',
    sectionOrder: 6,
    items: [
      { letter: 'A', description: 'Verify annunciator is securely mounted', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify annunciator is clean and free from damage', inputType: 'checkbox' },
      { letter: 'C', description: 'Test all annunciator indicators', inputType: 'checkbox' },
      { letter: 'D', description: 'Test all annunciator controls', inputType: 'checkbox' },
      { letter: 'E', description: 'Verify zone/device identification is correct', inputType: 'checkbox' },
      { letter: 'F', description: 'Test alarm indication', inputType: 'checkbox' },
      { letter: 'G', description: 'Test supervisory indication', inputType: 'checkbox' },
      { letter: 'H', description: 'Test trouble indication', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Remote Trouble Unit',
    sectionOrder: 7,
    items: [
      { letter: 'A', description: 'Verify remote trouble unit is securely mounted', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify remote trouble unit is clean and free from damage', inputType: 'checkbox' },
      { letter: 'C', description: 'Test trouble signal indication', inputType: 'checkbox' },
      { letter: 'D', description: 'Test audible trouble signal', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Ancillary Device Circuit Test',
    sectionOrder: 8,
    items: [
      { letter: 'A', description: 'Test all ancillary device circuits for proper operation', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify ancillary devices activate as intended', inputType: 'checkbox' },
      { letter: 'C', description: 'Test supervision of ancillary device circuits', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Fire Signal Receiving Centre Interconnection',
    sectionOrder: 9,
    items: [
      { letter: 'A', description: 'Monitoring Centre Name', inputType: 'text', numericLabel: 'Name:', numericUnit: '' },
      { letter: 'B', description: 'Monitoring Centre Phone', inputType: 'text', numericLabel: 'Phone:', numericUnit: '' },
      { letter: 'C', description: 'Test alarm signal transmission to monitoring centre', inputType: 'checkbox' },
      { letter: 'D', description: 'Test supervisory signal transmission to monitoring centre', inputType: 'checkbox' },
      { letter: 'E', description: 'Test trouble signal transmission to monitoring centre', inputType: 'checkbox' },
      { letter: 'F', description: 'Verify monitoring centre acknowledges receipt of signals', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Manual Station Test',
    sectionOrder: 10,
    items: [
      { letter: 'A', description: 'Test operation of all manual pull stations', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify manual stations are properly labeled', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Smoke Detector Test',
    sectionOrder: 11,
    items: [
      { letter: 'A', description: 'Test operation of all smoke detectors', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify detectors are clean and free from contamination', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Heat Detector Test',
    sectionOrder: 12,
    items: [
      { letter: 'A', description: 'Test operation of all heat detectors', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Duct Detector Test',
    sectionOrder: 13,
    items: [
      { letter: 'A', description: 'Test operation of all duct detectors', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify HVAC shutdown/control operation', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Beam Detector Test',
    sectionOrder: 14,
    items: [
      { letter: 'A', description: 'Test operation of all beam detectors', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify beam alignment and sensitivity', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Waterflow Device Test',
    sectionOrder: 15,
    items: [
      { letter: 'A', description: 'Test operation of all waterflow devices', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify alarm signal is transmitted', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Supervisory Device Test',
    sectionOrder: 16,
    items: [
      { letter: 'A', description: 'Test operation of all supervisory devices', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify supervisory signal is transmitted', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Audible Signal Device Test',
    sectionOrder: 17,
    items: [
      { letter: 'A', description: 'Test operation of all audible signal devices', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify audibility throughout protected area', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify correct temporal pattern', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Visual Signal Device Test',
    sectionOrder: 18,
    items: [
      { letter: 'A', description: 'Test operation of all visual signal devices', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify visibility throughout protected area', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify correct flash rate', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'Door Hold-Open Device Test',
    sectionOrder: 19,
    items: [
      { letter: 'A', description: 'Test operation of all door hold-open devices', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify doors release on alarm', inputType: 'checkbox' },
      { letter: 'C', description: 'Verify doors close and latch properly', inputType: 'checkbox' },
    ]
  },
  {
    sectionName: 'System Restoration',
    sectionOrder: 20,
    items: [
      { letter: 'A', description: 'Reset all devices to normal condition', inputType: 'checkbox' },
      { letter: 'B', description: 'Verify system is in normal operating condition', inputType: 'checkbox' },
      { letter: 'C', description: 'Notify building management of test completion', inputType: 'checkbox' },
      { letter: 'D', description: 'Notify monitoring centre of test completion', inputType: 'checkbox' },
    ]
  },
];

let totalItems = 0;

for (const section of checklistSections) {
  console.log(`\nSection ${section.sectionOrder}: ${section.sectionName} (${section.items.length} items)`);
  
  for (const item of section.items) {
    try {
      await connection.execute(
        `INSERT INTO fire_alarm_checklist_templates 
        (sectionName, sectionOrder, itemLetter, itemDescription, requirementType, isRequired, inputType, numericLabel, numericUnit) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          section.sectionName,
          section.sectionOrder,
          item.letter,
          item.description,
          'both', // all items apply to both inspection and test
          true,
          item.inputType || 'checkbox',
          item.numericLabel || null,
          item.numericUnit || null
        ]
      );
      totalItems++;
    } catch (error) {
      console.error(`Error inserting item ${item.letter}: ${error.message}`);
    }
  }
}

console.log(`\n✓ Successfully inserted ${totalItems} checklist items across ${checklistSections.length} sections`);

await connection.end();
