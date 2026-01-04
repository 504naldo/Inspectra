import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from './_core/env';
import mysql from 'mysql2/promise';

const connection = mysql.createPool({
  uri: ENV.databaseUrl,
});

const db = drizzle(connection);
import {
  sprinklerInspections,
  sprinklerSystems,
  sprinklerChecklistItems,
  sprinklerDevices,
  type InsertSprinklerInspection,
  type InsertSprinklerSystem,
  type InsertSprinklerChecklistItem,
  type InsertSprinklerDevice,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ============================================
// SPRINKLER INSPECTIONS
// ============================================

export async function createSprinklerInspection(data: InsertSprinklerInspection) {
  const [inspection] = await db.insert(sprinklerInspections).values(data);
  return inspection;
}

export async function getSprinklerInspectionById(id: number) {
  const [inspection] = await db.select().from(sprinklerInspections).where(eq(sprinklerInspections.id, id));
  return inspection;
}

export async function getSprinklerInspectionByJobId(jobId: number) {
  const [inspection] = await db.select().from(sprinklerInspections).where(eq(sprinklerInspections.jobId, jobId));
  return inspection;
}

export async function updateSprinklerInspection(id: number, data: Partial<InsertSprinklerInspection>) {
  await db.update(sprinklerInspections).set(data).where(eq(sprinklerInspections.id, id));
  return getSprinklerInspectionById(id);
}

export async function finalizeSprinklerInspection(id: number, userId: number) {
  await db.update(sprinklerInspections).set({
    status: 'finalized',
    finalizedAt: new Date(),
    finalizedById: userId,
  }).where(eq(sprinklerInspections.id, id));
  return getSprinklerInspectionById(id);
}

// ============================================
// SPRINKLER SYSTEMS
// ============================================

export async function createSprinklerSystem(data: InsertSprinklerSystem) {
  const [system] = await db.insert(sprinklerSystems).values(data);
  return system;
}

export async function getSprinklerSystemsByInspectionId(inspectionId: number) {
  return db.select().from(sprinklerSystems).where(eq(sprinklerSystems.inspectionId, inspectionId));
}

export async function getSprinklerSystemById(id: number) {
  const [system] = await db.select().from(sprinklerSystems).where(eq(sprinklerSystems.id, id));
  return system;
}

export async function updateSprinklerSystem(id: number, data: Partial<InsertSprinklerSystem>) {
  await db.update(sprinklerSystems).set(data).where(eq(sprinklerSystems.id, id));
  return getSprinklerSystemById(id);
}

export async function deleteSprinklerSystem(id: number) {
  await db.delete(sprinklerSystems).where(eq(sprinklerSystems.id, id));
}

export async function upsertSprinklerSystems(inspectionId: number, systems: Partial<InsertSprinklerSystem>[]) {
  // Delete existing systems for this inspection
  await db.delete(sprinklerSystems).where(eq(sprinklerSystems.inspectionId, inspectionId));
  
  // Insert new systems
  if (systems.length > 0) {
    const systemsWithInspectionId = systems.map(s => ({ ...s, inspectionId }));
    await db.insert(sprinklerSystems).values(systemsWithInspectionId as any);
  }
  
  return getSprinklerSystemsByInspectionId(inspectionId);
}

// ============================================
// SPRINKLER CHECKLIST ITEMS
// ============================================

export async function createSprinklerChecklistItem(data: InsertSprinklerChecklistItem) {
  const [item] = await db.insert(sprinklerChecklistItems).values(data);
  return item;
}

export async function getSprinklerChecklistItemsByInspectionId(inspectionId: number) {
  return db.select().from(sprinklerChecklistItems).where(eq(sprinklerChecklistItems.inspectionId, inspectionId));
}

export async function getSprinklerChecklistItemById(id: number) {
  const [item] = await db.select().from(sprinklerChecklistItems).where(eq(sprinklerChecklistItems.id, id));
  return item;
}

export async function updateSprinklerChecklistItem(id: number, data: Partial<InsertSprinklerChecklistItem>) {
  await db.update(sprinklerChecklistItems).set(data).where(eq(sprinklerChecklistItems.id, id));
  return getSprinklerChecklistItemById(id);
}

export async function deleteSprinklerChecklistItem(id: number) {
  await db.delete(sprinklerChecklistItems).where(eq(sprinklerChecklistItems.id, id));
}

export async function upsertSprinklerChecklistItems(inspectionId: number, items: Partial<InsertSprinklerChecklistItem>[]) {
  // Delete existing items for this inspection
  await db.delete(sprinklerChecklistItems).where(eq(sprinklerChecklistItems.inspectionId, inspectionId));
  
  // Insert new items
  if (items.length > 0) {
    const itemsWithInspectionId = items.map(i => ({ ...i, inspectionId }));
    await db.insert(sprinklerChecklistItems).values(itemsWithInspectionId as any);
  }
  
  return getSprinklerChecklistItemsByInspectionId(inspectionId);
}

// ============================================
// SPRINKLER DEVICES
// ============================================

export async function createSprinklerDevice(data: InsertSprinklerDevice) {
  const [device] = await db.insert(sprinklerDevices).values(data);
  return device;
}

export async function getSprinklerDevicesByInspectionId(inspectionId: number) {
  return db.select().from(sprinklerDevices).where(eq(sprinklerDevices.inspectionId, inspectionId));
}

export async function getSprinklerDeviceById(id: number) {
  const [device] = await db.select().from(sprinklerDevices).where(eq(sprinklerDevices.id, id));
  return device;
}

export async function updateSprinklerDevice(id: number, data: Partial<InsertSprinklerDevice>) {
  await db.update(sprinklerDevices).set(data).where(eq(sprinklerDevices.id, id));
  return getSprinklerDeviceById(id);
}

export async function deleteSprinklerDevice(id: number) {
  await db.delete(sprinklerDevices).where(eq(sprinklerDevices.id, id));
}

export async function upsertSprinklerDevices(inspectionId: number, devices: Partial<InsertSprinklerDevice>[]) {
  // Delete existing devices for this inspection
  await db.delete(sprinklerDevices).where(eq(sprinklerDevices.inspectionId, inspectionId));
  
  // Insert new devices
  if (devices.length > 0) {
    const devicesWithInspectionId = devices.map((d: any) => ({ ...d, inspectionId }));
    await db.insert(sprinklerDevices).values(devicesWithInspectionId as any);
  }
  
  return getSprinklerDevicesByInspectionId(inspectionId);
}

// ============================================
// VALIDATION HELPERS
// ============================================

export async function validateSprinklerInspectionForFinalize(inspectionId: number) {
  const errors: string[] = [];
  
  // Check devices have locations
  const devices = await getSprinklerDevicesByInspectionId(inspectionId);
  const devicesWithoutLocation = devices.filter(d => !d.location || d.location.trim() === '');
  if (devicesWithoutLocation.length > 0) {
    errors.push(`${devicesWithoutLocation.length} device(s) missing location`);
  }
  
  // Check deficiency-creating responses have comments
  const checklistItems = await getSprinklerChecklistItemsByInspectionId(inspectionId);
  const deficiencyResponsesWithoutComment = checklistItems.filter((item: any) => 
    item.response && 
    item.createsDeficiencyWhen && 
    item.response === item.createsDeficiencyWhen &&
    (!item.comment || item.comment.trim() === '')
  );
  if (deficiencyResponsesWithoutComment.length > 0) {
    errors.push(`${deficiencyResponsesWithoutComment.length} deficiency item(s) require comments`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// DEFICIENCY EXTRACTION
// ============================================

export async function getSprinklerDeficiencies(inspectionId: number) {
  const deficiencies: Array<{
    type: 'checklist' | 'device';
    id: number;
    section?: string;
    questionText?: string;
    location?: string;
    deviceType?: string;
    comment?: string;
    remarks?: string;
    failedChecks?: string[];
  }> = [];
  
  // Get checklist deficiencies (only when response matches createsDeficiencyWhen)
  const checklistItems = await getSprinklerChecklistItemsByInspectionId(inspectionId);
  checklistItems.filter((item: any) => 
    item.response && 
    item.createsDeficiencyWhen && 
    item.response === item.createsDeficiencyWhen
  ).forEach((item: any) => {
    deficiencies.push({
      type: 'checklist',
      id: item.id,
      section: item.section,
      questionText: item.questionText,
      comment: item.comment || undefined,
    });
  });
  
  // Get device deficiencies (any failed checks)
  const devices = await getSprinklerDevicesByInspectionId(inspectionId);
  devices.forEach((device: any) => {
    const failedChecks: string[] = [];
    if (device.checkA === false) failedChecks.push('A');
    if (device.checkB === false) failedChecks.push('B');
    if (device.checkC === false) failedChecks.push('C');
    if (device.checkD === false) failedChecks.push('D');
    if (device.checkE === false) failedChecks.push('E');
    if (device.checkF === false) failedChecks.push('F');
    
    if (failedChecks.length > 0) {
      deficiencies.push({
        type: 'device',
        id: device.id,
        location: device.location,
        deviceType: device.deviceType || undefined,
        remarks: device.remarks || undefined,
        failedChecks,
      });
    }
  });
  
  return deficiencies;
}
