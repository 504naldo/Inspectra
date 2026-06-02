import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import {
  PARTS_REQUEST_STATUSES,
  PARTS_REQUEST_PRIORITIES,
  PARTS_REQUEST_ITEM_STATUSES,
  INVENTORY_TRANSACTION_TYPES,
} from "../../drizzle/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireInventoryItem(id: number, companyId: number) {
  const item = await db.getInventoryItemById(id);
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });
  if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return item;
}

async function requirePartsRequest(id: number, companyId: number) {
  const req = await db.getPartsRequestById(id);
  if (!req) throw new TRPCError({ code: "NOT_FOUND" });
  if (req.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return req;
}

async function requirePartsRequestItem(id: number, companyId: number) {
  const item = await db.getPartsRequestItemById(id);
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });
  if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return item;
}

async function recordTransaction(
  companyId: number,
  inventoryItemId: number,
  transactionType: (typeof INVENTORY_TRANSACTION_TYPES)[number],
  quantity: number,
  performedById: number,
  notes?: string,
  sourceType?: string,
  sourceId?: number,
) {
  await db.createInventoryTransaction({
    companyId,
    inventoryItemId,
    transactionType,
    quantity,
    performedById,
    notes: notes ?? null,
    sourceType: sourceType ?? null,
    sourceId: sourceId ?? null,
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const inventoryRouter = router({

  // ── Overview ──────────────────────────────────────────────────────────────

  getOverview: officeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const [items, requests] = await Promise.all([
      db.getInventoryItemsByCompany(companyId),
      db.getPartsRequestsByCompany(companyId),
    ]);

    const activeItems = items.filter((i) => i.isActive);
    const lowStockItems = activeItems.filter(
      (i) => i.quantityOnHand <= i.reorderPoint,
    );
    const outOfStock = activeItems.filter((i) => i.quantityOnHand <= 0);
    const hasReserved = activeItems.filter((i) => i.quantityReserved > 0);
    const inventoryValue = activeItems.reduce(
      (sum, i) =>
        sum + Number(i.unitCost ?? 0) * i.quantityOnHand,
      0,
    );

    const requestCounts = PARTS_REQUEST_STATUSES.reduce(
      (acc, s) => {
        acc[s] = requests.filter((r) => r.status === s).length;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalActiveItems: activeItems.length,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStock.length,
      reservedItemsCount: hasReserved.length,
      inventoryValue: Number(inventoryValue.toFixed(2)),
      requestCounts,
      urgentRequests: requests.filter((r) => r.priority === "urgent" && !["used", "cancelled"].includes(r.status)).length,
    };
  }),

  // ── Inventory CRUD ────────────────────────────────────────────────────────

  listInventory: officeProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return db.getInventoryItemsByCompany(ctx.user.companyId!, input.includeInactive);
    }),

  getInventoryItem: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const item = await requireInventoryItem(input.id, ctx.user.companyId!);
      const transactions = await db.getInventoryTransactionsByItem(input.id);
      return { item, transactions };
    }),

  createInventoryItem: officeProcedure
    .input(z.object({
      partsCatalogId: z.number().int().positive().optional(),
      sku: z.string().max(100).optional(),
      category: z.string().min(1).max(100),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      unitCost: z.number().nonnegative().default(0),
      unitPrice: z.number().nonnegative().default(0),
      quantityOnHand: z.number().int().min(0).default(0),
      reorderPoint: z.number().int().min(0).default(0),
      reorderQuantity: z.number().int().min(0).default(0),
      storageLocation: z.string().max(255).optional(),
      supplierName: z.string().max(255).optional(),
      supplierPartNumber: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const id = await db.createInventoryItem({
        companyId,
        partsCatalogId: input.partsCatalogId ?? null,
        sku: input.sku ?? null,
        category: input.category,
        name: input.name,
        description: input.description ?? null,
        unitCost: String(input.unitCost) as any,
        unitPrice: String(input.unitPrice) as any,
        quantityOnHand: input.quantityOnHand,
        quantityReserved: 0,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
        storageLocation: input.storageLocation ?? null,
        supplierName: input.supplierName ?? null,
        supplierPartNumber: input.supplierPartNumber ?? null,
        isActive: true,
      });

      if (input.quantityOnHand > 0) {
        await recordTransaction(
          companyId, id, "initial_count", input.quantityOnHand, ctx.user.id,
          "Initial stock count on item creation",
        );
      }

      void logActivity({
        ctx,
        entityType: "inventory_item",
        entityId: id,
        eventType: "created",
        title: `Inventory item created: ${input.name}`,
      });

      return { id };
    }),

  updateInventoryItem: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      sku: z.string().max(100).optional().nullable(),
      category: z.string().min(1).max(100).optional(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional().nullable(),
      unitCost: z.number().nonnegative().optional(),
      unitPrice: z.number().nonnegative().optional(),
      reorderPoint: z.number().int().min(0).optional(),
      reorderQuantity: z.number().int().min(0).optional(),
      storageLocation: z.string().max(255).optional().nullable(),
      supplierName: z.string().max(255).optional().nullable(),
      supplierPartNumber: z.string().max(100).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireInventoryItem(input.id, ctx.user.companyId!);
      const { id, unitCost, unitPrice, ...rest } = input;
      await db.updateInventoryItem(id, {
        ...rest,
        ...(unitCost !== undefined ? { unitCost: String(unitCost) as any } : {}),
        ...(unitPrice !== undefined ? { unitPrice: String(unitPrice) as any } : {}),
      });
      void logActivity({
        ctx,
        entityType: "inventory_item",
        entityId: id,
        eventType: "updated",
        title: "Inventory item updated",
      });
      return { success: true as const };
    }),

  deactivateInventoryItem: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireInventoryItem(input.id, ctx.user.companyId!);
      await db.updateInventoryItem(input.id, { isActive: false });
      void logActivity({
        ctx,
        entityType: "inventory_item",
        entityId: input.id,
        eventType: "deactivated",
        title: "Inventory item deactivated",
      });
      return { success: true as const };
    }),

  createFromPartsCatalog: officeProcedure
    .input(z.object({
      partsCatalogId: z.number().int().positive(),
      quantityOnHand: z.number().int().min(0).default(0),
      unitCost: z.number().nonnegative().default(0),
      reorderPoint: z.number().int().min(0).default(0),
      reorderQuantity: z.number().int().min(0).default(0),
      storageLocation: z.string().max(255).optional(),
      supplierName: z.string().max(255).optional(),
      supplierPartNumber: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;

      // Verify the catalog item belongs to this company
      const catalogItems = await db.getPartsCatalogByCompany(companyId, true);
      const catalogItem = catalogItems.find((c) => c.id === input.partsCatalogId);
      if (!catalogItem) throw new TRPCError({ code: "NOT_FOUND", message: "Parts catalog item not found" });

      const id = await db.createInventoryItem({
        companyId,
        partsCatalogId: input.partsCatalogId,
        sku: catalogItem.sku ?? null,
        category: catalogItem.category,
        name: catalogItem.productName,
        description: catalogItem.description ?? null,
        unitCost: String(input.unitCost) as any,
        unitPrice: String(catalogItem.unitPrice) as any,
        quantityOnHand: input.quantityOnHand,
        quantityReserved: 0,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
        storageLocation: input.storageLocation ?? null,
        supplierName: input.supplierName ?? null,
        supplierPartNumber: input.supplierPartNumber ?? null,
        isActive: true,
      });

      if (input.quantityOnHand > 0) {
        await recordTransaction(
          companyId, id, "initial_count", input.quantityOnHand, ctx.user.id,
          `Initial count from Parts Catalog: ${catalogItem.productName}`,
          "parts_catalog",
          input.partsCatalogId,
        );
      }

      void logActivity({
        ctx,
        entityType: "inventory_item",
        entityId: id,
        eventType: "created",
        title: `Inventory item created from catalog: ${catalogItem.productName}`,
        relatedEntityType: "parts_catalog",
        relatedEntityId: input.partsCatalogId,
      });

      return { id };
    }),

  adjustStock: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      adjustment: z.number().int(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const item = await requireInventoryItem(input.id, companyId);

      const newQty = item.quantityOnHand + input.adjustment;
      if (newQty < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Adjustment would result in negative stock",
        });
      }

      await db.updateInventoryItem(input.id, { quantityOnHand: newQty });
      await recordTransaction(
        companyId, input.id, "adjustment", input.adjustment, ctx.user.id,
        input.notes,
      );

      // Fire low-stock notification if needed
      if (newQty <= item.reorderPoint && item.reorderPoint > 0) {
        const dedupeKey = `low_stock_${input.id}_${new Date().toISOString().slice(0, 10)}`;
        const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!exists) {
          void db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "inventory_item",
            entityId: input.id,
            type: "inventory_low_stock",
            severity: "warning",
            title: "Low stock",
            message: `${item.name} is at or below reorder point (${newQty} on hand, reorder at ${item.reorderPoint})`,
            href: `/admin/inventory`,
            dedupeKey,
          });
        }
      }

      void logActivity({
        ctx,
        entityType: "inventory_item",
        entityId: input.id,
        eventType: "stock_adjusted",
        title: `Stock adjusted: ${input.adjustment > 0 ? "+" : ""}${input.adjustment} (now ${newQty})`,
        metadata: { adjustment: input.adjustment, newQty, notes: input.notes },
      });

      return { success: true as const, newQty };
    }),

  getLowStockItems: officeProcedure.query(async ({ ctx }) => {
    return db.getLowStockInventoryItems(ctx.user.companyId!);
  }),

  getInventoryTransactions: officeProcedure
    .input(z.object({ inventoryItemId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireInventoryItem(input.inventoryItemId, ctx.user.companyId!);
      return db.getInventoryTransactionsByItem(input.inventoryItemId);
    }),

  // ── Parts Requests ────────────────────────────────────────────────────────

  listPartsRequests: officeProcedure
    .input(z.object({
      status: z.enum(PARTS_REQUEST_STATUSES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return db.getPartsRequestsByCompany(ctx.user.companyId!, input.status);
    }),

  getPartsRequest: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const req = await requirePartsRequest(input.id, ctx.user.companyId!);
      const items = await db.getPartsRequestItemsByRequest(input.id);
      return { request: req, items };
    }),

  createPartsRequest: technicianProcedure
    .input(z.object({
      priority: z.enum(PARTS_REQUEST_PRIORITIES).default("medium"),
      siteId: z.number().int().positive().optional(),
      jobId: z.number().int().positive().optional(),
      workOrderId: z.number().int().positive().optional(),
      approvedWorkId: z.number().int().positive().optional(),
      deficiencyId: z.number().int().positive().optional(),
      notes: z.string().max(2000).optional(),
      neededByDate: z.string().optional(),
      items: z.array(z.object({
        description: z.string().min(1).max(500),
        quantityRequested: z.number().int().positive().default(1),
        inventoryItemId: z.number().int().positive().optional(),
        partsCatalogId: z.number().int().positive().optional(),
        notes: z.string().max(500).optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;

      // Technicians can only create requests for jobs they're assigned to
      if (ctx.user.role === "technician" && input.jobId) {
        const assigned = await db.isUserAssignedToJob(input.jobId, ctx.user.id);
        const job = await db.getJobById(input.jobId);
        const isLead = job?.leadTechnicianId === ctx.user.id;
        if (!assigned && !isLead) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this job" });
        }
      }

      const requestNumber = await db.generateRequestNumber(companyId);
      const id = await db.createPartsRequest({
        companyId,
        requestNumber,
        status: "draft",
        priority: input.priority,
        requestedById: ctx.user.id,
        assignedToId: null,
        siteId: input.siteId ?? null,
        jobId: input.jobId ?? null,
        workOrderId: input.workOrderId ?? null,
        approvedWorkId: input.approvedWorkId ?? null,
        deficiencyId: input.deficiencyId ?? null,
        notes: input.notes ?? null,
        neededByDate: (input.neededByDate ?? null) as any,
      });

      for (const item of input.items) {
        await db.createPartsRequestItem({
          companyId,
          partsRequestId: id,
          inventoryItemId: item.inventoryItemId ?? null,
          partsCatalogId: item.partsCatalogId ?? null,
          description: item.description,
          quantityRequested: item.quantityRequested,
          quantityApproved: 0,
          quantityOrdered: 0,
          quantityReceived: 0,
          quantityUsed: 0,
          status: "requested",
          notes: item.notes ?? null,
        });
      }

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: id,
        eventType: "created",
        title: `Parts request created: ${requestNumber}`,
        metadata: { priority: input.priority, itemCount: input.items.length },
      });

      return { id, requestNumber };
    }),

  updatePartsRequest: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      priority: z.enum(PARTS_REQUEST_PRIORITIES).optional(),
      assignedToId: z.number().int().positive().optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      neededByDate: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requirePartsRequest(input.id, ctx.user.companyId!);
      const { id, ...fields } = input;
      await db.updatePartsRequest(id, fields as any);
      return { success: true as const };
    }),

  addRequestItem: officeProcedure
    .input(z.object({
      partsRequestId: z.number().int().positive(),
      description: z.string().min(1).max(500),
      quantityRequested: z.number().int().positive().default(1),
      inventoryItemId: z.number().int().positive().optional(),
      partsCatalogId: z.number().int().positive().optional(),
      unitCost: z.number().nonnegative().optional(),
      unitPrice: z.number().nonnegative().optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      await requirePartsRequest(input.partsRequestId, companyId);
      const id = await db.createPartsRequestItem({
        companyId,
        partsRequestId: input.partsRequestId,
        inventoryItemId: input.inventoryItemId ?? null,
        partsCatalogId: input.partsCatalogId ?? null,
        description: input.description,
        quantityRequested: input.quantityRequested,
        quantityApproved: 0,
        quantityOrdered: 0,
        quantityReceived: 0,
        quantityUsed: 0,
        unitCost: input.unitCost != null ? String(input.unitCost) as any : null,
        unitPrice: input.unitPrice != null ? String(input.unitPrice) as any : null,
        status: "requested",
        notes: input.notes ?? null,
      });
      return { id };
    }),

  updateRequestItem: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      description: z.string().min(1).max(500).optional(),
      quantityRequested: z.number().int().positive().optional(),
      quantityApproved: z.number().int().min(0).optional(),
      quantityOrdered: z.number().int().min(0).optional(),
      quantityReceived: z.number().int().min(0).optional(),
      quantityUsed: z.number().int().min(0).optional(),
      unitCost: z.number().nonnegative().optional().nullable(),
      unitPrice: z.number().nonnegative().optional().nullable(),
      status: z.enum(PARTS_REQUEST_ITEM_STATUSES).optional(),
      notes: z.string().max(500).optional().nullable(),
      inventoryItemId: z.number().int().positive().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await requirePartsRequestItem(input.id, ctx.user.companyId!);
      const { id, unitCost, unitPrice, ...rest } = input;
      await db.updatePartsRequestItem(id, {
        ...rest,
        ...(unitCost !== undefined ? { unitCost: unitCost != null ? String(unitCost) as any : null } : {}),
        ...(unitPrice !== undefined ? { unitPrice: unitPrice != null ? String(unitPrice) as any : null } : {}),
      });
      return { success: true as const };
    }),

  removeRequestItem: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requirePartsRequestItem(input.id, ctx.user.companyId!);
      await db.deletePartsRequestItem(input.id);
      return { success: true as const };
    }),

  submitPartsRequest: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await db.getPartsRequestById(input.id);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      if (req.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft requests can be submitted" });
      }

      const now = new Date();
      await db.updatePartsRequest(input.id, { status: "submitted", submittedAt: now });

      // Notify office
      const dedupeKey = `parts_request_submitted_${input.id}`;
      const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "parts_request",
          entityId: input.id,
          type: "parts_request_submitted",
          severity: req.priority === "urgent" ? "urgent" : "info",
          title: `Parts request ${req.requestNumber} submitted`,
          message: req.priority === "urgent" ? `Urgent parts request requires attention` : `New parts request submitted for review`,
          href: `/admin/parts-requests/${input.id}`,
          dedupeKey,
        });
      }

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "submitted",
        title: `Parts request submitted: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  approvePartsRequest: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemApprovals: z.array(z.object({
        itemId: z.number().int().positive(),
        quantityApproved: z.number().int().min(0),
        status: z.enum(["approved", "unavailable"]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await requirePartsRequest(input.id, companyId);

      if (!["submitted", "draft"].includes(req.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only submitted requests can be approved" });
      }

      for (const approval of input.itemApprovals) {
        await db.updatePartsRequestItem(approval.itemId, {
          quantityApproved: approval.quantityApproved,
          status: approval.status,
        });
      }

      await db.updatePartsRequest(input.id, {
        status: "approved",
        approvedAt: new Date(),
        approvedById: ctx.user.id,
      });

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "approved",
        title: `Parts request approved: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  markOrdered: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemOrders: z.array(z.object({
        itemId: z.number().int().positive(),
        quantityOrdered: z.number().int().positive(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await requirePartsRequest(input.id, companyId);

      if (input.itemOrders) {
        for (const order of input.itemOrders) {
          await db.updatePartsRequestItem(order.itemId, {
            quantityOrdered: order.quantityOrdered,
            status: "ordered",
          });

          // Record "ordered" transaction for linked inventory items
          const reqItem = await db.getPartsRequestItemById(order.itemId);
          if (reqItem?.inventoryItemId) {
            await recordTransaction(
              companyId, reqItem.inventoryItemId, "ordered", order.quantityOrdered,
              ctx.user.id, `Ordered for request ${req.requestNumber}`,
              "parts_request", input.id,
            );
          }
        }
      }

      await db.updatePartsRequest(input.id, { status: "ordered" });

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "ordered",
        title: `Parts ordered: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  markReceived: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemReceipts: z.array(z.object({
        itemId: z.number().int().positive(),
        quantityReceived: z.number().int().positive(),
        inventoryItemId: z.number().int().positive().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await requirePartsRequest(input.id, companyId);

      const items = await db.getPartsRequestItemsByRequest(input.id);

      for (const receipt of input.itemReceipts) {
        const reqItem = items.find((i) => i.id === receipt.itemId);
        if (!reqItem) continue;

        await db.updatePartsRequestItem(receipt.itemId, {
          quantityReceived: (reqItem.quantityReceived ?? 0) + receipt.quantityReceived,
          status: "received",
        });

        // Add to inventory
        const invItemId = receipt.inventoryItemId ?? reqItem.inventoryItemId;
        if (invItemId) {
          const invItem = await db.getInventoryItemById(invItemId);
          if (invItem && invItem.companyId === companyId) {
            const newQty = invItem.quantityOnHand + receipt.quantityReceived;
            await db.updateInventoryItem(invItemId, { quantityOnHand: newQty });
            await recordTransaction(
              companyId, invItemId, "received", receipt.quantityReceived,
              ctx.user.id, `Received for request ${req.requestNumber}`,
              "parts_request", input.id,
            );
          }
        }
      }

      // Determine whether all or partially received
      const updatedItems = await db.getPartsRequestItemsByRequest(input.id);
      const allReceived = updatedItems.every(
        (i) => i.status === "received" || i.status === "unavailable" || i.status === "cancelled",
      );
      await db.updatePartsRequest(input.id, {
        status: allReceived ? "received" : "partially_received",
      });

      // Notify technician parts ready
      const dedupeKey = `parts_received_${input.id}`;
      const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "parts_request",
          entityId: input.id,
          type: "parts_received",
          severity: "info",
          title: `Parts received: ${req.requestNumber}`,
          message: `Parts are ready for issuance`,
          href: `/admin/parts-requests/${input.id}`,
          dedupeKey,
        });
      }

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "received",
        title: `Parts received: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  issueParts: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await requirePartsRequest(input.id, companyId);
      const items = await db.getPartsRequestItemsByRequest(input.id);

      for (const item of items) {
        if (item.status !== "received" && item.status !== "approved") continue;
        if (item.inventoryItemId) {
          const invItem = await db.getInventoryItemById(item.inventoryItemId);
          if (invItem && invItem.companyId === companyId) {
            const qty = item.quantityReceived || item.quantityApproved || item.quantityRequested;
            const newOnHand = Math.max(0, invItem.quantityOnHand - qty);
            const newReserved = Math.max(0, invItem.quantityReserved - qty);
            await db.updateInventoryItem(item.inventoryItemId, {
              quantityOnHand: newOnHand,
              quantityReserved: newReserved,
            });
            await recordTransaction(
              companyId, item.inventoryItemId, "issued", -qty,
              ctx.user.id, `Issued for request ${req.requestNumber}`,
              "parts_request", input.id,
            );
          }
        }
        await db.updatePartsRequestItem(item.id, { status: "issued" });
      }

      await db.updatePartsRequest(input.id, { status: "issued" });

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "issued",
        title: `Parts issued: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  markPartsUsed: technicianProcedure
    .input(z.object({
      id: z.number().int().positive(),
      itemUsages: z.array(z.object({
        itemId: z.number().int().positive(),
        quantityUsed: z.number().int().positive(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await db.getPartsRequestById(input.id);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });

      // Techs can only mark usage if they created the request
      if (ctx.user.role === "technician" && req.requestedById !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only mark usage on your own requests" });
      }

      for (const usage of input.itemUsages) {
        const reqItem = await db.getPartsRequestItemById(usage.itemId);
        if (!reqItem || reqItem.companyId !== companyId) continue;
        await db.updatePartsRequestItem(usage.itemId, {
          quantityUsed: (reqItem.quantityUsed ?? 0) + usage.quantityUsed,
          status: "used",
        });

        if (reqItem.inventoryItemId) {
          await recordTransaction(
            companyId, reqItem.inventoryItemId, "used", -usage.quantityUsed,
            ctx.user.id, `Used for request ${req.requestNumber}`,
            "parts_request", input.id,
          );
        }
      }

      await db.updatePartsRequest(input.id, { status: "used" });

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "used",
        title: `Parts marked used: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  cancelPartsRequest: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const req = await requirePartsRequest(input.id, companyId);

      if (["used", "cancelled"].includes(req.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request cannot be cancelled in current state" });
      }

      // Release any reservations
      const items = await db.getPartsRequestItemsByRequest(input.id);
      for (const item of items) {
        if (item.inventoryItemId && item.quantityApproved > 0) {
          const invItem = await db.getInventoryItemById(item.inventoryItemId);
          if (invItem && invItem.companyId === companyId) {
            const newReserved = Math.max(0, invItem.quantityReserved - item.quantityApproved);
            await db.updateInventoryItem(item.inventoryItemId, { quantityReserved: newReserved });
            await recordTransaction(
              companyId, item.inventoryItemId, "unreserved", -item.quantityApproved,
              ctx.user.id, `Unreserved on cancel of request ${req.requestNumber}`,
              "parts_request", input.id,
            );
          }
        }
        await db.updatePartsRequestItem(item.id, { status: "cancelled" });
      }

      await db.updatePartsRequest(input.id, { status: "cancelled" });

      void logActivity({
        ctx,
        entityType: "parts_request",
        entityId: input.id,
        eventType: "cancelled",
        title: `Parts request cancelled: ${req.requestNumber}`,
      });

      return { success: true as const };
    }),

  // ── Linked lookups ────────────────────────────────────────────────────────

  getRequestsForWorkOrder: officeProcedure
    .input(z.object({ workOrderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const requests = await db.getPartsRequestsByWorkOrder(input.workOrderId);
      return requests.filter((r) => r.companyId === ctx.user.companyId!);
    }),

  getRequestsForApprovedWork: officeProcedure
    .input(z.object({ approvedWorkId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const requests = await db.getPartsRequestsByApprovedWork(input.approvedWorkId);
      return requests.filter((r) => r.companyId === ctx.user.companyId!);
    }),

  getRequestsForJob: technicianProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const requests = await db.getPartsRequestsByJob(input.jobId);
      return requests.filter((r) => r.companyId === ctx.user.companyId!);
    }),
});
