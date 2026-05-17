import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_PRIORITIES,
} from "../../drizzle/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireVendor(id: number, companyId: number) {
  const v = await db.getVendorById(id);
  if (!v) throw new TRPCError({ code: "NOT_FOUND" });
  if (v.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return v;
}

async function requirePO(id: number, companyId: number) {
  const po = await db.getPurchaseOrderById(id);
  if (!po) throw new TRPCError({ code: "NOT_FOUND" });
  if (po.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return po;
}

async function requirePOItem(id: number, companyId: number) {
  const item = await db.getPurchaseOrderItemById(id);
  if (!item) throw new TRPCError({ code: "NOT_FOUND" });
  if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return item;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const vendorPurchaseRouter = router({

  // ── Vendors ────────────────────────────────────────────────────────────────

  listVendors: officeProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return db.getVendorsByCompany(ctx.user.companyId!, input.includeInactive);
    }),

  getVendor: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return requireVendor(input.id, ctx.user.companyId!);
    }),

  createVendor: officeProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      contactName: z.string().max(255).optional(),
      email: z.string().email().max(255).optional(),
      phone: z.string().max(50).optional(),
      website: z.string().max(500).optional(),
      address: z.string().max(2000).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const id = await db.createVendor({
        companyId,
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        isActive: true,
      });
      void logActivity({
        ctx,
        entityType: "vendor",
        entityId: id,
        eventType: "created",
        title: `Vendor created: ${input.name}`,
      });
      return { id };
    }),

  updateVendor: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      contactName: z.string().max(255).optional().nullable(),
      email: z.string().email().max(255).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
      website: z.string().max(500).optional().nullable(),
      address: z.string().max(2000).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await requireVendor(id, ctx.user.companyId!);
      await db.updateVendor(id, fields);
      void logActivity({
        ctx, entityType: "vendor", entityId: id, eventType: "updated", title: "Vendor updated",
      });
      return { success: true as const };
    }),

  deactivateVendor: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireVendor(input.id, ctx.user.companyId!);
      await db.updateVendor(input.id, { isActive: false });
      void logActivity({
        ctx, entityType: "vendor", entityId: input.id, eventType: "deactivated", title: "Vendor deactivated",
      });
      return { success: true as const };
    }),

  reactivateVendor: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireVendor(input.id, ctx.user.companyId!);
      await db.updateVendor(input.id, { isActive: true });
      void logActivity({
        ctx, entityType: "vendor", entityId: input.id, eventType: "reactivated", title: "Vendor reactivated",
      });
      return { success: true as const };
    }),

  // ── Purchase Orders — Queries ──────────────────────────────────────────────

  listPurchaseOrders: officeProcedure
    .input(z.object({
      status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return db.getPurchaseOrdersByCompany(ctx.user.companyId!, input.status);
    }),

  getPurchaseOrder: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const po = await requirePO(input.id, ctx.user.companyId!);
      const [items, vendor] = await Promise.all([
        db.getPurchaseOrderItemsByPO(input.id),
        po.vendorId ? db.getVendorById(po.vendorId) : Promise.resolve(null),
      ]);
      return { po, items, vendor };
    }),

  getPOForPartsRequest: officeProcedure
    .input(z.object({ partsRequestId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const po = await db.getPurchaseOrderByPartsRequest(input.partsRequestId);
      if (!po || po.companyId !== ctx.user.companyId!) return null;
      return po;
    }),

  getOverview: officeProcedure.query(async ({ ctx }) => {
    const pos = await db.getPurchaseOrdersByCompany(ctx.user.companyId!);
    const counts = PURCHASE_ORDER_STATUSES.reduce((acc, s) => {
      acc[s] = pos.filter((p) => p.status === s).length;
      return acc;
    }, {} as Record<string, number>);
    const urgentCount = pos.filter(
      (p) => p.priority === "urgent" && !["received", "cancelled"].includes(p.status),
    ).length;
    const today = new Date().toISOString().slice(0, 10);
    const overdueCount = pos.filter(
      (p) =>
        p.expectedDate &&
        String(p.expectedDate).slice(0, 10) < today &&
        !["received", "cancelled"].includes(p.status),
    ).length;
    return { counts, urgentCount, overdueCount };
  }),

  // ── Purchase Orders — Mutations ────────────────────────────────────────────

  createPurchaseOrder: officeProcedure
    .input(z.object({
      vendorId: z.number().int().positive().optional(),
      priority: z.enum(PURCHASE_ORDER_PRIORITIES).default("medium"),
      partsRequestId: z.number().int().positive().optional(),
      expectedDate: z.string().optional(),
      requestedById: z.number().int().positive().optional(),
      notes: z.string().max(2000).optional(),
      internalNotes: z.string().max(2000).optional(),
      shipping: z.number().nonnegative().default(0),
      tax: z.number().nonnegative().default(0),
      items: z.array(z.object({
        description: z.string().min(1).max(500),
        quantityOrdered: z.number().int().positive().default(1),
        unitCost: z.number().nonnegative().default(0),
        inventoryItemId: z.number().int().positive().optional(),
        partsCatalogId: z.number().int().positive().optional(),
        partsRequestItemId: z.number().int().positive().optional(),
        supplierPartNumber: z.string().max(100).optional(),
        notes: z.string().max(500).optional(),
      })).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const poNumber = await db.generatePONumber(companyId);

      const id = await db.createPurchaseOrder({
        companyId,
        poNumber,
        vendorId: input.vendorId ?? null,
        status: "draft",
        priority: input.priority,
        partsRequestId: input.partsRequestId ?? null,
        expectedDate: input.expectedDate ?? null,
        requestedById: input.requestedById ?? null,
        createdById: ctx.user.id,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        subtotal: "0" as any,
        tax: String(input.tax) as any,
        shipping: String(input.shipping) as any,
        total: "0" as any,
      });

      for (const item of input.items) {
        const lineTotal = item.quantityOrdered * item.unitCost;
        await db.createPurchaseOrderItem({
          companyId,
          purchaseOrderId: id,
          inventoryItemId: item.inventoryItemId ?? null,
          partsCatalogId: item.partsCatalogId ?? null,
          partsRequestItemId: item.partsRequestItemId ?? null,
          description: item.description,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: 0,
          unitCost: String(item.unitCost) as any,
          lineTotal: String(lineTotal) as any,
          supplierPartNumber: item.supplierPartNumber ?? null,
          notes: item.notes ?? null,
        });
      }

      await db.recalculatePOTotals(id, input.tax, input.shipping);

      if (input.priority === "urgent") {
        const dedupeKey = `po_urgent_${id}`;
        const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!exists) {
          void db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "purchase_order",
            entityId: id,
            type: "po_urgent_created",
            severity: "urgent",
            title: `Urgent PO created: ${poNumber}`,
            message: "Urgent purchase order requires attention",
            href: `/admin/purchase-orders/${id}`,
            dedupeKey,
          });
        }
      }

      void logActivity({
        ctx,
        entityType: "purchase_order",
        entityId: id,
        eventType: "created",
        title: `Purchase order created: ${poNumber}`,
        metadata: { priority: input.priority, itemCount: input.items.length },
      });

      return { id, poNumber };
    }),

  updatePurchaseOrder: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      vendorId: z.number().int().positive().optional().nullable(),
      priority: z.enum(PURCHASE_ORDER_PRIORITIES).optional(),
      expectedDate: z.string().optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      internalNotes: z.string().max(2000).optional().nullable(),
      tax: z.number().nonnegative().optional(),
      shipping: z.number().nonnegative().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, tax, shipping, ...fields } = input;
      const po = await requirePO(id, ctx.user.companyId!);
      await db.updatePurchaseOrder(id, {
        ...fields,
        ...(tax !== undefined ? { tax: String(tax) as any } : {}),
        ...(shipping !== undefined ? { shipping: String(shipping) as any } : {}),
      });
      if (tax !== undefined || shipping !== undefined) {
        await db.recalculatePOTotals(
          id,
          tax ?? Number(po.tax ?? 0),
          shipping ?? Number(po.shipping ?? 0),
        );
      }
      void logActivity({
        ctx, entityType: "purchase_order", entityId: id, eventType: "updated", title: "Purchase order updated",
      });
      return { success: true as const };
    }),

  addPurchaseOrderItem: officeProcedure
    .input(z.object({
      purchaseOrderId: z.number().int().positive(),
      description: z.string().min(1).max(500),
      quantityOrdered: z.number().int().positive().default(1),
      unitCost: z.number().nonnegative().default(0),
      inventoryItemId: z.number().int().positive().optional(),
      partsCatalogId: z.number().int().positive().optional(),
      partsRequestItemId: z.number().int().positive().optional(),
      supplierPartNumber: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const po = await requirePO(input.purchaseOrderId, companyId);
      const lineTotal = input.quantityOrdered * input.unitCost;
      const id = await db.createPurchaseOrderItem({
        companyId,
        purchaseOrderId: input.purchaseOrderId,
        inventoryItemId: input.inventoryItemId ?? null,
        partsCatalogId: input.partsCatalogId ?? null,
        partsRequestItemId: input.partsRequestItemId ?? null,
        description: input.description,
        quantityOrdered: input.quantityOrdered,
        quantityReceived: 0,
        unitCost: String(input.unitCost) as any,
        lineTotal: String(lineTotal) as any,
        supplierPartNumber: input.supplierPartNumber ?? null,
        notes: input.notes ?? null,
      });
      await db.recalculatePOTotals(input.purchaseOrderId, Number(po.tax ?? 0), Number(po.shipping ?? 0));
      return { id };
    }),

  updatePurchaseOrderItem: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      description: z.string().min(1).max(500).optional(),
      quantityOrdered: z.number().int().positive().optional(),
      unitCost: z.number().nonnegative().optional(),
      inventoryItemId: z.number().int().positive().optional().nullable(),
      supplierPartNumber: z.string().max(100).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, unitCost, ...rest } = input;
      const item = await requirePOItem(id, ctx.user.companyId!);
      const newUnitCost = unitCost ?? Number(item.unitCost ?? 0);
      const newQty = rest.quantityOrdered ?? item.quantityOrdered;
      const lineTotal = newQty * newUnitCost;
      await db.updatePurchaseOrderItem(id, {
        ...rest,
        unitCost: String(newUnitCost) as any,
        lineTotal: String(lineTotal) as any,
      });
      const po = await db.getPurchaseOrderById(item.purchaseOrderId);
      if (po) {
        await db.recalculatePOTotals(item.purchaseOrderId, Number(po.tax ?? 0), Number(po.shipping ?? 0));
      }
      return { success: true as const };
    }),

  removePurchaseOrderItem: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const item = await requirePOItem(input.id, ctx.user.companyId!);
      await db.deletePurchaseOrderItem(input.id);
      const po = await db.getPurchaseOrderById(item.purchaseOrderId);
      if (po) {
        await db.recalculatePOTotals(item.purchaseOrderId, Number(po.tax ?? 0), Number(po.shipping ?? 0));
      }
      return { success: true as const };
    }),

  // ── PO Status Transitions ──────────────────────────────────────────────────

  markReadyToOrder: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const po = await requirePO(input.id, companyId);
      if (!["draft"].includes(po.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PO must be in draft status" });
      }
      await db.updatePurchaseOrder(input.id, { status: "ready_to_order" });

      const dedupeKey = `po_ready_${input.id}`;
      const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId,
          roleTarget: "office",
          entityType: "purchase_order",
          entityId: input.id,
          type: "po_ready_to_order",
          severity: "info",
          title: `PO ${po.poNumber} ready to order`,
          message: "Purchase order is ready to be placed with vendor",
          href: `/admin/purchase-orders/${input.id}`,
          dedupeKey,
        });
      }

      void logActivity({
        ctx, entityType: "purchase_order", entityId: input.id,
        eventType: "ready_to_order", title: `PO marked ready to order: ${po.poNumber}`,
      });
      return { success: true as const };
    }),

  markOrdered: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      orderDate: z.string().optional(),
      expectedDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const po = await requirePO(input.id, ctx.user.companyId!);
      if (!["draft", "ready_to_order"].includes(po.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PO must be draft or ready_to_order" });
      }
      const now = input.orderDate ?? new Date().toISOString().slice(0, 10);
      await db.updatePurchaseOrder(input.id, {
        status: "ordered",
        orderDate: now as any,
        ...(input.expectedDate ? { expectedDate: input.expectedDate as any } : {}),
      });
      void logActivity({
        ctx, entityType: "purchase_order", entityId: input.id,
        eventType: "ordered", title: `PO marked ordered: ${po.poNumber}`,
        metadata: { orderDate: now, expectedDate: input.expectedDate },
      });
      return { success: true as const };
    }),

  receiveItems: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      receipts: z.array(z.object({
        itemId: z.number().int().positive(),
        quantityReceived: z.number().int().positive(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const po = await requirePO(input.id, companyId);

      if (!["ordered", "partially_received"].includes(po.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "PO must be ordered or partially received to receive items",
        });
      }

      const allItems = await db.getPurchaseOrderItemsByPO(input.id);

      for (const receipt of input.receipts) {
        const poItem = allItems.find((i) => i.id === receipt.itemId);
        if (!poItem || poItem.companyId !== companyId) continue;

        const newReceived = (poItem.quantityReceived ?? 0) + receipt.quantityReceived;
        await db.updatePurchaseOrderItem(receipt.itemId, {
          quantityReceived: newReceived,
        });

        // Update inventory
        if (poItem.inventoryItemId) {
          const invItem = await db.getInventoryItemById(poItem.inventoryItemId);
          if (invItem && invItem.companyId === companyId) {
            const newQty = invItem.quantityOnHand + receipt.quantityReceived;
            await db.updateInventoryItem(poItem.inventoryItemId, { quantityOnHand: newQty });
            await db.createInventoryTransaction({
              companyId,
              inventoryItemId: poItem.inventoryItemId,
              transactionType: "received",
              quantity: receipt.quantityReceived,
              performedById: ctx.user.id,
              notes: `Received from PO ${po.poNumber}`,
              sourceType: "purchase_order",
              sourceId: input.id,
            });
          }
        }

        // Update linked parts request item
        if (poItem.partsRequestItemId) {
          const prItem = await db.getPartsRequestItemById(poItem.partsRequestItemId);
          if (prItem && prItem.companyId === companyId) {
            const prNewReceived = (prItem.quantityReceived ?? 0) + receipt.quantityReceived;
            await db.updatePartsRequestItem(poItem.partsRequestItemId, {
              quantityReceived: prNewReceived,
              status: "received",
            });
          }
        }

        void logActivity({
          ctx,
          entityType: "purchase_order",
          entityId: input.id,
          eventType: "item_received",
          title: `Received ${receipt.quantityReceived}× ${poItem.description} on PO ${po.poNumber}`,
          metadata: { itemId: receipt.itemId, qty: receipt.quantityReceived },
        });
      }

      // Recalculate status
      const updatedItems = await db.getPurchaseOrderItemsByPO(input.id);
      const allReceived = updatedItems.every(
        (i) => (i.quantityReceived ?? 0) >= i.quantityOrdered,
      );
      const anyReceived = updatedItems.some((i) => (i.quantityReceived ?? 0) > 0);

      const newStatus = allReceived
        ? "received"
        : anyReceived
          ? "partially_received"
          : po.status;

      await db.updatePurchaseOrder(input.id, {
        status: newStatus,
        ...(allReceived ? { receivedDate: new Date().toISOString().slice(0, 10) as any } : {}),
      });

      if (anyReceived) {
        const dedupeKey = `po_received_${input.id}_${new Date().toISOString().slice(0, 10)}`;
        const exists = await db.hasUndismissedNotification(companyId, dedupeKey);
        if (!exists) {
          void db.createNotification({
            companyId,
            roleTarget: "office",
            entityType: "purchase_order",
            entityId: input.id,
            type: "po_items_received",
            severity: "info",
            title: `Parts received on PO ${po.poNumber}`,
            message: allReceived ? "All parts received" : "Partial receipt — some items still pending",
            href: `/admin/purchase-orders/${input.id}`,
            dedupeKey,
          });
        }
      }

      return { success: true as const, newStatus };
    }),

  markFullyReceived: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const po = await requirePO(input.id, ctx.user.companyId!);
      if (["received", "cancelled"].includes(po.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PO is already complete or cancelled" });
      }
      await db.updatePurchaseOrder(input.id, {
        status: "received",
        receivedDate: new Date().toISOString().slice(0, 10) as any,
      });
      void logActivity({
        ctx, entityType: "purchase_order", entityId: input.id,
        eventType: "received", title: `PO fully received: ${po.poNumber}`,
      });
      return { success: true as const };
    }),

  cancelPurchaseOrder: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const po = await requirePO(input.id, ctx.user.companyId!);
      if (["received", "cancelled"].includes(po.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel this PO" });
      }
      await db.updatePurchaseOrder(input.id, { status: "cancelled" });
      void logActivity({
        ctx, entityType: "purchase_order", entityId: input.id,
        eventType: "cancelled", title: `PO cancelled: ${po.poNumber}`,
      });
      return { success: true as const };
    }),

  // ── Special creation helpers ───────────────────────────────────────────────

  createPOFromPartsRequest: officeProcedure
    .input(z.object({
      partsRequestId: z.number().int().positive(),
      vendorId: z.number().int().positive().optional(),
      priority: z.enum(PURCHASE_ORDER_PRIORITIES).default("medium"),
      expectedDate: z.string().optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;

      const pr = await db.getPartsRequestById(input.partsRequestId);
      if (!pr || pr.companyId !== companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Parts request not found" });
      }

      // Prevent duplicate PO for the same parts request
      const existing = await db.getPurchaseOrderByPartsRequest(input.partsRequestId);
      if (existing && !["cancelled"].includes(existing.status)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A purchase order (${existing.poNumber}) already exists for this parts request`,
        });
      }

      const prItems = await db.getPartsRequestItemsByRequest(input.partsRequestId);
      const eligibleItems = prItems.filter((i) =>
        ["requested", "approved", "ordered"].includes(i.status),
      );

      if (eligibleItems.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No eligible items on this parts request",
        });
      }

      const poNumber = await db.generatePONumber(companyId);
      const poId = await db.createPurchaseOrder({
        companyId,
        poNumber,
        vendorId: input.vendorId ?? null,
        status: "draft",
        priority: input.priority,
        partsRequestId: input.partsRequestId,
        expectedDate: input.expectedDate ?? null,
        requestedById: pr.requestedById,
        createdById: ctx.user.id,
        notes: input.notes ?? null,
        internalNotes: null,
        subtotal: "0" as any,
        tax: "0" as any,
        shipping: "0" as any,
        total: "0" as any,
      });

      for (const item of eligibleItems) {
        const unitCost = Number(item.unitCost ?? 0);
        const qty = item.quantityApproved || item.quantityRequested;
        const lineTotal = qty * unitCost;
        await db.createPurchaseOrderItem({
          companyId,
          purchaseOrderId: poId,
          inventoryItemId: item.inventoryItemId ?? null,
          partsCatalogId: item.partsCatalogId ?? null,
          partsRequestItemId: item.id,
          description: item.description,
          quantityOrdered: qty,
          quantityReceived: 0,
          unitCost: String(unitCost) as any,
          lineTotal: String(lineTotal) as any,
          supplierPartNumber: null,
          notes: null,
        });
      }

      await db.recalculatePOTotals(poId, 0, 0);

      void logActivity({
        ctx,
        entityType: "purchase_order",
        entityId: poId,
        eventType: "created",
        title: `PO ${poNumber} created from parts request`,
        relatedEntityType: "parts_request",
        relatedEntityId: input.partsRequestId,
        metadata: { partsRequestId: input.partsRequestId, itemCount: eligibleItems.length },
      });

      return { id: poId, poNumber };
    }),

  createRestockPO: officeProcedure
    .input(z.object({
      inventoryItemIds: z.array(z.number().int().positive()).min(1),
      vendorId: z.number().int().positive().optional(),
      priority: z.enum(PURCHASE_ORDER_PRIORITIES).default("medium"),
      expectedDate: z.string().optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const poNumber = await db.generatePONumber(companyId);

      const poId = await db.createPurchaseOrder({
        companyId,
        poNumber,
        vendorId: input.vendorId ?? null,
        status: "draft",
        priority: input.priority,
        partsRequestId: null,
        expectedDate: input.expectedDate ?? null,
        requestedById: null,
        createdById: ctx.user.id,
        notes: input.notes ?? `Restock PO for ${input.inventoryItemIds.length} item(s)`,
        internalNotes: null,
        subtotal: "0" as any,
        tax: "0" as any,
        shipping: "0" as any,
        total: "0" as any,
      });

      for (const invItemId of input.inventoryItemIds) {
        const item = await db.getInventoryItemById(invItemId);
        if (!item || item.companyId !== companyId) continue;
        const qty = item.reorderQuantity > 0 ? item.reorderQuantity : 1;
        const unitCost = Number(item.unitCost ?? 0);
        const lineTotal = qty * unitCost;
        await db.createPurchaseOrderItem({
          companyId,
          purchaseOrderId: poId,
          inventoryItemId: invItemId,
          partsCatalogId: item.partsCatalogId ?? null,
          partsRequestItemId: null,
          description: item.name,
          quantityOrdered: qty,
          quantityReceived: 0,
          unitCost: String(unitCost) as any,
          lineTotal: String(lineTotal) as any,
          supplierPartNumber: item.supplierPartNumber ?? null,
          notes: `Reorder: was at ${item.quantityOnHand}, reorder point ${item.reorderPoint}`,
        });
      }

      await db.recalculatePOTotals(poId, 0, 0);

      void logActivity({
        ctx,
        entityType: "purchase_order",
        entityId: poId,
        eventType: "created",
        title: `Restock PO ${poNumber} created`,
        metadata: { inventoryItemIds: input.inventoryItemIds },
      });

      return { id: poId, poNumber };
    }),
});
