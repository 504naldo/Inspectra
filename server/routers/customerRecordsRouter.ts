/**
 * Customer Records Router
 *
 * tRPC procedures for browsing the company shared drive.
 * Restricted to admin + office roles (officeProcedure).
 * Every access is audit-logged to application stdout (captured by Railway / your
 * log aggregator).  The log lines are structured JSON — grep for
 * `"event":"customer_records_*"` to extract them.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, officeProcedure } from '../_core/trpc.js';
import * as share from '../customerRecords/shareService.js';
import * as db from '../db.js';

// ─── Audit helper ─────────────────────────────────────────────────────────────

function auditLog(event: string, ctx: any, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      event,
      userId:    ctx.user?.id,
      userEmail: ctx.user?.email,
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const customerRecordsRouter = router({

  /**
   * Returns whether the share is configured and reachable.
   * Used by the UI to show a "share unavailable" banner instead of an empty state.
   */
  status: officeProcedure.query(async ({ ctx }) => {
    auditLog('customer_records_status_check', ctx);
    if (!share.isShareConfigured()) {
      return { configured: false, reachable: false, error: 'CUSTOMER_SHARE_ROOT is not set on this server.' };
    }
    // Try listing root to verify connectivity
    const result = await share.listRootFolders();
    return {
      configured: true,
      reachable:  !result.error,
      error:      result.error ?? null,
    };
  }),

  /**
   * Search customers/sites/jobs in the database by name, address, or job number.
   * Optionally cross-references share root folders to surface the folder name.
   */
  search: officeProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      query:     z.string().min(1).max(200).trim(),
    }))
    .query(async ({ input, ctx }) => {
      auditLog('customer_records_search', ctx, { companyId: input.companyId, query: input.query });

      const q = input.query.toLowerCase();

      // Parallel DB queries
      const [customers, sites, jobs] = await Promise.all([
        db.getCustomerOrgsByCompany(input.companyId),
        db.getSitesByCompany(input.companyId),
        db.searchJobs(input.companyId, input.query),
      ]);

      // Also search share folders so the UI can match DB records to share folders
      const shareFolders = share.isShareConfigured()
        ? (await share.searchFolders(input.query)).folders
        : [];

      const matchedCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.contactName ?? '').toLowerCase().includes(q)
      );

      const matchedSites = sites.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.address ?? '').toLowerCase().includes(q) ||
        (s.city ?? '').toLowerCase().includes(q)
      );

      return {
        customers: matchedCustomers.map(c => ({
          id:           c.id,
          name:         c.name,
          contactName:  c.contactName ?? null,
          contactEmail: c.contactEmail ?? null,
          contactPhone: c.contactPhone ?? null,
        })),
        sites: matchedSites.map(s => ({
          id:      s.id,
          name:    s.name,
          address: s.address ?? null,
          city:    s.city ?? null,
        })),
        jobs: jobs.slice(0, 20).map((j: any) => ({
          id:        j.id,
          jobNumber: j.jobNumber,
          title:     j.title,
        })),
        shareFolders,
      };
    }),

  /**
   * List the top-level folders at the share root.
   * Typically one folder per customer / building.
   */
  listRoot: officeProcedure.query(async ({ ctx }) => {
    auditLog('customer_records_list_root', ctx);
    return share.listRootFolders();
  }),

  /**
   * List the contents of a folder at the given relative path.
   * `folderPath` is relative to CUSTOMER_SHARE_ROOT and is sanitised server-side.
   */
  listFolder: officeProcedure
    .input(z.object({
      folderPath: z.string().max(500),
    }))
    .query(async ({ input, ctx }) => {
      auditLog('customer_records_list_folder', ctx, { folderPath: input.folderPath });
      return share.listDirectory(input.folderPath);
    }),

  /**
   * Download a file from the share.
   * Returns base64-encoded content + MIME type so the browser can open or save it.
   * Capped at 50 MB (enforced in shareService.readFile).
   *
   * NOTE: For very large files this should be replaced with a streaming endpoint.
   * The current implementation is sufficient for typical office documents.
   */
  downloadFile: officeProcedure
    .input(z.object({
      filePath: z.string().max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      auditLog('customer_records_download', ctx, { filePath: input.filePath });

      const result = await share.readFile(input.filePath);

      if ('error' in result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: result.error });
      }

      const fileName = input.filePath.split('/').pop() ?? 'file';
      return {
        data:     result.data.toString('base64'),
        mimeType: result.mimeType,
        fileName,
      };
    }),
});
