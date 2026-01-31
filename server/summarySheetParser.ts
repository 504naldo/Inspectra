import type { SiteSummary } from "../drizzle/schema";

/**
 * Label-based parser for Excel Summary Sheet
 * Extracts site summary information by finding known labels and reading adjacent values
 */

// Known label patterns (case-insensitive)
const LABEL_PATTERNS = {
  clientName: [
    "name of client",
    "client name",
    "client:",
    "customer name",
  ],
  buildingName: [
    "name of building or site",
    "building name",
    "site name",
    "building:",
    "site:",
  ],
  siteAddress: [
    "site address",
    "street address",
    "location",
  ],
  billingAddress: [
    "billing address",
    "bill to",
    "billing:",
  ],
  contactName: [
    "contact name",
    "contact:",
    "name:",
  ],
  contactPhone: [
    "contact phone",
    "phone:",
    "telephone:",
  ],
  contactEmail: [
    "email:",
    "e-mail:",
    "contact email",
  ],
  contactPosition: [
    "position:",
    "role:",
    "title:",
  ],
  monitoringCompany: [
    "monitoring company",
    "alarm company",
    "central station",
  ],
  monitoringAccount: [
    "account #",
    "account number",
    "acct #",
  ],
  monitoringPhone: [
    "monitoring phone",
    "alarm phone",
  ],
  monitoringPassword: [
    "password:",
    "access code",
  ],
  buildingYear: [
    "building year",
    "year built",
    "construction year",
  ],
  buildingClass: [
    "building class",
    "class:",
    "occupancy class",
  ],
  buildingStories: [
    "stories:",
    "floors:",
    "number of floors",
  ],
  servicingHours: [
    "estimated servicing hours",
    "servicing hours",
    "hours estimate",
  ],
  repairBudget: [
    "repair budget",
    "budget:",
    "estimated cost",
  ],
};

/**
 * Normalize a cell value to a string for comparison
 */
function normalizeValue(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

/**
 * Check if a cell contains a known label
 */
function matchesLabel(cellValue: string, patterns: string[]): boolean {
  const normalized = normalizeValue(cellValue);
  return patterns.some(pattern => normalized.includes(pattern));
}

/**
 * Extract value from the cell to the right or below a label cell
 */
function extractAdjacentValue(
  sheet: any[][],
  rowIndex: number,
  colIndex: number
): string | undefined {
  // Try right cell first
  if (colIndex + 1 < sheet[rowIndex].length) {
    const rightValue = sheet[rowIndex][colIndex + 1];
    if (rightValue !== null && rightValue !== undefined && String(rightValue).trim() !== "") {
      return String(rightValue).trim();
    }
  }
  
  // Try cell below (check if row exists and has enough columns)
  if (rowIndex + 1 < sheet.length && sheet[rowIndex + 1]) {
    // Try same column first
    if (colIndex < sheet[rowIndex + 1].length) {
      const belowValue = sheet[rowIndex + 1][colIndex];
      if (belowValue !== null && belowValue !== undefined && String(belowValue).trim() !== "") {
        return String(belowValue).trim();
      }
    }
    // Try column to the right in the row below
    if (colIndex + 1 < sheet[rowIndex + 1].length) {
      const belowRightValue = sheet[rowIndex + 1][colIndex + 1];
      if (belowRightValue !== null && belowRightValue !== undefined && String(belowRightValue).trim() !== "") {
        return String(belowRightValue).trim();
      }
    }
  }
  
  return undefined;
}

/**
 * Parse contact list from Summary Sheet
 * Looks for rows with Name, Position, Phone, Email pattern
 */
function parseContacts(sheet: any[][]): Array<{ name?: string; role?: string; phone?: string; email?: string }> {
  const contacts: Array<{ name?: string; role?: string; phone?: string; email?: string }> = [];
  
  // Find header row with contact columns
  let headerRow = -1;
  let nameCol = -1;
  let roleCol = -1;
  let phoneCol = -1;
  let emailCol = -1;
  
  for (let r = 0; r < Math.min(sheet.length, 30); r++) {
    const row = sheet[r];
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeValue(row[c]);
      if (matchesLabel(cell, LABEL_PATTERNS.contactName)) {
        headerRow = r;
        nameCol = c;
      }
      if (matchesLabel(cell, LABEL_PATTERNS.contactPosition)) {
        roleCol = c;
      }
      if (matchesLabel(cell, LABEL_PATTERNS.contactPhone)) {
        phoneCol = c;
      }
      if (matchesLabel(cell, LABEL_PATTERNS.contactEmail)) {
        emailCol = c;
      }
    }
    if (headerRow !== -1) break;
  }
  
  // Parse contact rows
  if (headerRow !== -1 && nameCol !== -1) {
    for (let r = headerRow + 1; r < Math.min(sheet.length, headerRow + 10); r++) {
      const row = sheet[r];
      const name = nameCol !== -1 && row[nameCol] ? String(row[nameCol]).trim() : undefined;
      const role = roleCol !== -1 && row[roleCol] ? String(row[roleCol]).trim() : undefined;
      const phone = phoneCol !== -1 && row[phoneCol] ? String(row[phoneCol]).trim() : undefined;
      const email = emailCol !== -1 && row[emailCol] ? String(row[emailCol]).trim() : undefined;
      
      // Stop if we hit an empty name row
      if (!name || name === "") break;
      
      contacts.push({ name, role, phone, email });
    }
  }
  
  return contacts;
}

/**
 * Parse Summary Sheet from Excel workbook
 * @param sheet 2D array of cell values from Summary Sheet
 * @returns Parsed site summary object
 */
export function parseSummarySheet(sheet: any[][]): SiteSummary {
  const summary: SiteSummary = {
    client: {},
    building: {},
    address: {},
    billing: {},
    contacts: [],
    monitoring: {},
    estimates: {},
    notes: "",
  };
  
  // Scan all cells for known labels
  for (let r = 0; r < sheet.length; r++) {
    const row = sheet[r];
    for (let c = 0; c < row.length; c++) {
      const cellValue = normalizeValue(row[c]);
      
      // Client name
      if (matchesLabel(cellValue, LABEL_PATTERNS.clientName)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.client!.name = value;
      }
      
      // Building name
      if (matchesLabel(cellValue, LABEL_PATTERNS.buildingName)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.building!.name = value;
      }
      
      // Site address
      if (matchesLabel(cellValue, LABEL_PATTERNS.siteAddress)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.address!.street = value;
      }
      
      // Billing address
      if (matchesLabel(cellValue, LABEL_PATTERNS.billingAddress)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.billing!.address = value;
      }
      
      // Monitoring company
      if (matchesLabel(cellValue, LABEL_PATTERNS.monitoringCompany)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.monitoring!.company = value;
      }
      
      // Monitoring account
      if (matchesLabel(cellValue, LABEL_PATTERNS.monitoringAccount)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.monitoring!.accountNumber = value;
      }
      
      // Monitoring phone
      if (matchesLabel(cellValue, LABEL_PATTERNS.monitoringPhone)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.monitoring!.phone = value;
      }
      
      // Monitoring password
      if (matchesLabel(cellValue, LABEL_PATTERNS.monitoringPassword)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.monitoring!.password = value;
      }
      
      // Building year
      if (matchesLabel(cellValue, LABEL_PATTERNS.buildingYear)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.building!.year = value;
      }
      
      // Building class
      if (matchesLabel(cellValue, LABEL_PATTERNS.buildingClass)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.building!.class = value;
      }
      
      // Building stories
      if (matchesLabel(cellValue, LABEL_PATTERNS.buildingStories)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.building!.stories = value;
      }
      
      // Servicing hours
      if (matchesLabel(cellValue, LABEL_PATTERNS.servicingHours)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.estimates!.servicingHours = value;
      }
      
      // Repair budget
      if (matchesLabel(cellValue, LABEL_PATTERNS.repairBudget)) {
        const value = extractAdjacentValue(sheet, r, c);
        if (value) summary.estimates!.repairBudget = value;
      }
    }
  }
  
  // Parse contacts
  summary.contacts = parseContacts(sheet);
  
  return summary;
}
