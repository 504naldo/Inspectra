// Checklist validation and completeness audit

import type { InspectionChecklistResponse } from '../drizzle/schema';

// Define all required checklist items (from complianceChecklists.ts)
const REQUIRED_CHECKLIST_ITEMS = [
  // Section 22.1: Control Unit Inspection (10 items)
  { sectionNumber: '22.1', itemId: 'A', description: 'Input circuit designations correctly identified' },
  { sectionNumber: '22.1', itemId: 'B', description: 'Output circuit designations correctly identified' },
  { sectionNumber: '22.1', itemId: 'C', description: 'Correct designations for common control functions' },
  { sectionNumber: '22.1', itemId: 'D', description: 'Plug-in components and modules securely in place' },
  { sectionNumber: '22.1', itemId: 'E', description: 'Plug-in cables securely in place' },
  { sectionNumber: '22.1', itemId: 'F', description: 'Record firmware and software version' },
  { sectionNumber: '22.1', itemId: 'G', description: 'Clean and free of dust and dirt' },
  { sectionNumber: '22.1', itemId: 'H', description: 'Fuses in accordance with manufacturer specification' },
  { sectionNumber: '22.1', itemId: 'I', description: 'Control unit lock functional' },
  { sectionNumber: '22.1', itemId: 'J', description: 'Termination points secure' },
  
  // Section 22.2: Control Unit Test (30 items)
  { sectionNumber: '22.2', itemId: 'A', description: 'Power ON visual indicator operates' },
  { sectionNumber: '22.2', itemId: 'B', description: 'Time and date corresponds with local time' },
  { sectionNumber: '22.2', itemId: 'C', description: 'Common visual trouble signal operates' },
  { sectionNumber: '22.2', itemId: 'D', description: 'Common audible trouble signal operates' },
  { sectionNumber: '22.2', itemId: 'E', description: 'Trouble signal silence switch operates' },
  { sectionNumber: '22.2', itemId: 'F', description: 'Main power supply failure trouble signal operates' },
  { sectionNumber: '22.2', itemId: 'G', description: 'Trouble signal operates during ground fault tests' },
  { sectionNumber: '22.2', itemId: 'H', description: 'Alert signal operates' },
  { sectionNumber: '22.2', itemId: 'I', description: 'Alarm signal operates' },
  { sectionNumber: '22.2', itemId: 'J', description: 'Automatic transfer alert to alarm operates' },
  { sectionNumber: '22.2', itemId: 'K', description: 'Manual transfer alert to alarm operates' },
  { sectionNumber: '22.2', itemId: 'L', description: 'Automatic transfer cancel feature operates' },
  { sectionNumber: '22.2', itemId: 'M', description: 'Alarm signal silence inhibit function operates' },
  { sectionNumber: '22.2', itemId: 'N', description: 'Alarm signal manual silence operates' },
  { sectionNumber: '22.2', itemId: 'O', description: 'Alarm signal silence visual indication operates' },
  { sectionNumber: '22.2', itemId: 'P', description: 'Alarm signals reinitiate on subsequent alarm' },
  { sectionNumber: '22.2', itemId: 'Q', description: 'Duration of alarm signal prior to silence' },
  { sectionNumber: '22.2', itemId: 'R', description: 'Alert/alarm signals operate per specification' },
  { sectionNumber: '22.2', itemId: 'S', description: 'Input circuit alarm/supervisory operation' },
  { sectionNumber: '22.2', itemId: 'T', description: 'Input circuit supervision fault causes trouble' },
  { sectionNumber: '22.2', itemId: 'U', description: 'Output circuit alarm indicators operate' },
  { sectionNumber: '22.2', itemId: 'V', description: 'Output circuit supervision fault causes trouble' },
  { sectionNumber: '22.2', itemId: 'W', description: 'Visual indicator test operates' },
  { sectionNumber: '22.2', itemId: 'X', description: 'Coded signal sequences operate correctly' },
  { sectionNumber: '22.2', itemId: 'Y', description: 'Coded signals not interrupted by alarms' },
  { sectionNumber: '22.2', itemId: 'Z', description: 'Ancillary device by-pass causes trouble signal' },
  { sectionNumber: '22.2', itemId: 'AA', description: 'Input to output circuit operation correct' },
  { sectionNumber: '22.2', itemId: 'BB', description: 'System Reset operates' },
  { sectionNumber: '22.2', itemId: 'CC', description: 'Transfer to emergency power operates' },
  { sectionNumber: '22.2', itemId: 'DD', description: 'Smoke detector alarm verification verified' },
  
  // Section 22.4: Power Supply Inspection (8 items)
  { sectionNumber: '22.4', itemId: 'A', description: 'Fuses in accordance with specification' },
  { sectionNumber: '22.4', itemId: 'B', description: 'Termination points secure' },
  { sectionNumber: '22.4', itemId: 'C', description: 'Plug-in components securely in place' },
  { sectionNumber: '22.4', itemId: 'D', description: 'Plug-in cables securely in place' },
  { sectionNumber: '22.4', itemId: 'E', description: 'Clean and free of dust' },
  { sectionNumber: '22.4', itemId: 'F', description: 'Enclosure door lock functional' },
  { sectionNumber: '22.4', itemId: 'G', description: 'Enclosure door gasket in good condition' },
  { sectionNumber: '22.4', itemId: 'H', description: 'Enclosure door securely closed' },
  
  // Section 22.5: Emergency Power Supply (8 items)
  { sectionNumber: '22.5', itemId: 'A', description: 'Batteries securely mounted' },
  { sectionNumber: '22.5', itemId: 'B', description: 'Battery terminals clean' },
  { sectionNumber: '22.5', itemId: 'C', description: 'Battery connections secure' },
  { sectionNumber: '22.5', itemId: 'D', description: 'Battery voltage within specification' },
  { sectionNumber: '22.5', itemId: 'E', description: 'Battery charger operates' },
  { sectionNumber: '22.5', itemId: 'F', description: 'Battery discharge test performed' },
  { sectionNumber: '22.5', itemId: 'G', description: 'Battery capacity adequate' },
  { sectionNumber: '22.5', itemId: 'H', description: 'Automatic transfer to emergency power operates' },
  
  // Section 22.6: Annunciator Test (13 items)
  { sectionNumber: '22.6', itemId: 'A', description: 'Annunciator visual indicators operate' },
  { sectionNumber: '22.6', itemId: 'B', description: 'Annunciator audible indicators operate' },
  { sectionNumber: '22.6', itemId: 'C', description: 'Annunciator trouble signals operate' },
  { sectionNumber: '22.6', itemId: 'D', description: 'Annunciator alarm signals operate' },
  { sectionNumber: '22.6', itemId: 'E', description: 'Annunciator supervisory signals operate' },
  { sectionNumber: '22.6', itemId: 'F', description: 'Annunciator silence switch operates' },
  { sectionNumber: '22.6', itemId: 'G', description: 'Annunciator reset switch operates' },
  { sectionNumber: '22.6', itemId: 'H', description: 'Annunciator lamp test operates' },
  { sectionNumber: '22.6', itemId: 'I', description: 'Annunciator zone identification correct' },
  { sectionNumber: '22.6', itemId: 'J', description: 'Annunciator enclosure secure' },
  { sectionNumber: '22.6', itemId: 'K', description: 'Annunciator clean and free of dust' },
  { sectionNumber: '22.6', itemId: 'L', description: 'Annunciator wiring secure' },
  { sectionNumber: '22.6', itemId: 'M', description: 'Annunciator communication operates' },
  
  // Section 22.7: Circuit Supervision (6 items)
  { sectionNumber: '22.7', itemId: 'A', description: 'Alarm initiating circuit supervision operates' },
  { sectionNumber: '22.7', itemId: 'B', description: 'Supervisory initiating circuit supervision operates' },
  { sectionNumber: '22.7', itemId: 'C', description: 'Trouble initiating circuit supervision operates' },
  { sectionNumber: '22.7', itemId: 'D', description: 'Alarm signal circuit supervision operates' },
  { sectionNumber: '22.7', itemId: 'E', description: 'Supervisory signal circuit supervision operates' },
  { sectionNumber: '22.7', itemId: 'F', description: 'Ancillary device circuit supervision operates' },
  
  // Section 22.8: Smoke Detectors (5 items)
  { sectionNumber: '22.8', itemId: 'A', description: 'Detector clean and free of dust' },
  { sectionNumber: '22.8', itemId: 'B', description: 'Detector securely mounted' },
  { sectionNumber: '22.8', itemId: 'C', description: 'Detector alarm operation confirmed' },
  { sectionNumber: '22.8', itemId: 'D', description: 'Detector address/zone indication correct' },
  { sectionNumber: '22.8', itemId: 'E', description: 'Detector sensitivity within specification' },
  
  // Section 22.9: Heat Detectors (4 items)
  { sectionNumber: '22.9', itemId: 'A', description: 'Detector clean and free of dust' },
  { sectionNumber: '22.9', itemId: 'B', description: 'Detector securely mounted' },
  { sectionNumber: '22.9', itemId: 'C', description: 'Detector alarm operation confirmed' },
  { sectionNumber: '22.9', itemId: 'D', description: 'Detector address/zone indication correct' },
  
  // Section 22.10: Duct Detectors (6 items)
  { sectionNumber: '22.10', itemId: 'A', description: 'Detector clean and free of dust' },
  { sectionNumber: '22.10', itemId: 'B', description: 'Detector securely mounted' },
  { sectionNumber: '22.10', itemId: 'C', description: 'Detector alarm operation confirmed' },
  { sectionNumber: '22.10', itemId: 'D', description: 'Detector address/zone indication correct' },
  { sectionNumber: '22.10', itemId: 'E', description: 'Ancillary device circuit operation confirmed' },
  { sectionNumber: '22.10', itemId: 'F', description: 'Sampling tubes clean and unobstructed' },
  
  // Section 22.11: Manual Pull Stations (5 items)
  { sectionNumber: '22.11', itemId: 'A', description: 'Station clean and free of damage' },
  { sectionNumber: '22.11', itemId: 'B', description: 'Station securely mounted' },
  { sectionNumber: '22.11', itemId: 'C', description: 'Station alarm operation confirmed' },
  { sectionNumber: '22.11', itemId: 'D', description: 'Station address/zone indication correct' },
  { sectionNumber: '22.11', itemId: 'E', description: 'Station operating instructions visible' },
  
  // Section 22.12: Waterflow Devices (5 items)
  { sectionNumber: '22.12', itemId: 'A', description: 'Device clean and free of damage' },
  { sectionNumber: '22.12', itemId: 'B', description: 'Device securely mounted' },
  { sectionNumber: '22.12', itemId: 'C', description: 'Device alarm operation confirmed' },
  { sectionNumber: '22.12', itemId: 'D', description: 'Device address/zone indication correct' },
  { sectionNumber: '22.12', itemId: 'E', description: 'Time delay setting verified' },
  
  // Section 22.13: Supervisory Devices (4 items)
  { sectionNumber: '22.13', itemId: 'A', description: 'Device clean and free of damage' },
  { sectionNumber: '22.13', itemId: 'B', description: 'Device securely mounted' },
  { sectionNumber: '22.13', itemId: 'C', description: 'Device supervisory signal operation confirmed' },
  { sectionNumber: '22.13', itemId: 'D', description: 'Device address/zone indication correct' },
  
  // Section 22.14: Fire Signal Receiving Centre (8 items)
  { sectionNumber: '22.14', itemId: 'A', description: 'Transmitter integral to control unit' },
  { sectionNumber: '22.14', itemId: 'B', description: 'Alarm transmission receipt confirmed' },
  { sectionNumber: '22.14', itemId: 'C', description: 'Supervisory transmission receipt confirmed' },
  { sectionNumber: '22.14', itemId: 'D', description: 'Trouble transmission receipt confirmed' },
  { sectionNumber: '22.14', itemId: 'E', description: 'Transmitter disconnect causes trouble signal' },
  { sectionNumber: '22.14', itemId: 'F', description: 'Transmitter disconnect transmits trouble' },
  { sectionNumber: '22.14', itemId: 'G', description: 'Company name and telephone recorded' },
  { sectionNumber: '22.14', itemId: 'H', description: 'Disconnect means transmits trouble' },
  
  // Section 22.15: Audible Signaling Devices (5 items)
  { sectionNumber: '22.15', itemId: 'A', description: 'Device clean and free of damage' },
  { sectionNumber: '22.15', itemId: 'B', description: 'Device securely mounted' },
  { sectionNumber: '22.15', itemId: 'C', description: 'Device audible signal operation confirmed' },
  { sectionNumber: '22.15', itemId: 'D', description: 'Device sound level adequate' },
  { sectionNumber: '22.15', itemId: 'E', description: 'Device operates on correct signal circuit' },
  
  // Section 22.16: Visual Signaling Devices (5 items)
  { sectionNumber: '22.16', itemId: 'A', description: 'Device clean and free of damage' },
  { sectionNumber: '22.16', itemId: 'B', description: 'Device securely mounted' },
  { sectionNumber: '22.16', itemId: 'C', description: 'Device visual signal operation confirmed' },
  { sectionNumber: '22.16', itemId: 'D', description: 'Device flash rate within specification' },
  { sectionNumber: '22.16', itemId: 'E', description: 'Device operates on correct signal circuit' },
];

export interface MissingChecklistItem {
  sectionNumber: string;
  itemId: string;
  description: string;
}

export interface ChecklistAuditResult {
  isComplete: boolean;
  totalRequired: number;
  totalCompleted: number;
  missingItems: MissingChecklistItem[];
  completionPercentage: number;
}

/**
 * Audit checklist completeness for a job
 * @param responses Saved checklist responses from database
 * @returns Audit result with completeness status and missing items
 */
export function auditChecklistCompleteness(
  responses: InspectionChecklistResponse[]
): ChecklistAuditResult {
  // Build a set of completed items for quick lookup
  const completedKeys = new Set<string>();
  responses.forEach(r => {
    const key = `${r.sectionNumber}-${r.itemId}`;
    completedKeys.add(key);
  });
  
  // Find missing items
  const missingItems: MissingChecklistItem[] = [];
  REQUIRED_CHECKLIST_ITEMS.forEach(item => {
    const key = `${item.sectionNumber}-${item.itemId}`;
    if (!completedKeys.has(key)) {
      missingItems.push({
        sectionNumber: item.sectionNumber,
        itemId: item.itemId,
        description: item.description,
      });
    }
  });
  
  const totalRequired = REQUIRED_CHECKLIST_ITEMS.length;
  const totalCompleted = totalRequired - missingItems.length;
  const completionPercentage = Math.round((totalCompleted / totalRequired) * 100);
  
  return {
    isComplete: missingItems.length === 0,
    totalRequired,
    totalCompleted,
    missingItems,
    completionPercentage,
  };
}

/**
 * Format missing items for user-friendly error message
 */
export function formatMissingItemsMessage(missingItems: MissingChecklistItem[]): string {
  if (missingItems.length === 0) {
    return 'All checklist items completed.';
  }
  
  // Group by section
  const bySection = new Map<string, MissingChecklistItem[]>();
  missingItems.forEach(item => {
    const existing = bySection.get(item.sectionNumber) || [];
    existing.push(item);
    bySection.set(item.sectionNumber, existing);
  });
  
  const lines: string[] = ['Incomplete checklist items:'];
  bySection.forEach((items, sectionNumber) => {
    lines.push(`\nSection ${sectionNumber}: ${items.length} items missing`);
    items.slice(0, 5).forEach(item => {
      lines.push(`  - ${item.itemId}: ${item.description}`);
    });
    if (items.length > 5) {
      lines.push(`  ... and ${items.length - 5} more`);
    }
  });
  
  return lines.join('\n');
}
