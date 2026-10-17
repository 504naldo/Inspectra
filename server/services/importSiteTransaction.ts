import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { sites, type Site } from "../../drizzle/schema";
import { getDb } from "../db";
import { getTransactionDb, runWithDb, type Db } from "../db/client";

/** All import entry points serialize destination writes on the same parent. */
export async function withLockedImportSite<T>(
  destination: { siteId: number; companyId: number; customerOrgId?: number },
  fn: (tx: Db, site: Site) => Promise<T>,
): Promise<T> {
  const locked = async (tx: Db) => {
    // Lock before any consistent read establishes a REPEATABLE READ snapshot.
    // Device identity reads must happen after this lock, never in the preview.
    const [site] = await tx.select().from(sites)
      .where(eq(sites.id, destination.siteId)).for("update");
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Import site not found" });
    if (site.companyId !== destination.companyId ||
        (destination.customerOrgId != null && site.customerOrgId !== destination.customerOrgId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Import destination changed" });
    }
    return runWithDb(tx, () => fn(tx, site));
  };
  // withAudit owns its connection's BEGIN/COMMIT. Starting another database
  // transaction there would implicitly commit it; join its context instead.
  const current = getTransactionDb();
  if (current) return locked(current);
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(tx => locked(tx as unknown as Db));
}

const ROW_DATA_ERRORS = new Set([
  "ER_BAD_NULL_ERROR", "ER_DATA_TOO_LONG", "ER_WARN_DATA_OUT_OF_RANGE",
  "ER_TRUNCATED_WRONG_VALUE", "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
  "ER_NO_DEFAULT_FOR_FIELD", "WARN_DATA_TRUNCATED", "ER_DUP_ENTRY",
]);

/** MySQL data errors roll back one statement. Connection/transaction errors do
 * not: swallowing a deadlock can commit later writes from an aborted import.
 */
export function isRecoverableImportRowError(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const detail = error as { code?: string; cause?: unknown };
    if (detail.code && ROW_DATA_ERRORS.has(detail.code)) return true;
    error = detail.cause;
  }
  return false;
}
