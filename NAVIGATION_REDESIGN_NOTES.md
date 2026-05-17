# Admin Navigation Redesign Notes

## Old Navigation Structure

**Primary nav** (always visible in desktop header — 6 items):
- Dashboard → /admin
- Jobs → /admin/jobs
- Customers → /admin/customers
- Sites → /admin/sites
- Schedule → /admin/schedule
- Reports → /admin/reports

**"More" dropdown** (single crowded list of 22+ items):
- Agreements, Asset Lifecycle, Inventory, Parts Requests, Vendors, Purchase Orders,
  Timesheets, Payroll Hours, Payroll Review, Availability, Approved Work, Auto Schedule,
  AI Assistant, AI Knowledge, Report QA, Compliance, Documents, Quotes, Work Orders,
  Invoices, Customer Records, Devices, Data Quality, Imports, Users (adminOnly), Settings

**Not in any nav (accessible only via direct links):**
- /admin/notifications (bell icon only)
- /admin/parts-catalog
- /admin/job-assignments

## New Navigation Structure

**Desktop header:** 7 group dropdown buttons replacing primary + "More"

**Mobile drawer:** Same 7 groups, each collapsible — active group auto-expands on open

### Group 1: Operations
| Label | Route |
|-------|-------|
| Dashboard | /admin |
| Schedule | /admin/schedule |
| Jobs | /admin/jobs |
| Approved Work | /admin/approved-work |
| Work Orders | /admin/work-orders |
| Auto-Schedule | /admin/scheduling-automation |

### Group 2: Customers
| Label | Route |
|-------|-------|
| Customers | /admin/customers |
| Sites | /admin/sites |
| Customer Records | /admin/customer-records |
| Agreements | /admin/service-agreements |

### Group 3: Field Work
| Label | Route |
|-------|-------|
| Devices | /admin/devices |
| Asset Lifecycle | /admin/asset-lifecycle |
| Timesheets | /admin/timesheets |
| Payroll Hours | /admin/payroll-hours |
| Payroll Review | /admin/payroll-review |
| Availability | /admin/availability |

### Group 4: Reports
| Label | Route |
|-------|-------|
| Reports | /admin/reports |
| Report QA | /admin/report-qa |
| Compliance | /admin/compliance |
| Documents | /admin/documents |
| Data Quality | /admin/data-quality |

### Group 5: Financial
| Label | Route |
|-------|-------|
| Invoices | /admin/invoices |
| Quotes | /admin/quotes |
| Purchase Orders | /admin/purchase-orders |

### Group 6: Inventory
| Label | Route |
|-------|-------|
| Inventory | /admin/inventory |
| Parts Catalog | /admin/parts-catalog ← previously missing from nav |
| Parts Requests | /admin/parts-requests |
| Vendors | /admin/vendors |

### Group 7: Tools
| Label | Route | Access |
|-------|-------|--------|
| Users | /admin/users | adminOnly |
| Settings | /admin/settings | all |
| Imports | /admin/imports | all |
| Notifications | /admin/notifications | all ← previously bell-icon only |
| AI Assistant | /admin/ai-assistant | all |
| Knowledge Base | /admin/knowledge-base | all |

## Routes Preserved

All 30+ admin routes remain unchanged. No routes removed, renamed, or broken.

**Newly surfaced in nav (were accessible only via direct link before):**
- `/admin/parts-catalog` — now in Inventory group
- `/admin/notifications` — now in Tools group (bell icon remains in header too)

**Still not in nav (accessed from within other pages):**
- `/admin/job-assignments` — accessed from Jobs/Schedule context
- `/admin/sites/:siteId/fire-alarm` — child of Sites
- `/admin/sites/:siteId/files` — child of Sites
- `/admin/sites/:siteId/import` — child of Sites
- `/admin/sites/:siteId/work-site-info` — child of Sites
- `/admin/qa/:jobId` — child of Jobs
- `/admin/jobs/:jobId` — child of Jobs
- `/admin/invoices/:id` — child of Invoices
- `/admin/quotes/:id` — child of Quotes
- `/admin/repair-quotes/:id` — child of Quotes
- `/admin/approved-work/:id` — child of Approved Work
- `/admin/service-agreements/:id` — child of Agreements
- `/admin/purchase-orders/:id` — child of Purchase Orders
- `/admin/parts-requests/:id` — child of Parts Requests

## Role-Based Access Behavior

- `adminOnly: true` items are filtered from their group before rendering
- If filtering leaves a group empty, the entire group is hidden
- Currently only `Users → /admin/users` is `adminOnly: true`
- Office users see all 7 groups; admin users see all 7 groups with Users item visible
- Route-level ProtectedRoute access control is unchanged

## Desktop Nav Behavior

- 7 dropdown buttons render in the header nav area (replaced 6 primary + 1 "More")
- Each dropdown trigger highlights as `secondary` when the current route matches any item in the group
- Each dropdown shows a labeled header (group name + icon) above a separator, then items
- Active item within the open dropdown highlights with `bg-accent font-medium`
- All dropdowns use `DropdownMenu` from shadcn/ui (same component as before)
- `overflow-hidden` on the nav flex ensures no spill at narrower desktop widths (≥1024px)

## Mobile Nav Behavior

- Hamburger menu toggle preserved
- Drawer renders all 7 groups as collapsible sections (accordion-style)
- On open: the group containing the current route auto-expands; all others start collapsed
- Tapping a group header toggles its items list open/closed
- Active group header is highlighted with `bg-accent/40 text-foreground`
- Item indented with left border line for visual hierarchy
- `max-h-[80vh] overflow-y-auto` prevents drawer from overflowing the screen
- Tapping any item closes the drawer (same as before)

## "More" Section Changes

The "More" dropdown has been **completely removed** and replaced by 7 labeled group dropdowns. No items from the old "More" list were lost — all are now in appropriate groups.

## Remaining Risks

- At exactly 1024px (lg breakpoint), 7 group labels may be tight in the header. The `overflow-hidden` on the nav flex clips any overflow rather than wrapping. Users can resize above 1024px or use mobile menu if needed.
- "Repair Quotes" has no list-page route (`/admin/repair-quotes` list doesn't exist, only `/admin/repair-quotes/new` and `/admin/repair-quotes/:id`) so it is intentionally omitted from Financial group to avoid a broken link.
- Active state uses exact match (`location === item.href`) — sub-pages like `/admin/jobs/123` don't highlight the parent group. This preserves existing behavior.

## Manual Test Checklist

### Desktop (≥1024px)
- [ ] All 7 group dropdown buttons appear in header
- [ ] Clicking each group opens a dropdown with correct items
- [ ] Group button highlights as secondary when viewing a page in that group
- [ ] Active item within open dropdown shows bg-accent highlight
- [ ] No items are missing compared to old nav
- [ ] adminOnly "Users" item hidden for office-role users
- [ ] Bell notification badge still appears and links to /admin/notifications
- [ ] Brand logo still links to /admin

### Mobile (<1024px)
- [ ] Hamburger menu button appears
- [ ] Tapping hamburger opens drawer with 7 group headings
- [ ] Active group auto-expands when drawer opens
- [ ] Tapping a group header expands/collapses its items
- [ ] Items are indented under their group with left-border indicator
- [ ] Tapping any item navigates and closes the drawer
- [ ] Drawer is scrollable if content exceeds 80vh
- [ ] adminOnly Users item hidden for office-role users

### Role Access
- [ ] Admin sees Users in Tools group
- [ ] Office user does NOT see Users in Tools group
- [ ] All other items visible to both roles

### Route Integrity
- [ ] /admin → AdminDashboard
- [ ] /admin/schedule → AdminSchedule
- [ ] /admin/jobs → AdminJobs
- [ ] /admin/approved-work → ApprovedWork
- [ ] /admin/work-orders → AdminWorkOrders
- [ ] /admin/scheduling-automation → SchedulingAutomation
- [ ] /admin/customers → AdminCustomers
- [ ] /admin/sites → AdminSites
- [ ] /admin/customer-records → CustomerRecordsPage
- [ ] /admin/service-agreements → ServiceAgreements
- [ ] /admin/devices → AdminDevices
- [ ] /admin/asset-lifecycle → AssetLifecycle
- [ ] /admin/timesheets → Timesheets
- [ ] /admin/payroll-hours → AdminPayrollHours
- [ ] /admin/payroll-review → PayrollReview
- [ ] /admin/availability → AdminAvailability
- [ ] /admin/reports → AdminReports
- [ ] /admin/report-qa → ReportQA
- [ ] /admin/compliance → ComplianceDashboard
- [ ] /admin/documents → DocumentCenter
- [ ] /admin/data-quality → DataQuality
- [ ] /admin/invoices → AdminInvoices
- [ ] /admin/quotes → AdminQuotes
- [ ] /admin/purchase-orders → PurchaseOrders
- [ ] /admin/inventory → Inventory
- [ ] /admin/parts-catalog → PartsCatalog
- [ ] /admin/parts-requests → PartsRequests
- [ ] /admin/vendors → Vendors
- [ ] /admin/users → AdminUsers (admin only)
- [ ] /admin/settings → CompanySettings
- [ ] /admin/imports → ImportCenter
- [ ] /admin/notifications → Notifications
- [ ] /admin/ai-assistant → AIAssistant
- [ ] /admin/knowledge-base → KnowledgeBase
