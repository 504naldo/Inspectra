/**
 * Shared file type validation utilities
 * Single source of truth for spreadsheet and file type detection
 */

// Supported spreadsheet extensions
export const SPREADSHEET_EXTS = ["csv", "xls", "xlsx", "xlsm"] as const;

// Supported spreadsheet MIME types
// Note: Chrome mobile/desktop often returns "" or "application/octet-stream" for .xlsm
export const SPREADSHEET_MIMES = [
  "text/csv",
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
  "application/octet-stream", // Generic fallback (Chrome often uses this)
  "", // Empty MIME type (Chrome mobile sometimes returns this)
] as const;

/**
 * Check if a file is a spreadsheet based on extension and MIME type
 * Extension check takes priority for reliability (Chrome MIME issues)
 * 
 * @param file - File object to validate
 * @returns true if file is a spreadsheet, false otherwise
 */
export function isSpreadsheetFile(file: File): boolean {
  // Extract extension (case-insensitive)
  const ext = file.name.toLowerCase().split(".").pop();
  
  // Check extension first (most reliable)
  if (ext && SPREADSHEET_EXTS.includes(ext as any)) {
    return true;
  }
  
  // Fallback to MIME type check (less reliable on Chrome)
  if (file.type && SPREADSHEET_MIMES.includes(file.type as any)) {
    return true;
  }
  
  return false;
}

/**
 * Get user-friendly error message for invalid spreadsheet files
 */
export function getSpreadsheetErrorMessage(): string {
  return "Please select a CSV or Excel file (.csv, .xls, .xlsx, .xlsm)";
}

/**
 * Get accept attribute value for spreadsheet file inputs
 */
export function getSpreadsheetAcceptAttribute(): string {
  return ".csv,.xls,.xlsx,.xlsm";
}
