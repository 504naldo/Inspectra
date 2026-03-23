import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { safeToLower, safeIncludes, safeTrim } from "../safeStringHelpers";

// Import router for CSV/XLSX imports
const importRouter = router({
  // Get import history
  list: officeProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    return db.getImportLogsByCompany(input.companyId);
  }),
  
  listBySite: officeProcedure.input(z.object({ siteId: z.number() })).query(async ({ input }) => {
    return db.getImportLogsBySite(input.siteId);
  }),
  
  get: officeProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    return db.getImportLogById(input.id);
  }),
  
  getResults: officeProcedure.input(z.object({ importLogId: z.number() })).query(async ({ input }) => {
    return db.getImportRowResultsByLog(input.importLogId);
  }),
  
  getErrors: officeProcedure.input(z.object({ importLogId: z.number() })).query(async ({ input }) => {
    return db.getImportErrorsByLog(input.importLogId);
  }),
  
  // Parse uploaded file and return preview data
  parseFile: officeProcedure.input(z.object({
    fileName: z.string(),
    fileData: z.string(), // Base64 encoded
    importType: z.enum(['site', 'fireAlarmDevices', 'fireExtinguishers', 'emergencyLights', 'sprinklerDevices', 'smokeAlarms']),
    sheetName: z.string().optional(), // Optional: if not provided, use smart suggestion
  })).mutation(async ({ input }) => {
    try {
      // Decode base64 to buffer
      const buffer = Buffer.from(input.fileData, 'base64');
      const byteSize = buffer.length;
      
      // Get first 16 bytes as hex for diagnostics (ZIP header should start with 50 4B 03 04)
      const first16Bytes = buffer.slice(0, 16).toString('hex').toUpperCase();
      const first4Bytes = first16Bytes.slice(0, 8); // First 4 bytes
      
      // Log diagnostics
      console.log('[parseFile] Diagnostics:', {
        fileName: input.fileName,
        byteSize,
        first16BytesHex: first16Bytes,
        isZipHeader: first4Bytes === '504B0304', // PK.. ZIP header
        importType: input.importType
      });
      
      // Size guardrails
      if (byteSize < 1024) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'PARSE_FAILED: File is too small (< 1KB). The upload may be empty or corrupted.',
          cause: { code: 'PARSE_FAILED', details: { byteSize, first16Bytes } }
        });
      }
      
      // Check for ZIP header (Excel files are ZIP archives)
      if (first4Bytes !== '504B0304') {
        console.warn('[parseFile] Invalid ZIP header:', {
          expected: '504B0304',
          actual: first4Bytes,
          fileName: input.fileName
        });
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'PARSE_FAILED: File does not appear to be a valid Excel file. Expected ZIP header not found.',
          cause: { code: 'PARSE_FAILED', details: { first16Bytes, byteSize } }
        });
      }
      
      // Convert buffer to Uint8Array for SheetJS
      const XLSX = await import('xlsx');
      const uint8Data = new Uint8Array(buffer);
      
      // Use correct SheetJS configuration for XLSM
      const workbook = XLSX.read(uint8Data, { 
        type: 'array', 
        cellDates: true,
        cellFormula: false,
        cellStyles: false
      });
      
      // Use smart sheet suggestion based on import type
      const { suggestSheet } = await import('../sheetSuggestion');
      const suggestedSheetName = suggestSheet(workbook, input.importType, XLSX);
      
      console.log('[parseFile] Workbook loaded:', {
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        importType: input.importType,
        suggestedSheetName,
        requestedSheet: input.sheetName
      });
    
    const sheetName = input.sheetName || suggestedSheetName || workbook.SheetNames[0];
    
    // Validate sheet exists
    if (!workbook.Sheets[sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${sheetName}" not found in workbook` 
      });
    }
    
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sheet is empty' });
    }
    
    // Use smart header detection to find the actual header row
    const { detectHeaderRow } = await import('../headerDetection');
    const headerDetection = detectHeaderRow(data, input.importType, 30);
    
    console.log('[parseFile] Header detection:', {
      sheetName,
      headerRowIndex: headerDetection.headerRowIndex,
      dataStartIndex: headerDetection.dataStartIndex,
      detectedHeaders: headerDetection.headers.slice(0, 10) // First 10 headers
    });
    
    // Convert headers to strings (handle numbers, dates, etc.)
    const headers = headerDetection.headers;
    const dataRows = data.slice(headerDetection.dataStartIndex);
    const rows = dataRows.slice(0, 10); // Preview first 10 data rows
    const totalRows = dataRows.length;
    
    // Auto-map columns based on import type
    const { autoMapColumns, getMappingStats } = await import('../autoMapper');
    const autoMapping = autoMapColumns(headers, input.importType);
    const mappingStats = getMappingStats(autoMapping, input.importType);
    
    // For smoke alarms, extract first 3 suite numbers for verification
    let sampleSuiteNumbers: any[] = [];
    if (input.importType === 'smokeAlarms' && autoMapping.suiteNumber) {
      const suiteColIndex = headers.indexOf(autoMapping.suiteNumber);
      if (suiteColIndex >= 0) {
        sampleSuiteNumbers = dataRows.slice(0, 3).map(row => row[suiteColIndex]);
      }
    }
    
      console.log('[parseFile] Parse successful:', {
        sheetName,
        headerCount: headers.length,
        totalRows,
        mappingStats,
        headerRowIndex: headerDetection.headerRowIndex,
        sampleSuiteNumbers: input.importType === 'smokeAlarms' ? sampleSuiteNumbers : undefined
      });
      
      return {
        headers,
        previewRows: rows,
        totalRows,
        sheetName,
        sheetNames: workbook.SheetNames,
        suggestedSheetName,
        autoMapping,
        mappingStats,
      };
    } catch (error: any) {
      // If it's already a TRPCError, rethrow it
      if (error.code) {
        throw error;
      }
      
      // Log full error details server-side
      console.error('[parseFile] Parse failed:', {
        fileName: input.fileName,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
      
      // Return structured error with safe details
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `PARSE_FAILED: Failed to parse Excel workbook. ${error.message || 'Unknown error'}`,
        cause: { 
          code: 'PARSE_FAILED', 
          details: {
            fileName: input.fileName,
            errorType: error.name,
            errorMessage: error.message
          }
        }
      });
    }
  }),
  
  // Validate import with column mapping
  validate: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    importType: z.enum(['site', 'fireAlarmDevices', 'fireExtinguishers', 'emergencyLights', 'sprinklerDevices', 'smokeAlarms']),
    fileName: z.string(),
    fileData: z.string(),
    sheetName: z.string(), // Required: which sheet to validate
    columnMapping: z.record(z.string(), z.string()), // targetField -> sourceColumn
    duplicateHandling: z.enum(['skip', 'update', 'create_new']).optional(),
  })).mutation(async ({ input }) => {
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(input.fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Validate sheet exists
    if (!workbook.Sheets[input.sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${input.sheetName}" not found` 
      });
    }
    
    const sheet = workbook.Sheets[input.sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Use smart header detection
    const { detectHeaderRow } = await import('../headerDetection');
    const headerDetection = detectHeaderRow(data, input.importType, 30);
    const headers = headerDetection.headers;
    const rows = data.slice(headerDetection.dataStartIndex);
    
    // Get schema for import type
    const { getImportSchema, shouldSkipRow } = await import('../importSchemas');
    const schema = getImportSchema(input.importType);
    
    const validationResults: Array<{
      rowNumber: number;
      status: 'valid' | 'error' | 'duplicate' | 'skipped';
      errors: string[];
      warnings: string[];
      data: Record<string, any>;
    }> = [];
    
    let skippedCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip heading/note rows and pricing tables
      if (shouldSkipRow(row, headers)) {
        skippedCount++;
        continue;
      }
      
      const rowData: Record<string, any> = {};
      const warnings: string[] = [];
      
      // Map columns to fields
      for (const [targetField, sourceColumn] of Object.entries(input.columnMapping)) {
        const colIndex = headers.indexOf(sourceColumn);
        if (colIndex !== -1) {
          rowData[targetField] = row[colIndex];
        }
      }
      
      // Validate using schema
      const validation = schema.validateRow(rowData);
      const errors = validation.errors;
      
      // Warn if location is missing (but don't block)
      if (!rowData.location || String(rowData.location).trim() === '') {
        warnings.push('Location is blank');
      }
      
      // Check for duplicates (for device imports)
      let isDuplicate = false;
      if (input.importType !== 'site' && (rowData.serialNumber || rowData.barcode)) {
        const existing = await db.findDuplicateDevice(
          input.siteId,
          rowData.serialNumber || null,
          rowData.barcode || null
        );
        if (existing) {
          isDuplicate = true;
        }
      }
      
      validationResults.push({
        rowNumber: i + 2, // 1-indexed, accounting for header
        status: errors.length > 0 ? 'error' : isDuplicate ? 'duplicate' : 'valid',
        errors,
        warnings,
        data: rowData,
      });
    }
    
    const validCount = validationResults.filter(r => r.status === 'valid').length;
    const errorCount = validationResults.filter(r => r.status === 'error').length;
    const duplicateCount = validationResults.filter(r => r.status === 'duplicate').length;
    
    return {
      totalRows: rows.length,
      validCount,
      errorCount,
      duplicateCount,
      skippedCount,
      results: validationResults,
    };
  }),
  
  // Execute import
  execute: officeProcedure.input(z.object({
    companyId: z.number(),
    siteId: z.number(),
    importType: z.enum(['site', 'fireAlarmDevices', 'fireExtinguishers', 'emergencyLights', 'sprinklerDevices', 'smokeAlarms']),
    fileName: z.string(),
    fileData: z.string(),
    sheetName: z.string(), // Required: which sheet to import
    columnMapping: z.record(z.string(), z.string()),
    duplicateHandling: z.enum(['skip', 'update', 'create_new']),
  })).mutation(async ({ input, ctx }) => {
    const XLSX = await import('xlsx');
    const buffer = Buffer.from(input.fileData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Validate sheet exists
    if (!workbook.Sheets[input.sheetName]) {
      throw new TRPCError({ 
        code: 'BAD_REQUEST', 
        message: `Sheet "${input.sheetName}" not found` 
      });
    }
    
    const sheet = workbook.Sheets[input.sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Use smart header detection
    const { detectHeaderRow } = await import('../headerDetection');
    const headerDetection = detectHeaderRow(data, input.importType, 30);
    const headers = headerDetection.headers;
    const rows = data.slice(headerDetection.dataStartIndex);
    
    // Get schema for import type
    const { getImportSchema, shouldSkipRow } = await import('../importSchemas');
    const schema = getImportSchema(input.importType);
    
    // Map new import types to legacy DB enum
    const legacyImportType = input.importType === 'site' ? 'sites' : 'devices';
    
    // Create import log
    const importLog = await db.createImportLog({
      companyId: input.companyId,
      siteId: input.siteId,
      importedById: ctx.user.id,
      importType: legacyImportType,
      fileName: input.fileName,
      columnMapping: input.columnMapping as any,
      duplicateHandling: input.duplicateHandling,
      totalRows: rows.length,
      status: 'importing',
      startedAt: new Date(),
    });
    
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    const rowResults: Array<{
      importLogId: number;
      rowNumber: number;
      status: 'success' | 'error' | 'duplicate' | 'skipped';
      entityId?: number;
      originalData: any;
      errorMessage?: string;
    }> = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip heading/note rows and pricing tables
      if (shouldSkipRow(row, headers)) {
        skippedCount++;
        continue;
      }
      
      const rowData: Record<string, any> = {};
      
      // Map columns to fields
      for (const [targetField, sourceColumn] of Object.entries(input.columnMapping)) {
        const colIndex = headers.indexOf(sourceColumn);
        if (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== '') {
          rowData[targetField] = row[colIndex];
        }
      }
      
      try {
        if (input.importType === 'site') {
          // Update site information
          if (rowData.siteName) {
            await db.updateSite(input.siteId, {
              name: rowData.siteName,
              address: rowData.address,
              city: rowData.city,
              notes: rowData.notes,
            });
            successCount++;
            rowResults.push({
              importLogId: importLog.id,
              rowNumber: i + 2,
              status: 'success',
              entityId: input.siteId,
              originalData: rowData,
            });
          }
        } else {
          // Check for duplicate
          const existing = await db.findDuplicateDevice(
            input.siteId,
            rowData.serialNumber || null,
            rowData.barcode || null
          );
          
          if (existing) {
            if (input.duplicateHandling === 'skip') {
              skippedCount++;
              rowResults.push({
                importLogId: importLog.id,
                rowNumber: i + 2,
                status: 'skipped',
                originalData: rowData,
                errorMessage: 'Duplicate - skipped',
              });
              continue;
            } else if (input.duplicateHandling === 'update') {
              await db.updateDevice(existing.id, {
                ...rowData,
                siteId: input.siteId,
              });
              duplicateCount++;
              rowResults.push({
                importLogId: importLog.id,
                rowNumber: i + 2,
                status: 'duplicate',
                entityId: existing.id,
                originalData: rowData,
              });
              continue;
            }
            // create_new falls through to create
          }
          
          // Create new device with category
          const deviceData: any = {
            companyId: ctx.user.companyId!,
            siteId: input.siteId,
            category: schema.category || 'FIRE_ALARM_DEVICE',
            deviceType: rowData.deviceType || 'Unknown',
            manufacturer: rowData.manufacturer,
            model: rowData.model,
            serialNumber: rowData.serialNumber,
            location: rowData.location ? `${rowData.floor ? rowData.floor + ' - ' : ''}${rowData.location}` : undefined,
            barcode: rowData.barcode,
            notes: rowData.notes,
          };
          
          // Add smoke alarm specific fields
          if (input.importType === 'smokeAlarms') {
            const { normalizePowerType } = await import('../powerTypeNormalization');
            deviceData.suiteNumber = rowData.suiteNumber;
            // Normalize power type (already normalized in validation, but ensure it's correct)
            deviceData.powerType = rowData.powerType ? normalizePowerType(rowData.powerType) : 'unknown';
            deviceData.installDate = rowData.installDate ? new Date(rowData.installDate) : null;
            deviceData.deviceType = 'Smoke Alarm';
          }
          
          const device = await db.createDevice(deviceData);
          
          successCount++;
          rowResults.push({
            importLogId: importLog.id,
            rowNumber: i + 2,
            status: 'success',
            entityId: device.id,
            originalData: rowData,
          });
        }
      } catch (error: any) {
        errorCount++;
        rowResults.push({
          importLogId: importLog.id,
          rowNumber: i + 2,
          status: 'error',
          originalData: rowData,
          errorMessage: error.message || 'Unknown error',
        });
      }
    }
    
    // Save row results
    await db.createBulkImportRowResults(rowResults);
    
    // Parse Summary Sheet if it exists and update site summary
    try {
      const summarySheetNames = ['Summary', 'summary', 'SUMMARY', 'Summary Sheet', 'SUMMARY SHEET'];
      const summarySheetName = workbook.SheetNames.find(name => 
        summarySheetNames.some(s => name.toLowerCase().includes(s.toLowerCase()))
      );
      
      if (summarySheetName && workbook.Sheets[summarySheetName]) {
        const { parseSummarySheet } = await import('../summarySheetParser');
        const summarySheet = workbook.Sheets[summarySheetName];
        const summaryData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 }) as any[][];
        const parsedSummary = parseSummarySheet(summaryData);
        
        // Calculate device totals from imported devices
        const siteDevices = await db.getDevicesBySite(input.siteId);
        const totals = {
          fireAlarmDevicesCount: siteDevices.filter(d => d.category === 'FIRE_ALARM_DEVICE').length,
          smokeAlarmsCount: siteDevices.filter(d => d.category === 'SMOKE_ALARM').length,
          emergencyLightsCount: siteDevices.filter(d => d.category === 'EMERGENCY_LIGHT').length,
          fireExtinguishersCount: siteDevices.filter(d => d.category === 'FIRE_EXTINGUISHER').length,
          sprinklerDevicesCount: siteDevices.filter(d => d.category === 'SPRINKLER').length,
        };
        
        // Merge totals into parsed summary
        parsedSummary.totals = totals;
        
        // Update site with summary data and sync flat columns
        const updateData: any = {
          summary: parsedSummary as any,
        };
        
        // Sync key flat columns from summary for search/indexing
        if (parsedSummary.building?.name) {
          updateData.name = parsedSummary.building.name;
        }
        if (parsedSummary.address) {
          if (parsedSummary.address.street) updateData.address = parsedSummary.address.street;
          if (parsedSummary.address.city) updateData.city = parsedSummary.address.city;
          if (parsedSummary.address.state) updateData.state = parsedSummary.address.state;
          if (parsedSummary.address.postalCode) updateData.postalCode = parsedSummary.address.postalCode;
        }
        if (parsedSummary.contacts?.[0]) {
          if (parsedSummary.contacts[0].name) updateData.contactName = parsedSummary.contacts[0].name;
          if (parsedSummary.contacts[0].phone) updateData.contactPhone = parsedSummary.contacts[0].phone;
        }
        if (parsedSummary.notes) {
          updateData.notes = parsedSummary.notes;
        }
        
        await db.updateSite(input.siteId, updateData);
        
        console.log('[execute] Summary Sheet parsed and saved:', {
          siteId: input.siteId,
          summarySheetName,
          totals,
        });
      }
    } catch (summaryError: any) {
      console.error('[execute] Failed to parse Summary Sheet:', summaryError);
      // Don't fail the entire import if summary parsing fails
    }
    
    // Update import log
    await db.updateImportLog(importLog.id, {
      status: errorCount > 0 ? 'partial' : 'completed',
      successCount,
      errorCount,
      duplicateCount,
      skippedCount,
      completedAt: new Date(),
    });
    
    return {
      importLogId: importLog.id,
      totalRows: rows.length,
      successCount,
      errorCount,
      duplicateCount,
      skippedCount,
    };
  }),
});

export { importRouter };
