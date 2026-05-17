# Service Agreements v1 — Delivery Notes

## Route / Nav Added

| Route | Component |
|---|---|
| `/admin/service-agreements` | `ServiceAgreements.tsx` (list) |
| `/admin/service-agreements/:id` | `ServiceAgreementDetail.tsx` (detail) |

Nav: "Agreements" added to `secondaryNavItems` in `AdminLayout.tsx` (under "More" dropdown), using `ScrollText` icon.

---

## Tables Added

### `service_agreements`
- id, companyId, customerOrgId
- agreementNumber (auto-generated: `SA-{YEAR}-{SEQ4}`)
- name, status, startDate, endDate, renewalDate
- billingCycle (monthly/quarterly/semi_annual/annual/per_service/custom)
- billingNotes, internalNotes
- includedServicesJson, excludedServicesJson (JSON arrays of service-type strings)
- documentUrl (link to signed PDF or cloud document)
- createdById, createdAt, updatedAt

### `agreement_sites`
- id, companyId, agreementId, siteId
- includedServicesJson (per-site service override)
- siteSpecificNotes
- createdAt, updatedAt
- UNIQUE KEY on (agreementId, siteId)

**Migration:** `drizzle/migrations/0053_service_agreements.sql`

---

## Statuses

| Status | Meaning |
|---|---|
| draft | Being prepared, not active |
| active | Live contract |
| expiring_soon | Auto-set when endDate ≤ 60 days from now |
| expired | Auto-set when endDate < today |
| cancelled | Terminated |

Auto-recalculation happens on each `list` query (fire-and-forget DB writes).

---

## Billing Cycles

monthly, quarterly, semi_annual, annual, per_service, custom

---

## Included Service Options

annual_fire_alarm, sprinkler, emergency_lighting, fire_extinguishers, backflow, monitoring, monthly_service, deficiency_followup

---

## Backend Methods Added (serviceAgreementRouter)

| Procedure | Description |
|---|---|
| `list` | All agreements with customer name, site count, auto-recalc status |
| `get` | Single agreement with enriched sites + available sites |
| `create` | Create with auto-generated number, validates customerOrg ownership |
| `update` | Update any field; blocks cancelled agreements |
| `cancel` | Sets status = cancelled |
| `addSite` | Link a site (validates same company); deduped by UNIQUE constraint |
| `removeSite` | Unlink a site |
| `updateAgreementSite` | Update per-site services/notes |
| `getExpiringSoon` | Agreements expiring within N days (default 90) |
| `getAgreementForSite` | Active agreement for a specific site |

DB functions added to `server/db.ts`:
`getServiceAgreementsByCompany`, `getServiceAgreementById`, `createServiceAgreement`, `updateServiceAgreement`, `getAgreementSitesByAgreement`, `getAgreementSiteById`, `createAgreementSite`, `updateAgreementSite`, `deleteAgreementSite`, `getExpiringSoonAgreements`, `getActiveAgreementForSite`

---

## Frontend Pages Added

### ServiceAgreements.tsx (list)
- Status tabs: All / Active / Expiring Soon / Expired / Cancelled with counts
- Search by name, number, or customer
- Agreement cards: number, name, status badge, customer, expiry, billing cycle, site count, included services
- "Expiring Soon" badge with warning icon
- "New Agreement" dialog: customer selector, name, status, billing cycle, dates, included services picker (pill buttons), billing/internal notes

### ServiceAgreementDetail.tsx (detail)
- Header: agreement name, number, status, customer
- Info grid: start/end/renewal dates, billing cycle
- Included/Excluded services as colored chips
- Covered Sites list with remove button; Add Site dialog (filtered to customer's sites, excludes already-added)
- Billing Notes + Internal Notes cards
- Document URL → "View Document" button
- Cancel Agreement confirmation dialog (irreversible)
- Activity Timeline (reuses `ActivityTimeline` component)

---

## Integration Points

- `customerOrg.list` used in create form to populate customer dropdown
- `site.listByCompany` used internally to enrich site names on detail page
- `logActivity` fires on: created, updated, cancelled, site_added, site_removed
- `createNotification` fires (deduped) on:
  - Agreement expiring in ≤ 30 days (severity: warning)
  - Agreement expiring in ≤ 60 days (severity: info)
  - Agreement expiring in ≤ 90 days (severity: info)
  - Agreement expired (severity: warning)
  - Active agreement has no covered sites (severity: warning)

---

## Limitations

- No auto-renewal logic
- No auto-invoicing from agreements
- No auto-scheduling from agreements
- No customer portal access
- No e-signature
- No invoice linkage (FK) — invoices do not yet reference agreementId
- No site detail page integration (site page not modified)
- Schedule/Scheduling Automation not modified
- The `getAgreementForSite` procedure is available for future site page integration

---

## Manual Test Checklist

- [ ] Navigate to /admin/service-agreements — page loads, shows empty state
- [ ] Click "New Agreement" — dialog opens with customer selector, required fields
- [ ] Create an agreement with status=active, dates, billing cycle, included services
- [ ] Agreement appears in list with correct status badge and customer name
- [ ] Click agreement → detail page shows all info correctly
- [ ] Click "Add Site" → sites belonging to the customer appear; select one → added
- [ ] Site appears in Covered Sites section with name
- [ ] Remove Site → site disappears
- [ ] Click "Edit" → form pre-populated; change name/dates/services → Save
- [ ] Status tabs filter correctly (Active, Expired etc.)
- [ ] Search by name / customer name
- [ ] Cancel Agreement → confirmation dialog → cancelled; edit/add-site buttons hidden
- [ ] Set endDate within 60 days → status auto-transitions to expiring_soon on next list load
- [ ] Set endDate in past → status auto-transitions to expired
- [ ] Check Notifications page — expiry notifications appear after agreement list loads
- [ ] Run pnpm check → only pre-existing TS infrastructure errors (no new errors)
