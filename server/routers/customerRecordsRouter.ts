/**
 * customerRecordsRouter.ts
 *
 * tRPC procedures for browsing customer records stored in Google Drive.
 * Restricted to admin + office roles (officeProcedure).
 *
 * All Drive queries are scoped to GOOGLE_DRIVE_CUSTOMER_ROOT_ID — the service
 * module never searches outside that subtree.
 *
 * Every access is audit-logged to stdout as structured JSON.
 * Grep for `"event":"customer_records_*"` to extract the log lines.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc.js";
import { getValidGoogleToken } from "../_core/googleAuth.js";
import { ENV } from "../_core/env.js";
import * as drive from "../customerRecords/driveService.js";
import * as db from "../db.js";

// ─── Audit helper ─────────────────────────────────────────────────────────────

function auditLog(
  event: string,
  ctx: { user?: { id: number; email?: string | null } | null; requestId?: string; ipAddress?: string },
  extra?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      event,
      userId: ctx.user?.id,
      userEmail: ctx.user?.email,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  );
}

// ─── Token helper ─────────────────────────────────────────────────────────────

async function requireToken(ctx: { user: { id: number } }): Promise<string> {
  const token = await getValidGoogleToken(ctx.user.id);
  if (!token) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Google account not connected. Please log out and log back in to link your Google account.",
    });
  }
  return token;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const customerRecordsRouter = router({
  /**
   * Returns the configured Drive root folder ID so the frontend can initialise
   * the import picker at the customer-records root instead of the Drive root.
   * Only the folder ID is returned — no credentials are exposed.
   */
  getRootFolderId: officeProcedure.query(({ ctx }) => {
    auditLog("customer_records_get_root_id", ctx);
    return { folderId: ENV.googleDriveCustomerRootId || null };
  }),

  /**
   * Google OAuth token.  Used by the UI to render the correct empty state.
   */
  status: officeProcedure.query(async ({ ctx }) => {
    auditLog("customer_records_status_check", ctx);

    if (!drive.isDriveConfigured()) {
      return {
        configured: false,
        connected: false,
        error: "GOOGLE_DRIVE_CUSTOMER_ROOT_ID is not set on this server.",
      };
    }

    const token = await getValidGoogleToken(ctx.user.id);
    return {
      configured: true,
      connected: token !== null,
      error: token
        ? null
        : "Your Google account is not linked. Log out and log back in.",
    };
  }),

  /**
   * Search customers/sites/jobs in the database AND search Drive for matching
   * folder/file names — all within the configured root.
   */
  search: officeProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        query: z.string().min(1).max(200).trim(),
      })
    )
    .query(async ({ input, ctx }) => {
      auditLog("customer_records_search", ctx, {
        companyId: input.companyId,
        query: input.query,
      });

      const token = await requireToken(ctx);
      const q = input.query.toLowerCase();

      // Parallel: DB queries + Drive search
      const [customers, sites, jobs, driveResult] = await Promise.all([
        db.getCustomerOrgsByCompany(input.companyId),
        db.getSitesByCompany(input.companyId),
        db.searchJobs(input.companyId, input.query),
        drive.searchInRoot(input.query, token),
      ]);

      const matchedCustomers = customers.filter(
        (c: any) =>
          c.name.toLowerCase().includes(q) ||
          (c.contactName ?? "").toLowerCase().includes(q)
      );

      const matchedSites = sites.filter(
        (s: any) =>
          s.name.toLowerCase().includes(q) ||
          (s.address ?? "").toLowerCase().includes(q) ||
          (s.city ?? "").toLowerCase().includes(q)
      );

      return {
        customers: matchedCustomers.map((c: any) => ({
          id: c.id,
          name: c.name,
          contactName: c.contactName ?? null,
          contactEmail: c.contactEmail ?? null,
          contactPhone: c.contactPhone ?? null,
        })),
        sites: matchedSites.map((s: any) => ({
          id: s.id,
          name: s.name,
          address: s.address ?? null,
          city: s.city ?? null,
        })),
        jobs: (jobs as any[]).slice(0, 20).map((j: any) => ({
          id: j.id,
          jobNumber: j.jobNumber,
          title: j.title,
        })),
        driveEntries: driveResult.entries,
        driveError: driveResult.error ?? null,
      };
    }),

  /**
   * List the immediate children of the configured Drive root folder.
   * Returns folders first, then files, both sorted by name.
   */
  listRoot: officeProcedure.query(async ({ ctx }) => {
    auditLog("customer_records_list_root", ctx);
    const token = await requireToken(ctx);
    return drive.listRootChildren(token);
  }),

  /**
   * List the immediate children of a Drive folder by its ID.
   * The ID must have been previously returned by listRoot, listFolder, or search —
   * the UI never constructs IDs from user input.
   */
  listFolder: officeProcedure
    .input(
      z.object({
        folderId: z.string().min(1).max(200),
      })
    )
    .query(async ({ input, ctx }) => {
      auditLog("customer_records_list_folder", ctx, { folderId: input.folderId });
      const token = await requireToken(ctx);
      return drive.listFolderById(input.folderId, token);
    }),

  /**
   * Download a file from Drive by its ID.
   * Returns base64-encoded content, MIME type, and filename so the browser
   * can trigger a save-as dialog.
   *
   * Google Workspace files (Docs, Sheets, Slides) are exported:
   *   Sheets → .xlsx   |   Docs → .docx   |   other → .pdf
   *
   * Capped at 50 MB.  For larger files the frontend should use webViewLink
   * to open the file directly in Google Drive.
   */
  downloadFile: officeProcedure
    .input(
      z.object({
        fileId: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ input, ctx }) => {
      auditLog("customer_records_download", ctx, { fileId: input.fileId });

      const token = await requireToken(ctx);
      const result = await drive.downloadDriveFile(input.fileId, token);

      if ("error" in result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }

      return {
        data: result.data.toString("base64"),
        mimeType: result.mimeType,
        fileName: result.fileName,
      };
    }),
});
