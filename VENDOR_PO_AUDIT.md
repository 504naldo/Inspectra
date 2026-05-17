# Vendor Management + Purchase Orders — Pre-Build Audit

## Existing Inventory Tables

### `inventory_items`
- Tracks physical parts stock for a company
- Fields: sku, category, name, description, unitCost, unitPrice, quantityOnHand, quantityReserved, reorderPoint, reorderQuantity, storageLocation, supplierName (varchar 255), supplierPartNumber (varchar 100), isActive
- Note: `supplierName` is free-text varchar — no FK to a vendors table
- Note: no `preferredVendorId` field exists

### `parts_requests`
- Internal requests for parts (from techs or office)
- Status machine: draft → submitted → approved → ordered → partially_received → received → issued → used → cancelled
- Links to job, workOrder, approvedWork, deficiency, site, customerOrg
- No direct PO link field

### `parts_request_items`
- Line items on a parts request
- Tracks: quantityRequested, quantityApproved, quantityOrdered, quantityReceived, quantityUsed
- Optional links: inventoryItemId, partsCatalogId
- No link to purchase_order_items

### `inventory_transactions`
- Immutable audit trail of every stock change
- Types: initial_count, adjustment, reserved, unreserved, ordered, received, issued, used, returned, removed
- sourceType/sourceId allow linking back to the originating document

## Existing Supplier / Vendor Fields

- `inventory_items.supplierName` — free-text, no FK
- `inventory_items.supplierPartNumber` — free-text
- `parts_catalog.sku` — catalog sku, no vendor link
- No structured vendor table exists anywhere in the schema
- No purchase order table exists anywhere in the schema

## Existing Stock Receiving Behavior

In `inventoryRouter.markReceived`:
- Loops through parts request items
- For each item with an `inventoryItemId`: `quantityOnHand += quantityReceived`
- Writes `inventory_transactions` row with type "received"
- Updates PO status to "received" or "partially_received" based on item statuses

## Existing Activity / Notification Support

Activity logging via `logActivity()` (fire-and-forget):
- Writes to `activityEvents` table with companyId, actor info, entityType, entityId, eventType, title, metadata
- `ActivityTimeline` component reads these events per entity

Notifications via `createNotification()`:
- Targets "office" or "technician" role
- Has dedupeKey to prevent spam
- Types: inventory_low_stock, parts_request_submitted, parts_received

## Missing Purchase Order Workflow Pieces

1. No `vendors` table — supplier info is free-text on inventory items
2. No `purchase_orders` table — no way to track ordered batches
3. No `purchase_order_items` table — no line-item receiving flow
4. No PO number generation
5. No PO status workflow (draft → ordered → received)
6. No link between parts requests and purchase orders
7. No automatic inventory update on PO receipt (only parts request receipt updates inventory)
8. No vendor contact info storage
9. No overdue PO detection
10. No preferred vendor per inventory item

## Recommended Minimal Implementation

### New Tables
- `vendors` — company-scoped, soft-deleteable
- `purchase_orders` — status machine, links to vendor + optional parts request
- `purchase_order_items` — line items with qty ordered/received, links to inventory items and parts request items

### Backend Router
- `vendorPurchaseRouter` with office-only access
- Vendor CRUD + deactivate/reactivate
- PO CRUD + status transitions + receiving
- `createPOFromPartsRequest` — seeds PO from approved request items
- `createRestockPO` — seeds PO from low-stock inventory items

### Frontend Pages
- `/admin/vendors` — vendor directory
- `/admin/purchase-orders` — PO list with overview cards
- `/admin/purchase-orders/:id` — PO detail with receiving workflow

### Integrations
- PartsRequestDetail: "Create PO" button when request is approved/ordered
- Inventory: "Create Restock PO" button on low-stock items
- PO receipt: updates inventory_items.quantityOnHand + creates inventory_transactions row

### What Is Intentionally Excluded (v1)
- Live vendor ordering / EDI
- Payment processing
- Sage / accounting integration
- Auto-ordering on low stock
- Customer-facing features
- Technician PO creation
