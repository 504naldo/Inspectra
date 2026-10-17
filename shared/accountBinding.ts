/** The UI session that authorized an operation, independent of the request cookie. */
export type ExpectedAccount = Readonly<{
  id: number;
  companyId: number | null;
  role: "admin" | "office" | "technician" | "customer";
  customerOrgId: number | null;
  sessionVersion: number;
}>;

export const EXPECTED_ACCOUNT_HEADER = "x-inspectra-expected-account";
export const ACCOUNT_CHANGED_MESSAGE = "Your account or session changed before this action was submitted. Check your session and try again. Your saved changes were preserved.";

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function nullableId(value: unknown): value is number | null {
  return value === null || positiveId(value);
}

/** Copy only authorization fields; callers cannot mutate an already captured actor. */
export function expectedAccount(value: unknown): ExpectedAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const actor = value as Record<string, unknown>;
  if (!positiveId(actor.id) || !nullableId(actor.companyId) || !nullableId(actor.customerOrgId)
    || !["admin", "office", "technician", "customer"].includes(actor.role as string)
    || typeof actor.sessionVersion !== "number" || !Number.isSafeInteger(actor.sessionVersion) || actor.sessionVersion < 0) return null;
  return Object.freeze({ id: actor.id, companyId: actor.companyId, role: actor.role as ExpectedAccount["role"],
    customerOrgId: actor.customerOrgId, sessionVersion: actor.sessionVersion });
}

export function sameExpectedAccount(left: ExpectedAccount | null, right: ExpectedAccount | null): boolean {
  return left === null || right === null ? left === right : left.id === right.id
    && left.companyId === right.companyId && left.role === right.role
    && left.customerOrgId === right.customerOrgId && left.sessionVersion === right.sessionVersion;
}

export function serializeExpectedAccount(actor: ExpectedAccount): string {
  return JSON.stringify({ version: 1, ...actor });
}

/** Missing, duplicate, malformed, and future-version headers all fail closed. */
export function parseExpectedAccountHeader(header: string | string[] | undefined): ExpectedAccount | null {
  if (typeof header !== "string" || header.length > 1024) return null;
  try {
    const value = JSON.parse(header);
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1
      || Object.keys(value).sort().join(",") !== "companyId,customerOrgId,id,role,sessionVersion,version") return null;
    return expectedAccount(value);
  } catch { return null; }
}
