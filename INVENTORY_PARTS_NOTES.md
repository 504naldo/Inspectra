# Inventory / Parts Ordering v1 — Implementation Notes

## Files Changed

### New Files
| File | Description |
|------|-------------|
| `drizzle/migrations/0055_inventory_parts.sql` | SQL migration for all 4 new tables |
| `server/routers/inventoryRouter.ts` | Full tRPC router (~25 procedures) |
| `client/src/pages/admin/Inventory.tsx` | Admin inventory management page |
| `client/src/pages/admin/PartsRequests.tsx` | Admin parts requests overview page |
| `client/src/pages/admin/PartsRequestDetail.tsx` | Admin parts request detail + workflow page |
| `INVENTORY_PARTS_AUDIT.md` | Pre-build codebase audit |
| `INVENTORY_PARTS_NOTES.md` | This file |

### Modified Files
| File | Change |
|------|--------|
| `drizzle/schema.ts` | Added 4 new table schemas + type exports |
| `server/db.ts` | Added ~20 DB helper functions for inventory/parts |
| `server/routers.ts` | Registered `inventoryRouter` |
| `client/src/App.tsx` | Added routes for 3 new pages |
| `client/src/components/AdminLayout.tsx` | Added Inventory + Parts Requests nav items |
| `client/src/pages/admin/PartsCatalog.tsx` | Added "In Stock" badge + "Add to Inventory" button |
| `client/src/pages/admin/ApprovedWorkDetail.tsx` | Added Parts Requests section |
| `client/src/pages/technician/JobDetails.tsx` | Added Parts Request card with mobile form |

---

## Database Changes

### New Tables

**`inventory_items`**  
Stores stocked parts/materials for a company. Links optionally to `parts_catalog` via `partsCatalogId`.

| Key Column | Type | Notes |
|---|---|---|
| `companyId` | int | Tenant isolation |
| `partsCatalogId` | int (nullable) | Link to existing catalog |
| `sku`, `category`, `name` | varchar | Item identity |
| `unitCost`, `unitPrice` | decimal(10,2) | Cost vs. sell price |
| `quantityOnHand` | int | Physical stock count |
| `quantityReserved` | int | Qty committed to approved requests |
| `reorderPoint`, `reorderQuantity` | int | Low-stock thresholds |
| `storageLocation`, `supplierName`, `supplierPartNumber` | varchar | Physical + ordering metadata |
| `isActive` | boolean | Soft-delete |

**`parts_requests`**  
A request for parts — initiated by a tech or admin for a job, work order, or approved work item.

Status enum: `draft → submitted → approved → ordered → partially_received → received → issued → used` (or `cancelled`)  
Priority enum: `low | medium | high | urgent`

| Key Column | Notes |
|---|---|
| `requestNumber` | Auto-generated `PR-YYYY-NNNN` |
| `requestedById`, `assignedToId`, `approvedById` | User references |
| `jobId`, `workOrderId`, `approvedWorkId`, `deficiencyId`, `siteId`, `customerOrgId` | Polymorphic links |
| `neededByDate` | Target delivery date |
| `submittedAt`, `approvedAt` | Workflow timestamps |

**`parts_request_items`**  
Individual line items on a parts request.

Item status enum: `requested → approved → ordered → received → issued → used` (or `unavailable | cancelled`)

Tracks qty at each stage: `quantityRequested`, `quantityApproved`, `quantityOrdered`, `quantityReceived`, `quantityUsed`.

**`inventory_transactions`**  
Immutable audit log. Every stock change writes a row.

Transaction types: `initial_count | adjustment | reserved | unreserved | ordered | received | issued | used | returned | removed`

---

## Backend: `inventoryRouter` Procedures

### Inventory CRUD
| Procedure | Access | Description |
|---|---|---|
| `getOverview` | office | Dashboard counts + stock value |
| `listInventory` | office | All items, optional `includeInactive` |
| `getInventoryItem` | office | Single item + transaction history |
| `createInventoryItem` | office | Create new item, records `initial_count` if qty > 0 |
| `updateInventoryItem` | office | Partial update |
| `deactivateInventoryItem` | office | Soft-delete |
| `createFromPartsCatalog` | office | Seeds inventory from parts catalog item |
| `adjustStock` | office | +/- adjustment, validates no negative stock, fires low-stock notification |
| `getLowStockItems` | office | Items at/below reorder point |
| `getInventoryTransactions` | office | Transaction history for an item |

### Parts Request Workflow
| Procedure | Access | Description |
|---|---|---|
| `listPartsRequests` | office | All requests, optional status filter |
| `getPartsRequest` | office | Request + items |
| `createPartsRequest` | technician | Techs limited to assigned jobs |
| `updatePartsRequest` | office | Priority, assignee, notes, needed-by |
| `addRequestItem` | office | Add line item |
| `updateRequestItem` | office | Edit line item |
| `removeRequestItem` | office | Delete line item |
| `submitPartsRequest` | technician | Draft → Submitted; fires office notification |
| `approvePartsRequest` | office | Submitted → Approved; per-item qty approved |
| `markOrdered` | office | Approved → Ordered; records `ordered` transactions |
| `markReceived` | office | Updates qty on hand; auto partial vs. full receipt |
| `issueParts` | office | Deducts from on-hand + reserved; marks `issued` |
| `markPartsUsed` | technician | Marks items used; records `used` transactions |
| `cancelPartsRequest` | office | Releases reservations; records `unreserved` |

### Linked Lookups
| Procedure | Access | Description |
|---|---|---|
| `getRequestsForWorkOrder` | office | Requests linked to a work order |
| `getRequestsForApprovedWork` | office | Requests linked to approved work |
| `getRequestsForJob` | technician | Requests linked to a job |

---

## Frontend Routes / Nav

| Route | Component | Nav Location |
|---|---|---|
| `/admin/inventory` | `Inventory.tsx` | More → Inventory |
| `/admin/parts-requests` | `PartsRequests.tsx` | More → Parts Requests |
| `/admin/parts-requests/:id` | `PartsRequestDetail.tsx` | (linked from list) |

---

## Stock Transaction Behavior

Every change to `quantityOnHand` or `quantityReserved` writes a row to `inventory_transactions`:

| Action | Transaction Type | Effect |
|---|---|---|
| Item created with qty > 0 | `initial_count` | +qty to on-hand |
| Manual adjustment | `adjustment` | ±qty to on-hand |
| Parts ordered | `ordered` | Informational (no stock change yet) |
| Parts received | `received` | +qty to on-hand |
| Parts issued | `issued` | −qty from on-hand & reserved |
| Parts used | `used` | −qty from on-hand (informational) |
| Request cancelled | `unreserved` | −qty from reserved |

Negative stock is always prevented by validation on `adjustStock`.

---

## Parts Request Workflow

```
draft ──► submitted ──► approved ──► ordered ──► partially_received ──► received ──► issued ──► used
                                                                                    │
                                                                              (all received)
         └──────────────────────────────────────────────────────────────────────► cancelled
```

- Technicians can create and submit requests, mark their own as used
- Office staff approve, mark ordered/received, issue parts, cancel
- Admins have full access

---

## Integration Points

| Page | Integration |
|---|---|
| `PartsCatalog.tsx` | "In Stock" badge for items with linked inventory; "Add to Inventory" button |
| `ApprovedWorkDetail.tsx` | Parts Requests section showing linked requests with status; "New Request" link |
| Technician `JobDetails.tsx` | Parts Requests card: view existing requests + simple form to create new |

---

## Notifications

| Trigger | Type | Target | Dedupe Key |
|---|---|---|---|
| Stock at/below reorder point | `inventory_low_stock` | office | `low_stock_{itemId}_{date}` |
| Parts request submitted | `parts_request_submitted` | office | `parts_request_submitted_{id}` |
| Parts received and ready | `parts_received` | office | `parts_received_{id}` |

---

## Type-Check Result

`pnpm check` passes with only pre-existing environment config warnings (missing `@types/node` and `@types/vite` in the check tsconfig). No new TypeScript errors introduced.

---

## Safety Constraints Honored

- No purchase orders sent to vendors
- No external supplier integrations
- No accounting or invoicing integration
- No auto-deduction from quotes
- No auto-ordering on low stock
- Inventory transaction history never deleted
- No inventory data exposed to customers
- No payment or banking fields stored
