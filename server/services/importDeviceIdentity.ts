import { createHash } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { devices, type InsertDevice } from "../../drizzle/schema";
import type { Db } from "../db/client";

type SourceIdentity = Pick<InsertDevice, "companyId" | "siteId" | "category" | "externalRef" | "serialNumber" | "barcode">;

/** Mirror the lookup aliases, including raw legacy barcode externalRefs. */
export function importDeviceIdentityTokens(data: SourceIdentity): string[] {
  const scope = [data.companyId, data.siteId, data.category];
  const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const tokens: string[] = [];
  if (normalized(data.externalRef)) tokens.push(JSON.stringify([...scope, "reference", normalized(data.externalRef)]));
  if (normalized(data.serialNumber)) tokens.push(JSON.stringify([...scope, "serial", normalized(data.serialNumber)]));
  if (normalized(data.barcode)) tokens.push(JSON.stringify([...scope, "reference", normalized(data.barcode)]));
  return Array.from(new Set(tokens));
}

/** Return every ambiguous row, before an earlier row can change a later match. */
export function findImportSourceCollisions(rows: SourceIdentity[]): Map<number, number[]> {
  const byToken = new Map<string, number[]>();
  rows.forEach((data, index) => {
    for (const token of importDeviceIdentityTokens(data)) {
      const group = byToken.get(token) ?? [];
      group.push(index); byToken.set(token, group);
    }
  });
  const collisions = new Map<number, Set<number>>();
  for (const group of Array.from(byToken.values())) {
    if (group.length < 2) continue;
    for (const index of group) {
      const others = collisions.get(index) ?? new Set<number>();
      for (const other of group) others.add(other);
      collisions.set(index, others);
    }
  }
  return new Map(Array.from(collisions, ([index, group]) => [index, Array.from(group).sort((a, b) => a - b)]));
}

/** Include keys written by the older mapped/file importers so moving an import
 * to the canonical pipeline does not create another copy of a saved asset.
 */
export async function findImportDeviceMatches(
  database: Db,
  data: InsertDevice & { externalRef: string },
  lock = false,
) {
  const identity = [eq(devices.externalRef, data.externalRef)];
  const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
  if (data.serialNumber) {
    identity.push(sql`lower(trim(${devices.serialNumber})) = ${normalized(data.serialNumber)}`);
  }
  if (data.barcode) {
    identity.push(sql`lower(trim(${devices.barcode})) = ${normalized(data.barcode)}`);
    identity.push(sql`lower(trim(${devices.externalRef})) = ${normalized(data.barcode)}`);
  }
  if (!data.serialNumber && !data.barcode) {
    const oldKey = createHash("md5").update(`${data.category}:${data.location ?? ""}:${data.deviceType}`).digest("hex");
    identity.push(eq(devices.externalRef, oldKey));
  }
  const query = database.select().from(devices).where(and(
    eq(devices.companyId, data.companyId), eq(devices.siteId, data.siteId),
    or(eq(devices.category, data.category!), isNull(devices.category)), or(...identity),
  )).limit(2);
  return lock ? query.for("update") : query;
}
