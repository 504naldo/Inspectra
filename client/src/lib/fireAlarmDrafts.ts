import { z } from "zod";
import {
  offlineScopeKey,
  requireOfflineScope,
  type OfflineScope,
} from "./offlineScope";
const id = z.number().int().positive();
const text = z.string().optional();
const header = z
  .object({
    jobId: id,
    inspectionDate: text,
    systemManufacturer: text,
    systemModel: text,
    systemSerialNo: text,
    systemInstallYear: text,
    operationType: text,
    connectedToFSRC: z.boolean().optional(),
    fsrcName: text,
    fsrcPhone: text,
    fsrcAccountNo: text,
    techName: text,
    techCertNo: text,
    techCertLevel: text,
    techCompany: text,
    recommendations: text,
    sectionHeaderValues: z
      .record(z.string(), z.record(z.string(), z.string()))
      .optional(),
  })
  .strict();
const result = z
  .object({
    jobId: id,
    fireAlarmSystemId: id,
    checklistItemId: id,
    questionRevision: z
      .string()
      .regex(/^inspection-capture-v1:fire-alarm-question:[a-f0-9]{64}$/),
    result: z.enum(["pass", "fail", "na", "not_tested"]),
    notes: text,
    numericValue: text,
    textValue: text,
  })
  .strict();
const attendance = z
  .object({
    id,
    jobId: id,
    rowOrder: z.number().int().nonnegative().optional(),
    techName: text,
    certNo: text,
    attendanceDate: text,
    timeIn: text,
    timeOut: text,
    notes: text,
  })
  .strict();
const ancillary = z
  .object({
    id,
    jobId: id,
    rowOrder: z.number().int().nonnegative().optional(),
    circuitDescription: text,
    circuitType: text,
    poweredBy: text,
    operationConfirmed: z.enum(["yes", "no", "na"]).optional(),
    confirmationMethod: text,
    notes: text,
  })
  .strict();
export type FireAlarmDraft =
  | { kind: "header"; payload: z.infer<typeof header> }
  | { kind: "result"; payload: z.infer<typeof result> }
  | { kind: "attendance"; payload: z.infer<typeof attendance> }
  | { kind: "ancillary"; payload: z.infer<typeof ancillary> };
/** Decode one known operation. A matching job alone never authorizes an unknown key. */
export function parseFireAlarmDraft(
  key: string,
  value: unknown,
  jobId: number
): FireAlarmDraft {
  const mismatch = () => new Error("Saved draft type or job needs recovery");
  if (key === "header") {
    const payload = header.parse(value);
    if (payload.jobId !== jobId) throw mismatch();
    return { kind: "header", payload };
  }
  const match = /^(result|attendance|ancillary):([1-9]\d*)$/.exec(key);
  if (!match) throw mismatch();
  const recordId = Number(match[2]);
  if (match[1] === "result") {
    const payload = result.parse(value);
    if (payload.jobId !== jobId || payload.checklistItemId !== recordId)
      throw mismatch();
    return { kind: "result", payload };
  }
  if (match[1] === "attendance") {
    const payload = attendance.parse(value);
    if (payload.jobId !== jobId || payload.id !== recordId) throw mismatch();
    return { kind: "attendance", payload };
  }
  const payload = ancillary.parse(value);
  if (payload.jobId !== jobId || payload.id !== recordId) throw mismatch();
  return { kind: "ancillary", payload };
}
export function isFireAlarmDraft(key: string, value: unknown, jobId: number) {
  try {
    parseFireAlarmDraft(key, value, jobId);
    return true;
  } catch {
    return false;
  }
}
export async function dispatchFireAlarmDraft(
  key: string,
  payload: unknown,
  context: {
    scope: OfflineScope;
    currentScope: () => OfflineScope | null;
    jobId: number;
    isFinalized: () => boolean;
  },
  send: (draft: FireAlarmDraft) => Promise<unknown>
) {
  requireOfflineScope(context.scope);
  const current = context.currentScope();
  if (!current || offlineScopeKey(current) !== offlineScopeKey(context.scope))
    throw new Error("Account changed; saved draft was preserved");
  if (context.isFinalized())
    throw new Error(
      "This job is finalized; saved draft was preserved for review"
    );
  return send(parseFireAlarmDraft(key, payload, context.jobId));
}
