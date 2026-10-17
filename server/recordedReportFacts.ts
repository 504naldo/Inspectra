import { eq } from "drizzle-orm";
import {
  fireAlarmFormHeader,
  fireAlarmInspectionResults,
  inspectionResults,
} from "../drizzle/schema";
import { getDb } from "./db";

type Header = Partial<typeof fireAlarmFormHeader.$inferSelect> | null;
type CredentialRow = {
  technicianId?: number | null;
  testedById?: number | null;
  technicianCertificationSnapshot?: unknown;
};
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function recordedInspectionDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function recordedInspectionFrequency(jobType: string) {
  const frequencies = { annual: "Annual", semi_annual: "Semi-annual", quarterly: "Quarterly", monthly: "Monthly", service_call: "Service", repair: "Repair" } as const;
  return Object.hasOwn(frequencies, jobType) ? frequencies[jobType as keyof typeof frequencies] : undefined;
}

/** Missing evidence stays missing; today's staff/catalogue values are not captures. */
export function buildRecordedReportFacts(
  header: Header,
  rows: CredentialRow[],
  technicianId?: number | null
) {
  const snapshots = rows
    .filter(
      row =>
        technicianId == null ||
        (row.technicianId ?? row.testedById) === technicianId
    )
    .map(row => row.technicianCertificationSnapshot)
    .filter(
      (value): value is Record<string, unknown> =>
        !!value && typeof value === "object" && !Array.isArray(value)
    );
  const credentials = new Map(
    snapshots.map(value => {
      const captured = {
        name: text(value.name),
        certNumber: text(value.certNumber),
        level: text(value.certificationLevel),
      };
      return [JSON.stringify(captured), captured] as const;
    })
  );
  const credential =
    credentials.size === 1 ? Array.from(credentials.values())[0] : undefined;
  const formIdentity = !!(text(header?.techName) || text(header?.techCertNo));
  const connectionCapture =
    header?.sectionHeaderValues?.["_inspection_capture"]?.connectedToFSRC;
  const operation = text(header?.operationType)
    ?.toLowerCase()
    .replace(/[\s_-]/g, "");
  return {
    inspectionDate: recordedInspectionDate(header?.inspectionDate),
    systemModel: text(header?.systemModel) ?? "Not recorded",
    systemOperation:
      operation === "singlestage"
        ? ("Single Stage" as const)
        : operation === "twostage"
          ? ("Two Stage" as const)
          : undefined,
    fireSignalReceivingCentre: text(header?.fsrcName),
    // Legacy false is the schema default. New explicit Yes/No captures carry a
    // marker in the same row so a default never becomes a reported observation.
    connectedToFireSignalReceivingCentre:
      connectionCapture === String(header?.connectedToFSRC)
        ? (header?.connectedToFSRC ?? undefined)
        : header?.connectedToFSRC === true
          ? true
          : undefined,
    systemFullyFunctional: undefined as boolean | undefined,
    recommendationsIdentified: text(header?.recommendations) ? true : undefined,
    technicianName:
      (formIdentity ? text(header?.techName) : credential?.name) ??
      "Not recorded",
    technicianCertificateNumber:
      (formIdentity ? text(header?.techCertNo) : credential?.certNumber) ?? "",
    technicianTitle:
      (formIdentity ? text(header?.techCertLevel) : credential?.level) ?? "",
  };
}

export async function getRecordedReportFacts(
  jobId: number,
  technicianId?: number | null
) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const [headers, fire, devices] = await Promise.all([
    database
      .select()
      .from(fireAlarmFormHeader)
      .where(eq(fireAlarmFormHeader.jobId, jobId)),
    database
      .select({
        testedById: fireAlarmInspectionResults.testedById,
        technicianCertificationSnapshot:
          fireAlarmInspectionResults.technicianCertificationSnapshot,
      })
      .from(fireAlarmInspectionResults)
      .where(eq(fireAlarmInspectionResults.jobId, jobId)),
    database
      .select({
        technicianId: inspectionResults.technicianId,
        technicianCertificationSnapshot:
          inspectionResults.technicianCertificationSnapshot,
      })
      .from(inspectionResults)
      .where(eq(inspectionResults.jobId, jobId)),
  ]);
  return buildRecordedReportFacts(
    headers[0] ?? null,
    [...fire, ...devices],
    technicianId
  );
}

export function recordedDeviceOutcome(result: string) {
  return result === "pass"
    ? ("PASS" as const)
    : result === "fail"
      ? ("DEFICIENT" as const)
      : result === "na"
        ? ("N/A" as const)
        : ("NOT TESTED" as const);
}
