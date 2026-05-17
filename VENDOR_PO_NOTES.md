# Vendor Management + Purchase Orders v1 — Implementation Notes

## Overview

Full Vendor Management and Purchase Orders feature built on top of the existing Inventory/Parts Requests v1 system. Admins and office staff can manage vendor contacts, create purchase orders (manually or from parts requests / inventory restock), receive items, and track fulfillment.

**Safety constraints enforced:**
- No automatic order sending to vendors
- No payment processing
- No Sage/accounting integration
- No permanent deletion of vendors or POs
- No automatic low-stock ordering
- Not exposed to customers
- Technicians cannot create or manage POs

---

## Routes & Navigation

| Path | Component | Access |
|------|-----------|--------|
| `/admin/vendors` | `Vendors.tsx` | Admin/Office |
| `/admin/purchase-orders` | `PurchaseOrders.tsx` | Admin/Office |
| `/admin/purchase-orders/:id` | `PurchaseOrderDetail.tsx` | Admin/Office |

Both pages are in the "More" dropdown in `AdminLayout.tsx`.

---

## Database Changes

### Migration: `drizzle/migrations/0056_vendor_purchase_orders.sql`

Three new tables:

### `vendors`
Stores vendor/supplier contact information per company.

| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AI | |
| companyId | INT NOT NULL | Multi-tenant scoping |
| name | VARCHAR(255) NOT NULL | Company name |
| contactName | VARCHAR(255) | Sales rep |
| email | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| website | VARCHAR(500) | |
| address | TEXT | |
| notes | TEXT | Lead times, account numbers, etc. |
| isActive | BOOLEAN DEFAULT true | Soft-delete via deactivate |
| createdAt / updatedAt | TIMESTAMP | |

Index: `vendors_companyId_idx`

### `purchase_orders`
One PO per order, links to vendor and optionally a parts request.

| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AI | |
| companyId | INT NOT NULL | |
| poNumber | VARCHAR(50) NOT NULL | `PO-{YEAR}-{NNNN}` |
| vendorId | INT nullable | FK → vendors |
| status | ENUM | draft, ready_to_order, ordered, partially_received, received, cancelled |
| priority | ENUM | low, medium, high, urgent |
| partsRequestId | INT nullable | FK → parts_requests |
| orderDate | DATE nullable | Set when marking ordered |
| expectedDate | DATE nullable | Expected delivery |
| receivedDate | DATE nullable | Set when fully received |
| requestedById | INT nullable | User who requested |
| createdById | INT NOT NULL | User who created the PO |
| notes | TEXT | Visible notes |
| internalNotes | TEXT | Admin-only notes |
| subtotal / tax / shipping / total | DECIMAL(10,2) | Calculated totals |
| createdAt / updatedAt | TIMESTAMP | |

Indexes: `companyId`, `(companyId, status)`, `vendorId`, `partsRequestId`

### `purchase_order_items`
Individual line items on a PO.

| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AI | |
| companyId / purchaseOrderId | INT NOT NULL | |
| inventoryItemId | INT nullable | Links to inventory |
| partsCatalogId | INT nullable | Links to parts catalog |
| partsRequestItemId | INT nullable | Links to parts request item |
| description | VARCHAR(500) NOT NULL | |
| quantityOrdered | INT DEFAULT 1 | |
| quantityReceived | INT DEFAULT 0 | Updated during receiving |
| unitCost | DECIMAL(10,2) DEFAULT 0 | |
| lineTotal | DECIMAL(10,2) DEFAULT 0 | quantityOrdered × unitCost |
| supplierPartNumber | VARCHAR(100) nullable | |
| notes | TEXT | |
| createdAt / updatedAt | TIMESTAMP | |

Indexes: `purchaseOrderId`, `companyId`

---

## Backend

### Schema additions (`drizzle/schema.ts`)
- `vendors` table + `Vendor` / `InsertVendor` types
- `purchaseOrders` table + `PurchaseOrder` / `InsertPurchaseOrder` types
- `purchaseOrderItems` table + `PurchaseOrderItem` / `InsertPurchaseOrderItem` types
- `PURCHASE_ORDER_STATUSES` and `PURCHASE_ORDER_PRIORITIES` const arrays

### DB helpers (`server/db.ts`)

New functions added after `deletePartsRequestItem`:

| Function | Description |
|----------|-------------|
| `getVendorsByCompany(companyId, includeInactive?)` | List vendors ordered by name |
| `getVendorById(id)` | Single vendor lookup |
| `createVendor(data)` | Returns new `id` |
| `updateVendor(id, data)` | Partial update |
| `generatePONumber(companyId)` | `PO-{YEAR}-{NNNN}` via COUNT + LIKE filter |
| `getPurchaseOrdersByCompany(companyId, status?)` | Ordered by createdAt DESC |
| `getPurchaseOrderById(id)` | Single PO lookup |
| `getPurchaseOrderByPartsRequest(partsRequestId)` | Returns first non-cancelled PO |
| `createPurchaseOrder(data)` | Returns new `id` |
| `updatePurchaseOrder(id, data)` | Partial update |
| `getPurchaseOrderItemsByPO(purchaseOrderId)` | Ordered by createdAt ASC |
| `getPurchaseOrderItemById(id)` | Single item lookup |
| `createPurchaseOrderItem(data)` | Returns new `id` |
| `updatePurchaseOrderItem(id, data)` | Partial update |
| `deletePurchaseOrderItem(id)` | Hard delete (items only, not POs) |
| `recalculatePOTotals(poId, tax, shipping)` | Sums lineTotal → subtotal, adds tax+shipping → total |

### Router (`server/routers/vendorPurchaseRouter.ts`)

All procedures use `officeProcedure` (admin + office roles only).

#### Vendor procedures
| Procedure | Action |
|-----------|--------|
| `listVendors` | Query with `includeInactive` option |
| `getVendor` | Single by id |
| `createVendor` | Validates company membership, logs activity |
| `updateVendor` | Partial update, logs activity |
| `deactivateVendor` | Sets `isActive = false`, logs activity |
| `reactivateVendor` | Sets `isActive = true`, logs activity |

#### PO query procedures
| Procedure | Action |
|-----------|--------|
| `listPurchaseOrders` | Filter by status, scoped to company |
| `getPurchaseOrder` | Returns `{po, items, vendor}` |
| `getPOForPartsRequest` | Returns PO linked to a parts request |
| `getOverview` | Counts per status + urgentCount + overdueCount |

#### PO mutation procedures
| Procedure | Action |
|-----------|--------|
| `createPurchaseOrder` | Generates PO number, logs activity |
| `updatePurchaseOrder` | Updates fields + recalculates totals, logs activity |
| `addPurchaseOrderItem` | Computes lineTotal, recalculates PO totals, logs activity |
| `updatePurchaseOrderItem` | Recomputes lineTotal, recalculates PO totals, logs activity |
| `removePurchaseOrderItem` | Deletes item, recalculates totals, logs activity |

#### PO transition procedures
| Procedure | Action |
|-----------|--------|
| `markReadyToOrder` | draft → ready_to_order, fires deduped notification |
| `markOrdered` | ready_to_order → ordered, sets orderDate |
| `receiveItems` | Updates quantityReceived per item, updates inventory quantityOnHand, writes inventory_transactions rows, updates linked partsRequestItems, determines fully/partially received |
| `markFullyReceived` | Forces received status + sets receivedDate |
| `cancelPurchaseOrder` | Any non-received PO → cancelled |

#### Helper/smart procedures
| Procedure | Action |
|-----------|--------|
| `createPOFromPartsRequest` | Creates PO seeded from parts request items (status requested/approved/ordered); prevents duplicate (throws CONFLICT if active PO exists) |
| `createRestockPO` | Creates PO seeded from inventory items using their reorderQuantity and unitCost |

---

## Frontend

### `/admin/vendors` (`Vendors.tsx`)
- `VendorDialog`: create/edit form (name, contactName, email, phone, website, address, notes)
- `VendorRow`: expandable card with website link, address, notes; Edit + Deactivate/Reactivate buttons
- Main: Add Vendor button, search input, "Show inactive" toggle

### `/admin/purchase-orders` (`PurchaseOrders.tsx`)
- `OverviewCards`: Draft, Ready to Order, Ordered, Partially Received, Urgent, Overdue counts
- `CreatePODialog`: vendor selector, priority, expected date, notes
- `PORow`: PO#, status/priority badges, vendor, expected date (red if overdue), total; links to detail
- Filters: status, vendor, priority, overdue-only checkbox, text search

### `/admin/purchase-orders/:id` (`PurchaseOrderDetail.tsx`)
- `ItemsTable`: columns — description, qty ordered, qty received, unit cost, line total, delete (when editable)
- `AddItemDialog`: inventory item selector (auto-fills description/cost), description, qty, unit cost, supplier P/N
- `ReceiveItemsDialog`: per-item qty inputs for items not yet fully received
- `EditPODialog`: vendor, priority, expected date, notes, internal notes, tax, shipping
- Status action buttons: Edit, Ready to Order, Mark Ordered, Receive Items, Mark Fully Received, Cancel
- Totals footer: subtotal + tax + shipping = total
- Sidebar: Vendor card, Details card (dates, created by), Linked Parts Request card, Notes card

---

## Integrations

### `PartsRequestDetail.tsx`
- "Create PO" button shown when status is approved/ordered/partially_received and no linked PO exists
- Linked PO badge/button shows PO number and links to PO detail when PO exists
- "Create PO" dialog: vendor selector, priority, expected date

### `Inventory.tsx`
- "Restock PO" button shown on expanded low-stock items (quantityOnHand ≤ reorderPoint)
- Calls `createRestockPO` with the single item's id
- On success, navigates directly to the new PO detail page

---

## PO Number Format

`PO-{YEAR}-{NNNN}` where NNNN is zero-padded to 4 digits, counting all POs for the company in the current year. Example: `PO-2026-0001`.

---

## PO Status Machine

```
draft → ready_to_order → ordered → partially_received ─┐
                                 ↘                       │
                                   received  ←───────────┘
Any non-received → cancelled
```

---

## Receiving Behavior

When `receiveItems` is called:
1. Updates `purchase_order_items.quantityReceived` for each received item
2. If `inventoryItemId` set: increments `inventory_items.quantityOnHand` and writes an `inventory_transactions` row (type: `received`)
3. If `partsRequestItemId` set: updates `parts_request_items.quantityReceived` and sets status to `received`
4. Determines if PO is fully received (all items at quantityOrdered) or partially received
5. Fires a deduped notification to the company

---

## Activity Logging

All mutations call `logActivity` (fire-and-forget) with descriptive action strings, e.g.:
- `"Created vendor: Acme Supply Co."`
- `"Created purchase order PO-2026-0001"`
- `"PO PO-2026-0001: marked ready to order"`
- `"PO PO-2026-0001: received 3 item(s)"`

---

## Type Check Result

`pnpm check` passes with only pre-existing environment errors:
- `TS2688`: Cannot find type definition for 'node' / 'vite/client' (environment config, not our code)
- `TS5101`: `baseUrl` option deprecated (pre-existing tsconfig warning)

No new TypeScript errors introduced.
