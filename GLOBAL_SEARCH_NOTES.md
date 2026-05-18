# Global Search + Command Palette v1 — Implementation Notes

## Files Added / Modified

| File | Change |
|------|--------|
| `server/routers/globalSearchRouter.ts` | New router with `search` procedure |
| `server/routers.ts` | Added `globalSearch: globalSearchRouter` |
| `client/src/components/GlobalSearch.tsx` | New component (search trigger + modal) |
| `client/src/components/AdminLayout.tsx` | Added `<GlobalSearch />` to header |

## Keyboard Shortcut

- **Cmd/Ctrl+K** opens / closes the search modal
- Registered via `document.addEventListener("keydown", …)` in a `useEffect`; cleaned up on unmount

## Trigger Button

- Desktop (≥640px): ghost button with Search icon, "Search" label, and ⌘K badge
- Mobile (<640px): icon-only ghost button

## Search Behavior

- Input is debounced **300 ms**; query must be **≥ 2 characters** before the server request fires
- Uses `trpc.globalSearch.search` (`officeProcedure`) — admin and office roles only
- `Command shouldFilter={false}` — cmdk's built-in client-side filter is disabled; all filtering is done server-side
- Results show up to **5 items per entity group**
- When query < 2 chars: **Quick access shortcuts** are shown instead of results

## Quick Access Actions (query is empty / <2 chars)

| Label | Route |
|-------|-------|
| Schedule | /admin/schedule |
| Jobs | /admin/jobs |
| Invoices | /admin/invoices |
| Reports | /admin/reports |
| Compliance | /admin/compliance |
| New Quote | /admin/quotes |
| New Repair Quote | /admin/repair-quotes/new |

## Entity Groups Searched

| Group | Table | Fields Searched | companyId scope |
|-------|-------|-----------------|-----------------|
| Customers | customer_orgs | name, contactName, contactEmail | direct |
| Sites | sites | name, address, city, fileNumber, contactName, buildingId | direct |
| Jobs | jobs | jobNumber, title, description, notes | direct |
| Work Orders | work_orders | workOrderNumber, title, officeNotes | direct |
| Approved Work | approved_work | approvedScope, approvedByName, officeNotes | direct |
| Invoices | invoices | invoiceNumber, billToName, billToEmail | direct |
| Service Agreements | service_agreements | agreementNumber, name, internalNotes | direct |
| Inventory | inventory_items | sku, name, description, supplierPartNumber | direct (isActive=true) |
| Devices | devices | label, barcode, serialNumber, deviceType, model, location | direct (isActive=true) |
| Reports | reports | reportNumber, title | via jobs innerJoin |
| Deficiencies | deficiencies | title, description, observedIssue, correctiveAction | via jobs innerJoin |

All 11 queries run in parallel via `Promise.all`.

## Navigation on Select

| Entity | Navigates to |
|--------|-------------|
| Customer | /admin/customers (list) |
| Site | /admin/sites (list) |
| Job | /admin/jobs/:id (detail) |
| Work Order | /admin/work-orders (list) |
| Approved Work | /admin/approved-work/:id (detail) |
| Invoice | /admin/invoices/:id (detail) |
| Service Agreement | /admin/service-agreements/:id (detail) |
| Inventory | /admin/inventory (list) |
| Device | /admin/devices (list) |
| Report | /admin/reports (list) |
| Deficiency | /admin/jobs/:jobId (parent job) |

Sites, Work Orders, Inventory, Devices, and Reports link to their list page because no individual detail page exists for those entity types.
Deficiencies link to their parent job page.

## Security

- `officeProcedure` — unauthenticated and technician/customer roles cannot access this endpoint
- All queries are scoped to `ctx.user.companyId` — no cross-company results possible
- No sensitive fields (passwords, SSN, banking) are included in any result set
- No destructive actions are possible from the command palette — navigation only

## No New Dependencies

Uses only already-installed packages:
- `cmdk` (already installed, powers existing `Command` components)
- `shadcn/ui` Dialog, Command, Button (already present)
- `lucide-react` icons (already present)

## Limitations

- Results are limited to 5 per group — no "show more" pagination in v1
- No full-text scoring — results are ordered by DB default (insert order)
- No search history or pinned items
- Not available to technician or customer roles (office/admin only)
- Inactive inventory items and archived devices are excluded

## Manual Test Checklist

- [ ] Press Cmd+K — search modal opens
- [ ] Press Cmd+K again — modal closes
- [ ] Empty input shows Quick access actions
- [ ] Selecting a Quick access item navigates and closes modal
- [ ] Typing 1 character — no network request fired (debounce + min 2 chars)
- [ ] Typing 2+ characters — request fires after 300ms debounce
- [ ] Results appear grouped by entity type
- [ ] Only groups with results are shown
- [ ] Selecting a job result navigates to /admin/jobs/:id
- [ ] Selecting a deficiency result navigates to /admin/jobs/:jobId
- [ ] Selecting an invoice navigates to /admin/invoices/:id
- [ ] Selecting a customer navigates to /admin/customers
- [ ] "No results found." shown when search returns empty
- [ ] Modal closes after selecting any result
- [ ] Search icon button visible in header on desktop
- [ ] Search icon-only button visible on mobile
- [ ] Technician role — cannot access (officeProcedure blocks it)
- [ ] Results are scoped to own company (no cross-company leakage)
