# Inventory / Parts Ordering — Pre-Build Audit

## Existing Parts Catalog Fields (`parts_catalog`)

| Field | Type | Notes |
|---|---|---|
| id, companyId | int | Multi-tenant |
| category | varchar(100) | High-level grouping (no enum) |
| productName | varchar(255) | Display name |
| sku | varchar(100) | Optional SKU |
| unitPrice | decimal(10,2) | **Selling price only** — no cost field |
| defaultLabourHours | decimal(5,2) | Labour hours estimate |
| taxableGst, taxablePst | tinyint | Tax flags |
| isActive | boolean | Soft-delete |
| description | text | Optional |
| sourceWorkbook, sourceSheet, sourceRow | varchar/int | Import provenance |

**Missing:** unitCost, storageLocation, quantityOnHand, quantityReserved, reorderPoint, supplierName, supplierPartNumber — these belong in inventory, not catalog.

---

## Existing Work Order Parts/Materials Fields (`work_orders`)

| Field | Type | Notes |
|---|---|---|
| materialsUsed | JSON `{description, qty, unitCost}[]` | Unstructured free-text, no parts_catalog link |
| lineItems | JSON `QuoteLineItem[]` | Quote line items snapshot |
| techNotes | text | Free-text tech notes |

**No structured inventory/parts reservation for work orders.**

---

## Existing Approved Work Parts Fields (`approved_work`)

| Field | Type | Notes |
|---|---|---|
| partsStatus | varchar(100) | Free-text status flag |
| status enum | includes `parts_required`, `awaiting_parts`, `parts_ordered`, `parts_received` | Status machine tracks parts phase |

**No structured parts request linking. partsStatus is a free-text note, not a foreign key.**

---

## Existing Repair Quote Line Item Parts Fields (`repair_quote_items`)

| Field | Type | Notes |
|---|---|---|
| partId | int | → parts_catalog.id (snapshot at quote time) |
| partDescription | varchar(255) | Snapshotted name |
| partUnitPrice | decimal | Snapshotted price |
| partTotal | decimal | Computed total |

**Quote items snapshot parts_catalog at quote time. No inventory reservation.**

---

## Existing Technician Parts/Usage Fields

| Location | Field | Notes |
|---|---|---|
| repairs.partsUsed | text | Free-text only |
| jobs.technicianNotes | text | General notes |
| work_orders.techNotes | text | General tech notes |
| work_orders.materialsUsed | JSON | Unstructured materials list |

**No technician-facing structured parts request or usage tracking.**

---

## Existing Inventory or Parts Request Tables

**None.** No `inventory_items`, `parts_requests`, `parts_request_items`, or `inventory_transactions` tables exist.

---

## Missing Pieces

1. **Inventory items table** — no stock tracking, no reorder points, no supplier info
2. **Parts requests table** — no structured internal parts ordering workflow
3. **Parts request items table** — no line-item-level parts request tracking
4. **Inventory transactions table** — no audit trail for stock changes
5. **Technician parts request UI** — no mobile form for techs to request parts for a job/WO
6. **Parts Catalog → Inventory link** — no FK from inventory to catalog
7. **Approved Work → Parts Request link** — partsStatus is free-text only
8. **Work Order → Parts Request link** — materialsUsed is unstructured JSON
9. **Company Settings inventory fields** — no allowNegativeInventory, no notification preferences

---

## What Can Be Reused

| Existing | Reused For |
|---|---|
| `partsCatalog.id` | FK from inventory items |
| `partsCatalog.sku`, `unitPrice` | Seed inventory item on creation |
| `approvedWork.id`, `workOrders.id` | Link parts requests to source work |
| `jobs.id` | Link tech parts requests to jobs |
| `logActivity` | Audit all stock/request changes |
| `createNotification` + `hasUndismissedNotification` | Low stock, request, received alerts |
| `officeProcedure` + `technicianProcedure` | Role-based access |
| `isUserAssignedToJob` | Verify technician can create request for job |
| `companySettings` | Extend with inventory preferences |

---

## Recommended Minimal Implementation

- 4 new tables: inventory_items, parts_requests, parts_request_items, inventory_transactions
- inventoryRouter with ~25 procedures
- Admin pages: Inventory, PartsRequests, PartsRequestDetail
- Technician: create parts request in JobDetails
- Light integration on ApprovedWorkDetail (show/create linked requests)
- Light integration on PartsCatalog (add to inventory button)
