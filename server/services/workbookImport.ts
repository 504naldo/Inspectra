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
 *    fallback          → CATEGORY:siteId:<floor>:<location>:<deviceType>:<model>
 */

import * as XLSX from 'xlsx';
import { safeXlsxRead } from '../_core/safeXlsxRead';
import { getDb } from '../db';
import { devices, sites } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { safeToLower, safeTrim } from '../safeStringHelpers';
import { detectHeaderRow } from '../headerDetection';
import { autoMapColumns } from '../autoMapper';
import { getImportSchema, shouldSkipRow } from '../importSchemas';
import { normalizePowerType, extractDeviceCode, } from '../powerTypeNormalization';
import { withLockedImportSite, isRecoverableImportRowError } from './importSiteTransaction';
import type { Db } from '../db/client';
import { findImportDeviceMatches, findImportSourceCollisions } from './importDeviceIdentity';

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

type DeviceCategory =
  | 'FIRE_ALARM_DEVICE' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHT' | 'SMOKE_ALARM' | 'BACKFLOW';

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
 *
 * FIRE ALARM SHEET NAMES IN THE WILD — all of these must be handled:
 *   "Individual Devices"          — most common customer template
 *   "Individual Device Record"    — alternate heading
 *   "Fire Alarm Devices"
 *   "FA Device List"
 *   "Alarm Devices"
 *   Any sheet containing "alarm", "sprinkler", etc.
 *
 * Sprinkler keywords are listed under fireAlarmDevices so sprinkler sheets
 * are claimed before the generic alarm catch-all, and stored as FIRE_ALARM_DEVICE.
 *
 * Extinguishers / smoke alarms / emergency lights / backflows are detected
 * first (more specific) so their sheets are not accidentally claimed by the
 * broader fire-alarm catch-all below.
 */
const SHEET_DETECTION: Array<{ importType: WorkbookImportType; keywords: string[]; }> = [
  { importType: 'fireExtinguishers', keywords: ['extinguisher', 'exting', 'fire ext'], },
  { importType: 'smokeAlarms',       keywords: ['smoke alarm', 'smoke alarms', 'smoke detector', 'smoke detectors',], },
  { importType: 'emergencyLights',   keywords: ['emergency light', 'emergency lighting', 'emerg light', 'exit light', 'exit sign',], },
  { importType: 'backflows',         keywords: ['backflow', 'backflows', 'backflow preventer', 'preventer'], },
  {
    importType: 'fireAlarmDevices',
    keywords: [
      // ── "Individual Device / Record" naming (most common in customer workbooks)
      'individual device record',
      'individual device',
      'individual devices',
      // ── Sprinkler sheets → fold into FIRE_ALARM_DEVICE per domain rule
      'sprinkler device', 'sprinkler head', 'sprinkler system', 'sprinkler',
      // ── Explicit fire alarm naming
      'fire alarm device', 'alarm device', 'fa device', 'fire alarm', 'alarm',
      // ── Generic device-list naming (safe here because specific categories claimed first)
      'device record', 'device list',
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
 * Logs which sheets were classified and which were unrecognised for diagnostics.
 */
export function classifyWorkbookSheets(sheetNames: string[]): ClassifiedSheet[] {
  const claimed = new Set<string>();
  const results: ClassifiedSheet[] = [];

  for (const { importType, keywords } of SHEET_DETECTION) {
    for (const name of sheetNames) {
      if (claimed.has(name)) continue;
      const lower = (safeToLower(name) ?? '').trim();
      if (!lower) continue;
      if (keywords.some(kw => lower.includes(kw))) {
        claimed.add(name);
        results.push({ sheetName: name, importType });
      }
    }
  }

  const unclassified = sheetNames.filter(n => !claimed.has(n));
  console.log('[workbookImport] Sheet classification:', {
    all: sheetNames,
    classified: results.map(r => `${r.sheetName} → ${r.importType}`),
    unclassified,
  });

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ImportWorkbookOptions {
  fileBuffer: Buffer;
  fileName: string;
  siteId: number;
  companyId: number;
  customerOrgId?: number;
  userId: number;
  selectedSheets?: string[];
  preserveSourceOrder?: boolean;
}

export interface WorkbookRowIssue {
  sheetName: string;
  rowNumber: number;
  externalRef?: string;
  reason: string;
}

export interface WorkbookDeviceCounts {
  fireAlarm: number;
  extinguishers: number;
  emergencyLights: number;
  smokeAlarms: number;
  backflows: number;
  total: number;
}

export interface WorkbookImportPreview {
  counts: WorkbookDeviceCounts;
  insertedCount: number;
  updatedCount: number;
  excludedRowsCount: number;
  excludedRows: WorkbookRowIssue[];
  classifiedSheets: ClassifiedSheet[];
}

export interface WorkbookImportSummary extends WorkbookImportPreview {
  siteFieldsUpdated: number;
  siteUpdatedFields: string[];
  insertedCounts: WorkbookDeviceCounts;
  updatedCounts: WorkbookDeviceCounts;
  message: string;
}

interface DeviceCandidate {
  source: { sheetName: string; rowNumber: number };
  importType: Exclude<WorkbookImportType, 'site'>;
  data: typeof devices.$inferInsert & { externalRef: string };
  existingId?: number;
}

const COUNT_KEY: Record<Exclude<WorkbookImportType, 'site'>, Exclude<keyof WorkbookDeviceCounts, 'total'>> = {
  fireAlarmDevices: 'fireAlarm',
  fireExtinguishers: 'extinguishers',
  emergencyLights: 'emergencyLights',
  smokeAlarms: 'smokeAlarms',
  backflows: 'backflows',
};

function emptyCounts(): WorkbookDeviceCounts {
  return { fireAlarm: 0, extinguishers: 0, emergencyLights: 0, smokeAlarms: 0, backflows: 0, total: 0 };
}

/** Parse and resolve every identity before any site/device writes take place. */
async function prepareWorkbookImport(options: ImportWorkbookOptions, database?: Db, lockIdentities = false) {
  const { fileBuffer, siteId, companyId } = options;
  const workbook = await safeXlsxRead(fileBuffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: false,
    cellStyles: false,
  });

  const classified = classifyWorkbookSheets(workbook.SheetNames).filter(sheet =>
    sheet.importType === 'site' || !options.selectedSheets?.length || options.selectedSheets.includes(sheet.sheetName));
  const classifiedNames = new Set(classified.map(c => c.sheetName));
  for (const sheetName of workbook.SheetNames) {
    if (classifiedNames.has(sheetName)) continue;
    if (options.selectedSheets?.length && !options.selectedSheets.includes(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    if (rawRows.length === 0) continue;
    const headerInfo = detectHeaderRow(rawRows, 'fireAlarmDevices', 30);
    const headers = headerInfo.headers.map(h => (h == null ? '' : String(h)));
    const mapping = autoMapColumns(headers, 'fireAlarmDevices');
    if (Object.keys(mapping).length >= 2) {
      classified.push({ sheetName, importType: 'fireAlarmDevices' });
      classifiedNames.add(sheetName);
    }
  }

  const db = database ?? await getDb();
  if (!db) throw new Error('Database not available');
  const candidates: DeviceCandidate[] = [];
  const excludedRows: WorkbookRowIssue[] = [];
  for (const { sheetName, importType } of classified) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || importType === 'site') continue;
    const parsed = parseDeviceSheet(sheet, sheetName, importType, siteId, companyId);
    candidates.push(...parsed.candidates);
    excludedRows.push(...parsed.excludedRows);
  }

  // Identity aliases can collide across sheets even when serial-derived
  // canonical references differ (for example a shared barcode).
  const sourceCollisions = findImportSourceCollisions(candidates.map(candidate => candidate.data));
  const resolved: DeviceCandidate[] = [];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const collision = sourceCollisions.get(index);
    if (collision) {
      const sources = collision.slice(0, 5).map(i => `${candidates[i].source.sheetName} row ${candidates[i].source.rowNumber}`).join('; ') +
        (collision.length > 5 ? `; and ${collision.length - 5} more rows` : '');
      excludedRows.push({ ...candidate.source, externalRef: candidate.data.externalRef,
        reason: `Ambiguous device identity shared by ${sources}. Supply unique serial numbers/barcodes or distinguish the floor, location, type, or model. All matching rows were excluded.` });
      continue;
    }
    const existing = await findImportDeviceMatches(db, candidate.data, lockIdentities);
    if (existing.length > 1) {
      excludedRows.push({ ...candidate.source, externalRef: candidate.data.externalRef,
        reason: 'This identity matches multiple saved devices. Resolve the saved duplicates before importing this row.' });
      continue;
    }
    candidate.existingId = existing[0]?.id;
    resolved.push(candidate);
  }
  // Distinct aliases can still identify one legacy record (serial on one row,
  // barcode on another). Never apply two source rows to that same saved asset.
  const targets = new Map<number, DeviceCandidate[]>();
  for (const candidate of resolved) {
    if (candidate.existingId == null) continue;
    const group = targets.get(candidate.existingId) ?? [];
    group.push(candidate); targets.set(candidate.existingId, group);
  }
  const eligible = resolved.filter(candidate => {
    const collision = candidate.existingId == null ? undefined : targets.get(candidate.existingId);
    if (!collision || collision.length < 2) return true;
    const sources = collision.map(row => `${row.source.sheetName} row ${row.source.rowNumber}`).join('; ');
    excludedRows.push({ ...candidate.source, externalRef: candidate.data.externalRef,
      reason: `Multiple source identities resolve to the same saved device: ${sources}. All matching rows were excluded. Reconcile the serial/barcode aliases before importing.` });
    return false;
  });
  return { db, workbook, classified, eligible, excludedRows };
}

function summarizePlan(plan: Awaited<ReturnType<typeof prepareWorkbookImport>>): WorkbookImportPreview {
  const counts = emptyCounts();
  let insertedCount = 0;
  let updatedCount = 0;
  for (const candidate of plan.eligible) {
    counts[COUNT_KEY[candidate.importType]]++;
    counts.total++;
    if (candidate.existingId != null) updatedCount++;
    else insertedCount++;
  }
  return {
    counts, insertedCount, updatedCount,
    excludedRowsCount: plan.excludedRows.length,
    excludedRows: plan.excludedRows,
    classifiedSheets: plan.classified,
  };
}

/** Read-only preview uses exactly the same parser and identity checks as execution. */
export async function previewWorkbookForSite(options: ImportWorkbookOptions): Promise<WorkbookImportPreview> {
  return summarizePlan(await prepareWorkbookImport(options));
}

/** Rebuild the plan at execution time so a preview never authorizes stale writes. */
export async function importWorkbookForSite(options: ImportWorkbookOptions): Promise<WorkbookImportSummary> {
  return withLockedImportSite(options, async tx => {
    const plan = await prepareWorkbookImport(options, tx, true);
    const { db, workbook, classified } = plan;
    const siteUpdatedFields: string[] = [];
    for (const { sheetName, importType } of classified) {
      if (importType === 'site' && workbook.Sheets[sheetName]) {
        siteUpdatedFields.push(...await parseSiteSheet(workbook.Sheets[sheetName], options.siteId, options.companyId, db));
      }
    }

    const counts = emptyCounts();
    const insertedCounts = emptyCounts();
    const updatedCounts = emptyCounts();
    let insertedCount = 0;
    let updatedCount = 0;
    const excludedRows = [...plan.excludedRows];
    for (let index = 0; index < plan.eligible.length; index++) {
      const candidate = plan.eligible[index];
      try {
        if (options.preserveSourceOrder) candidate.data.sortOrder = index + 1;
        if (candidate.existingId != null) {
          await db.update(devices).set({ ...candidate.data, updatedAt: new Date() }).where(and(
            eq(devices.id, candidate.existingId),
            eq(devices.companyId, options.companyId),
            eq(devices.siteId, options.siteId)
          ));
          updatedCount++;
          updatedCounts[COUNT_KEY[candidate.importType]]++;
          updatedCounts.total++;
        } else {
          await db.insert(devices).values(candidate.data);
          insertedCount++;
          insertedCounts[COUNT_KEY[candidate.importType]]++;
          insertedCounts.total++;
        }
        counts[COUNT_KEY[candidate.importType]]++;
        counts.total++;
      } catch (err: any) {
        if (!isRecoverableImportRowError(err)) throw err;
        console.error(`[workbookImport] Row upsert failed (${candidate.importType}):`, err?.message ?? err);
        excludedRows.push({ ...candidate.source, externalRef: candidate.data.externalRef, reason: 'Could not save this row. Check the device fields and try again.' });
      }
    }
    const catCount = Object.values(COUNT_KEY).filter(key => counts[key] > 0).length;
    const siteFieldsUpdated = siteUpdatedFields.length;
    return {
      siteFieldsUpdated, siteUpdatedFields, counts, insertedCount, updatedCount, insertedCounts, updatedCounts,
      excludedRowsCount: excludedRows.length,
      excludedRows,
      classifiedSheets: classified,
      message: [
        `Imported ${counts.total} devices across ${catCount} categor${catCount === 1 ? 'y' : 'ies'} (${insertedCount} inserted, ${updatedCount} updated).`,
        siteFieldsUpdated > 0 ? ` Updated ${siteFieldsUpdated} site fields.` : '',
        excludedRows.length > 0 ? ` Skipped ${excludedRows.length} rows.` : '',
      ].join('').trim(),
    };
  });
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

async function parseSiteSheet(sheet: XLSX.WorkSheet, siteId: number, companyId: number, db: Db): Promise<string[]> {
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
  const firstRow = rows[0] ?? {};
  const updateData: Record<string, any> = {};
  const updated: string[] = [];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  // Both the horizontal template and the older label/value format are used in
  // stored customer workbooks. Match complete labels before loose aliases.
  const knownLabels = new Set(Object.values(SITE_FIELDS).flat());
  const keyValue = rawRows.filter(row => row.length >= 2 && knownLabels.has(String(row[0] ?? '').trim().toLowerCase()));
  const keyValueFormat = (rawRows[0]?.length ?? 0) <= 2 &&
    (keyValue.length > 1 || (rawRows.length === 1 && keyValue.length === 1));

  for (const [col, keys] of Object.entries(SITE_FIELDS)) {
    const val = keyValueFormat
      ? String(keyValue.find(row => keys.includes(String(row[0] ?? '').trim().toLowerCase()))?.[1] ?? '').trim()
      : extractFieldFromObject(firstRow, keys);
    if (val) {
      updateData[col] = val;
      updated.push(col);
    }
  }

  if (updated.length > 0) {
    updateData.updatedAt = new Date();
    await db.update(sites).set(updateData).where(and(eq(sites.id, siteId), eq(sites.companyId, companyId)));
  }

  return updated;
}

// ─── Device sheet parser ──────────────────────────────────────────────────────

function parseDeviceSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  importType: Exclude<WorkbookImportType, 'site'>,
  siteId: number,
  companyId: number
): { candidates: DeviceCandidate[]; excludedRows: WorkbookRowIssue[] } {
  // Read as array-of-arrays so autoMapper + headerDetection can work properly
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', });
  if (rawRows.length === 0) return { candidates: [], excludedRows: [] };
  const firstSheetRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;

  const headerInfo = detectHeaderRow(rawRows, importType, 30);
  const headers = headerInfo.headers.map(h => (h == null ? '' : String(h)));
  const dataRows = rawRows.slice(headerInfo.dataStartIndex);

  const columnMapping = autoMapColumns(headers, importType);
  const schema = getImportSchema(importType);
  const category = TYPE_TO_CATEGORY[importType];

  // If no columns were mapped, none of the headers matched the known keywords.
  // Log this clearly so it's diagnosable rather than silently returning 0.
  if (Object.keys(columnMapping).length === 0) {
    console.warn(
      `[workbookImport] No columns mapped for sheet (importType=${importType}). ` +
      `Headers: [${headers.filter(Boolean).slice(0, 10).join(', ')}]. ` +
      `All ${dataRows.length} data rows will be skipped.`
    );
  }

  const candidates: DeviceCandidate[] = [];
  const excludedRows: WorkbookRowIssue[] = [];

  for (let index = 0; index < dataRows.length; index++) {
    const rawRow = dataRows[index];
    const source = { sheetName, rowNumber: firstSheetRow + headerInfo.dataStartIndex + index + 1 };
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

    // An unmapped sheet cannot safely assign any device fields.
    if (Object.keys(columnMapping).length === 0) {
      // Still count these as excluded — the import needs proper column mapping to
      // assign fields correctly. The warning above tells the admin what happened.
      excludedRows.push({ ...source, reason: 'No recognized columns. Check the sheet headers.' });
      continue;
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
      excludedRows.push({ ...source, reason: 'Missing meaningful device identity (location, serial number, barcode, or suite).' });
      continue;
    }

    const deviceData = buildDeviceData(importType, rowData, siteId, companyId, category);
    candidates.push({ source, importType, data: deviceData });
  }
  return { candidates, excludedRows };
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
  category: DeviceCategory
): typeof devices.$inferInsert & { externalRef: string } {
  const rawLocation = rowData.location || rowData.suiteNumber || 'Unknown';
  const location = rowData.floor
    ? `${String(rowData.floor).trim()} - ${String(rawLocation).trim()}`
    : String(rawLocation).trim();

  const deviceType =
    (rowData.deviceType ? String(rowData.deviceType).trim() : '') ||
    DEFAULT_DEVICE_TYPE[importType] ||
    'Unknown';

  const externalRef = buildExternalRef(importType, rowData, siteId, category);

  const base: typeof devices.$inferInsert & { externalRef: string } = {
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

export function buildExternalRef(
  importType: WorkbookImportType,
  rowData: Record<string, any>,
  siteId: number,
  category: DeviceCategory
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
  return [category, siteId, slug(rowData.floor),
    slug(rowData.location), slug(rowData.deviceType), slug(rowData.model),]
    .filter(Boolean)
    .join(':');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a field value from a key-value object row using flexible key matching.
 * Used for site info sheets (parsed with sheet_to_json default object mode).
 */
function extractFieldFromObject(row: Record<string, any>, keys: string[]): string {
  for (const header of Object.keys(row)) {
    const normalised = safeTrim(safeToLower(header)) ?? '';
    if (keys.some(k => normalised.includes(k))) {
      const val = row[header];
      return typeof val === 'string' ? val.trim() : String(val || '').trim();
    }
  }
  return '';
}
