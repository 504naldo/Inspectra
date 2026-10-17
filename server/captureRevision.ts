import { createHash } from "node:crypto";

/** A displayed definition's identity; capture timestamps and answers are excluded. */
export function createCaptureRevision(kind: string, evidence: unknown): string {
  function canonical(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
    return value;
  }
  return `inspection-capture-v1:${kind}:${createHash("sha256").update(JSON.stringify(canonical(evidence))).digest("hex")}`;
}
