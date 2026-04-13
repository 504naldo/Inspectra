/**
 * Canonical Workbook Import Pipeline
 *
 * Single source of truth for all workbook-level imports. Both the job-based
 * (importAssetsFromExcel) and direct-upload (importAllFromFile) paths delegate
 * here, so parsing logic is never duplicated.
 *
 * Domain rules encoded here:
 *  - Sprinkler sheets  → FIRE_ALARM_DEVICE  (no separate sprinkler bucket)
 *  - Backflow sheets   → BACKFLOW
 *  - All other sheets  → their respective categories
 *
 * Sheet classification:
 *  Uses claimed-sheet tracking so each sheet matches exactly one import type.
 *  Detection order is most-specific → least-specific to prevent keyword collisions.
 *
 * Duplicate identity:
 *  Stable externalRef key prevents duplicate inserts across re-imports:
 *    serial or barcode → CATEGORY:siteId:sn/bc:<value>
 *    smoke alarms      → SMOKE_ALARM:siteId:suite:<suite>[:<location>]
 *    fallback          → CATEGORY:siteId:<location>:<deviceType>:<model>
 */

import * as XLSX from 'xlsx';
import { getDb } from '../db';
import { devices, sites } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { safeToLower, safeTrim } from '../safeStringHelpers';
import { detectHeaderRow } from '../headerDetection';
import { autoMapColumns } from '../autoMapper';
import { getImportSchema, shouldSkipRow } from '../importSchemas';
import { normalizePowerType, extractDeviceCode } from '../powerTypeNormalization';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Import types supported by the workbook pipeline.
 * 'sprinklerDevices' is NOT a separate workbook type — sprinkler sheets are
 * classified and imported as 'fireAlarmDevices'.
 */
export type WorkbookImportType =
  | 'site'
  | 'fireAlarmDevices'
  | 'fireExtinguishers'
  | 'emergencyLights'
  | 'smokeAlarms'
  | 'backflows';

type DeviceCategory = 'FIRE_ALARM_DEVICE' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHT' | 'SMOKE_ALARM' | 'BACKFLOW';

const TYPE_TO_CATEGORY: Record<Exclude<WorkbookImportType, 'site'>, DeviceCategory> = {
  fireAlarmDevices: 'FIRE_ALARM_DEVICE',
  fireExtinguishers: 'FIRE_EXTINGUISHER',
  emergencyLights: 'EMERGENCY_LIGHT',
  smokeAlarms: 'SMOKE_ALARM',
  backflows: 'BACKFLOW',
};

/** Fallback deviceType labels for types that rarely have an explicit Type column. */
const DEFAULT_DEVICE_TYPE: Partial<Record<WorkbookImportType, string>> = {
  emergencyLights: 'Emergency Light',
  fireExtinguishers: 'Fire Extinguisher',
  smokeAlarms: 'Smoke Alarm',
  backflows: 'Backflow Preventer',
};

// ─── Sheet classification ─────────────────────────────────────────────────────

/**
 * Detection rules in priority order (most specific first).
 * Sprinkler keywords are listed under fireAlarmDevices so sprinkler sheets
 * are claimed before the generic alarm catch-all, and stored as FIRE_ALARM_DEVICE.
 */
const SHEET_DETECTION: Array<{ importType: WorkbookImportType; keywords: string[] }> = [
  { importType: 'fireExtinguishers', keywords: ['extinguisher', 'exting', 'fire ext'] },
  { importType: 'smokeAlarms',       keywords: ['smoke alarm', 'smoke alarms', 'smoke detector', 'smoke detectors'] },
  { importType: 'emergencyLights',   keywords: ['emergency light', 'emergency lighting', 'emerg light', 'exit light', 'exit sign'] },
  { importType: 'backflows',         keywords: ['backflow', 'backflows', 'backflow preventer', 'preventer'] },
  {
    importType: 'fireAlarmDevices',
    keywords: [
      // Sprinkler sheets fold into fire alarm devices per domain rule
      'sprinkler device', 'sprinkler head', 'sprinkler system', 'sprinkler',
      // Fire alarm sheets
      'fire alarm device', 'alarm device', 'fa device', 'fire alarm', 'alarm',
    ],
  },
  {
    importType: 'site',
    keywords: [
      'site info', 'building info', 'property info', 'summary sheet', 'work site info',
      'summary', 'site', 'building', 'property', 'info',
    ],
  },
];

export interface ClassifiedSheet {
  sheetName: string;
  importType: WorkbookImportType;
}

/**
 * Classify workbook sheets into import types.
 * Each sheet is claimed by at most one type (most-specific detection rule wins).
 */
export function classifyWorkbookSheets(sheetNames: string[]): ClassifiedSheet[] {
  const claimed = new Set<string>();
  const results: ClassifiedSheet[] = [];

  for (const { importType, keywords } of SHEET_DETECTION) {
    for (const name of sheetNames) {
      if (claimed.has(name)) continue;
      const lower = (safeToLower(name) ?? '').trim();
      if (!lower) continue;
      if (keywords.some((kw) => lower.includes(kw))) {
        claimed.add(name);
        results.push({ sheetName: name, importType });
        break; // One sheet per detection rule; re-enter outer loop for next type
      }
    }
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ImportWorkbookOptions {
  fileBuffer: Buffer;
  fileName: string;
  siteId: number;
  companyId: number;
  userId: number;
}

export interface WorkbookImportSummary {
  siteFieldsUpdated: number;
  counts: {
    fireAlarm: number;
    extinguishers: number;
    emergencyLights: number;
    smokeAlarms: number;
    backflows: number;
    total: number;
  };
  excludedRowsCount: number;
  classifiedSheets: ClassifiedSheet[];
  message: string;
}

/**
 * Parse and import a full workbook for a site.
 * Classifies all sheets, then runs the canonical parse → validate → upsert
 * pipeline for each category using autoMapper, importSchemas, and headerDetection.
 */
export async function importWorkbookForSite(options: ImportWorkbookOptions): Promise<WorkbookImportSummary> {
  const { fileBuffer, siteId, companyId } = options;

  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: false,
    cellStyles: false,
  });

  const classified = classifyWorkbookSheets(workbook.SheetNames);

  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let siteFieldsUpdated = 0;
  const counts = { fireAlarm: 0, extinguishers: 0, emergencyLights: 0, smokeAlarms: 0, backflows: 0 };
  let excludedRowsCount = 0;

  for (const { sheetName, importType } of classified) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    if (importType === 'site') {
      siteFieldsUpdated += await parseSiteSheet(sheet, siteId, db);
      continue;
    }

    const result = await parseDeviceSheet(sheet, importType, siteId, companyId, db);
    excludedRowsCount += result.excluded;

    switch (importType) {
      case 'fireAlarmDevices': counts.fireAlarm      += result.count; break;
      case 'fireExtinguishers': counts.extinguishers += result.count; break;
      case 'emergencyLights':  counts.emergencyLights += result.count; break;
      case 'smokeAlarms':      counts.smokeAlarms    += result.count; break;
      case 'backflows':        counts.backflows       += result.count; break;
    }
  }

  const total = counts.fireAlarm + counts.extinguishers + counts.emergencyLights + counts.smokeAlarms + counts.backflows;
  const catCount = Object.values(counts).filter((c) => c > 0).length;

  return {
    siteFieldsUpdated,
    counts: { ...counts, total },
    excludedRowsCount,
    classifiedSheets: classified,
    message: [
      `Imported ${total} devices across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}.`,
      siteFieldsUpdated > 0 ? ` Updated ${siteFieldsUpdated} site fields.` : '',
      excludedRowsCount > 0 ? ` Skipped ${excludedRowsCount} rows.` : '',
    ].join('').trim(),
  };
}

// ─── Site sheet parser ────────────────────────────────────────────────────────

/** Well-known field names for the site info sheet. */
const SITE_FIELDS: Record<string, string[]> = {
  name:         ['site name', 'building name', 'property name', 'name'],
  address:      ['address', 'street', 'location'],
  city:         ['city', 'municipality'],
  state:        ['state', 'province', 'region'],
  postalCode:   ['postal', 'zip', 'postal code', 'zip code'],
  contactName:  ['contact name', 'contact', 'site contact'],
  contactPhone: ['contact phone', 'phone', 'telephone'],
  notes:        ['notes', 'comments', 'remarks'],
  buildingId:   [
    'file #', 'file#', 'file number', 'fileno', 'file no',
    'account no', 'account number', 'acct', 'acct#',
    'building id', 'buildingid',
  ],
};

async function parseSiteSheet(sheet: XLSX.WorkSheet, siteId: number, db: any): Promise<number> {
  // Site info sheets are typically label-value pairs; read as objects
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
  if (rows.length === 0) return 0;

  const firstRow = rows[0];
  const updateData: Record<string, any> = {};
  let updated = 0;

  for (const [col, keys] of Object.entries(SITE_FIELDS)) {
    const val = extractFieldFromObject(firstRow, keys);
    if (val) {
      updateData[col] = val;
      updated++;
    }
  }

  if (updated > 0) {
    updateData.updatedAt = new Date();
    await db.update(sites).set(updateData).where(eq(sites.id, siteId));
  }

  return updated;
}

// ─── Device sheet parser ──────────────────────────────────────────────────────

async function parseDeviceSheet(
  sheet: XLSX.WorkSheet,
  importType: Exclude<WorkbookImportType, 'site'>,
  siteId: number,
  companyId: number,
  db: any,
): Promise<{ count: number; excluded: number }> {
  // Read as array-of-arrays so autoMapper + headerDetection can work properly
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  if (rawRows.length === 0) return { count: 0, excluded: 0 };

  const headerInfo = detectHeaderRow(rawRows, importType, 30);
  const headers = headerInfo.headers.map((h) => (h == null ? '' : String(h)));
  const dataRows = rawRows.slice(headerInfo.dataStartIndex);

  const columnMapping = autoMapColumns(headers, importType);
  const schema = getImportSchema(importType);
  const category = TYPE_TO_CATEGORY[importType];

  let count = 0;
  let excluded = 0;

  for (const rawRow of dataRows) {
    // Skip header-like and pricing rows
    if (shouldSkipRow(rawRow, headers)) continue;

    // Map columns → named fields
    const rowData: Record<string, any> = {};
    for (const [field, col] of Object.entries(columnMapping)) {
      const idx = headers.indexOf(col);
      if (idx >= 0 && rawRow[idx] != null && rawRow[idx] !== '') {
        rowData[field] = rawRow[idx];
      }
    }

    // Skip rows with no mapped data at all
    if (Object.keys(rowData).length === 0) continue;

    // Type-specific normalisation (smoke alarms, etc.)
    normalizeRow(importType, rowData);

    // Validate — schema mutations may further normalise rowData in-place
    const { errors } = schema.validateRow(rowData);

    // For one-click import we use best-effort: only skip rows that are
    // completely missing meaningful identity data
    const hasIdentity = !!(
      rowData.location || rowData.serialNumber || rowData.barcode || rowData.suiteNumber
    );
    if (!hasIdentity && errors.length > 0) {
      excluded++;
      continue;
    }

    const deviceData = buildDeviceData(importType, rowData, siteId, companyId, category);
    try {
      await upsertDeviceByRef(deviceData, db);
      count++;
    } catch (err: any) {
      // Row-level errors (e.g. enum value not yet in DB schema) are counted as
      // excluded rather than crashing the entire import.
      console.error(`[workbookImport] Row upsert failed (${importType}):`, err?.message ?? err);
      excluded++;
    }
  }

  return { count, excluded };
}

// ─── Row normalisation ────────────────────────────────────────────────────────

function normalizeRow(importType: WorkbookImportType, rowData: Record<string, any>): void {
  if (importType === 'smokeAlarms') {
    // Strip leading # from suite numbers (e.g. #0816 → 0816)
    if (rowData.suiteNumber) {
      const s = String(rowData.suiteNumber).trim();
      rowData.suiteNumber = s.startsWith('#') ? s.slice(1) : s;
    }
    // If powerType field contains a device code (e.g. SA/CO-1), move it to model
    const deviceCode = extractDeviceCode(rowData.powerType);
    if (deviceCode && !rowData.model) {
      rowData.model = deviceCode;
    }
    if (rowData.powerType) {
      rowData.powerType = normalizePowerType(rowData.powerType);
    }
  }
}

// ─── Device data builder ──────────────────────────────────────────────────────

function buildDeviceData(
  importType: WorkbookImportType,
  rowData: Record<string, any>,
  siteId: number,
  companyId: number,
  category: DeviceCategory,
): Record<string, any> {
  const rawLocation = rowData.location || rowData.suiteNumber || 'Unknown';
  const location = rowData.floor
    ? `${String(rowData.floor).trim()} - ${String(rawLocation).trim()}`
    : String(rawLocation).trim();

  const deviceType =
    (rowData.deviceType ? String(rowData.deviceType).trim() : '') ||
    DEFAULT_DEVICE_TYPE[importType] ||
    'Unknown';

  const externalRef = buildExternalRef(importType, rowData, siteId, category);

  const base: Record<string, any> = {
    companyId,
    siteId,
    category,
    deviceType,
    manufacturer: rowData.manufacturer || null,
    model: rowData.model || null,
    serialNumber: rowData.serialNumber || null,
    location,
    barcode: rowData.barcode || null,
    notes: rowData.notes || null,
    externalRef,
  };

  if (importType === 'smokeAlarms') {
    base.suiteNumber  = rowData.suiteNumber || null;
    base.powerType    = rowData.powerType || 'unknown';
    base.installDate  = rowData.installDate ? new Date(rowData.installDate) : null;
  }

  if (importType === 'emergencyLights') {
    base.ladderHeight  = rowData.ladderHeight  || null;
    base.supplyVoltage = rowData.supplyVoltage || null;
    base.modelWattage  = rowData.modelWattage  || null;
    base.batteryYear   = rowData.batteryYear   || null;
    base.batterySize   = rowData.batterySize   || null;
    base.batteryCount  = rowData.batteryCount  ? Number(rowData.batteryCount) || null : null;
    base.lampCount     = rowData.lampCount     ? Number(rowData.lampCount)    || null : null;
  }

  if (importType === 'fireExtinguishers') {
    base.mfgDate = rowData.mfgDate || null;
    base.lastHST = rowData.lastHST || null;
    base.last6yr  = rowData.last6yr  || null;
  }

  return base;
}

// ─── Stable identity (externalRef) ───────────────────────────────────────────

function buildExternalRef(
  importType: WorkbookImportType,
  rowData: Record<string, any>,
  siteId: number,
  category: DeviceCategory,
): string {
  const slug = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, '-');

  // Prefer explicit stable keys in priority order
  if (rowData.serialNumber) {
    return `${category}:${siteId}:sn:${slug(rowData.serialNumber)}`;
  }
  if (rowData.barcode) {
    return `${category}:${siteId}:bc:${slug(rowData.barcode)}`;
  }
  if (importType === 'smokeAlarms' && rowData.suiteNumber) {
    const locPart = rowData.location ? `:${slug(rowData.location)}` : '';
    return `${category}:${siteId}:suite:${slug(rowData.suiteNumber)}${locPart}`;
  }

  // Deterministic composite fallback
  return [category, siteId, slug(rowData.location), slug(rowData.deviceType), slug(rowData.model)]
    .filter(Boolean)
    .join(':');
}

// ─── Upsert by externalRef ────────────────────────────────────────────────────

async function upsertDeviceByRef(deviceData: Record<string, any>, db: any): Promise<void> {
  const { companyId, siteId, externalRef } = deviceData;

  const [existing] = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.companyId, companyId),
        eq(devices.siteId, siteId),
        eq(devices.externalRef, externalRef),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(devices)
      .set({ ...deviceData, updatedAt: new Date() })
      .where(eq(devices.id, existing.id));
  } else {
    await db.insert(devices).values(deviceData);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a field value from a key-value object row using flexible key matching.
 * Used for site info sheets (parsed with sheet_to_json default object mode).
 */
function extractFieldFromObject(row: Record<string, any>, keys: string[]): string {
  for (const header of Object.keys(row)) {
    const normalised = safeTrim(safeToLower(header)) ?? '';
    if (keys.some((k) => normalised.includes(k))) {
      const val = row[header];
      return typeof val === 'string' ? val.trim() : String(val || '').trim();
    }
  }
  return '';
}
