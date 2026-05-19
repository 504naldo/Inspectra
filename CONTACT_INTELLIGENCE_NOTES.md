# Contact Intelligence v1 — Notes & Test Checklist

## What Was Built

### Database

**Table: `customer_contacts`**  
Migration: `drizzle/migrations/0063_customer_contacts.sql`  
Run manually on Railway after deploy — PlanetScale does not support ALTER TABLE in transactions.

Columns:
- `companyId` — always scoped to current company
- `customerOrgId` (nullable) — link to a customer organisation
- `siteId` (nullable) — link to a site
- `name`, `title`, `companyName`, `email`, `phone`, `mobile`
- `role` enum: `property_manager | strata_manager | building_manager | site_contact | billing_contact | quote_approver | report_recipient | emergency_contact | tenant_contact | other`
- `preferredMethod` enum: `email | phone | mobile | none | other`
- `isPrimary` — one primary per (company + role) scope
- Recipient flags: `receivesReports`, `receivesQuotes`, `receivesInvoices`, `receivesServiceUpdates`, `receivesComplianceNotices`, `isSiteAccessContact`
- `notes`, `isActive` (soft delete), `createdAt`, `updatedAt`

---

### Backend — `server/routers/contactRouter.ts`

Registered at `contact.*` in `server/routers.ts`.

| Procedure | Auth | Description |
|-----------|------|-------------|
| `listContacts` | adminOrOfficeProcedure | Filtered list — search, role, customer, site, recipient flags, activeOnly |
| `getContact` | adminOrOfficeProcedure | Single contact by id |
| `getContactsForCustomer` | adminOrOfficeProcedure | All contacts for a customerOrgId |
| `getContactsForSite` | adminOrOfficeProcedure | All contacts for a siteId |
| `getRecipientsForWorkflow` | adminOrOfficeProcedure | Recommended + fallback contacts for a workflow type |
| `createContact` | adminOrOfficeProcedure | Insert new contact |
| `updateContact` | adminOrOfficeProcedure | Partial update |
| `deactivateContact` | adminOrOfficeProcedure | Soft delete (isActive=0) |
| `reactivateContact` | adminOrOfficeProcedure | Restore soft-deleted contact |
| `setPrimaryContact` | adminOrOfficeProcedure | Clears isPrimary for scope, sets on target |
| `getSiteContactsForTechnician` | protectedProcedure | Field-safe: only site_contact, emergency_contact, isSiteAccessContact=1; no email returned |
| `getOverviewStats` | adminOrOfficeProcedure | Counts for overview cards |

**Workflow types for `getRecipientsForWorkflow`:**
`report | repair_quote | invoice | service_call | compliance_notice | general`

---

### Frontend Routes & Navigation

- **Route**: `/admin/contacts` → `ContactsPage` (admin + office roles only)
- **Nav**: Under "Customers" group in AdminLayout, between Sites and Customer Records

---

### Contacts Page (`/admin/contacts`)

Overview cards:
- Total Active contacts
- Report Recipients (receivesReports=1)
- Billing Contacts (billing_contact role)
- Quote Approvers (receivesQuotes=1)
- Site Access contacts (isSiteAccessContact=1)
- Missing Email (active contacts with no email)

Filter bar: text search, role filter, customer filter, recipient type filter, show inactive toggle.

Contact list features:
- Role badge (colour-coded by type)
- Recipient badges: Reports / Invoices / Quotes / Site Access / ⚠ No email
- Actions: Edit, Set Primary, Deactivate, Reactivate
- Add Contact button → ContactDialog

ContactDialog fields: name, title, company name, email, phone, mobile, role, notes, customer, site (filtered by selected customer), preferred method, all recipient checkboxes.

---

### Global Search Integration

Contacts appear in Global Search results (office/admin only). Searches: name, email, phone, mobile, companyName. Returns up to 5 results per search invocation.

---

### Report Send Dialog (`/admin/reports`)

`ReportRecipientSuggestion` component appears at the top of the Gmail send dialog when a job is selected. Queries `getRecipientsForWorkflow` with `workflowType: "report"`. Shows cyan suggestion pills — click to fill the recipient email field. Shows a warning if no contacts have email.

---

### Invoice Edit Dialog (`/admin/invoices/:id`)

`BillingContactSuggestion` component appears in the Bill To section of EditHeaderDialog. Queries `getRecipientsForWorkflow` with `workflowType: "invoice"`. Shows green suggestion pills — click to fill billToName (if blank) and billToEmail.

---

### Repair Quote Approval Dialog (`/admin/repair-quotes/:id`)

`QuoteApproverSuggestion` component appears at the top of the Record Approval dialog. Queries `getRecipientsForWorkflow` with `workflowType: "repair_quote"`. Shows violet suggestion pills — click to fill approvedByName (if blank) and approvedByEmail.

---

### Technician Job Details (`/tech/jobs/:id`)

**Site Contacts card** appears between "Work Site Info" and "Offline Readiness" sections. Uses `getSiteContactsForTechnician` — field-safe query that:
- Returns only contacts with role `site_contact`, `emergency_contact`, or `isSiteAccessContact=1`
- Does **not** return email addresses (billing/property manager contacts hidden)
- Shows name, role, phone, mobile, notes
- Phone/mobile render as `<a href="tel:...">` links for one-tap calling

---

## Safety Constraints (Enforced)

- No customer portal built
- No live emails sent
- No replacement of Customer Records or Sites
- No sensitive admin-only info cached to device
- No contact exposure to customers
- Technician view strips email and hides billing/financial contacts
- Contacts soft-deleted only (isActive=0), never hard-deleted
- No sensitive personal info beyond standard business contact data
- No automatic import — contacts must be manually created

---

## Limitations (v1)

- No bulk import for contacts (manual entry only)
- No deduplication / merge
- No contact-to-contact relationships (e.g. assistants)
- No history/audit log per contact field change (activity log has create/update events)
- No customer-facing portal
- Technician offline packet does not include site contacts — they load live from the server
- No email validation beyond HTML type="email"
- No phone formatting/normalisation

---

## Manual Test Checklist

### 1. Database Migration

- [ ] Run `0063_customer_contacts.sql` on Railway production DB
- [ ] Verify table exists: `SHOW TABLES LIKE 'customer_contacts';`
- [ ] Verify columns: `DESCRIBE customer_contacts;`
- [ ] Verify indexes: `SHOW INDEX FROM customer_contacts;`

### 2. Contacts Page — Overview Cards

- [ ] Navigate to `/admin/contacts`
- [ ] All 6 overview cards render (Total Active, Report Recipients, Billing Contacts, Quote Approvers, Site Access, Missing Email)
- [ ] Cards show 0 when no contacts exist
- [ ] Counts update after adding contacts

### 3. Contacts Page — Add Contact

- [ ] Click "Add Contact" button
- [ ] Fill all required fields (name, role)
- [ ] Select a customer → site dropdown filters to that customer's sites
- [ ] Check recipient flags
- [ ] Save → contact appears in list

### 4. Contacts Page — Edit Contact

- [ ] Click edit icon on a contact
- [ ] Modify name and email
- [ ] Save → changes reflected immediately
- [ ] Activity log records "updated contact"

### 5. Contacts Page — Deactivate / Reactivate

- [ ] Deactivate a contact → disappears from default list
- [ ] Toggle "Show inactive" → deactivated contact appears with greyed style
- [ ] Reactivate → contact becomes active again

### 6. Contacts Page — Set Primary

- [ ] Set contact as primary → shows "Primary" indicator
- [ ] Set another contact of same scope as primary → old primary loses flag
- [ ] Only one primary per scope (company + role + customer/site)

### 7. Contacts Page — Filters

- [ ] Search by name → filters list
- [ ] Search by email → filters list
- [ ] Filter by role → shows only that role
- [ ] Filter by customer → shows only contacts for that customer
- [ ] Filter by recipient type → shows only contacts with that flag
- [ ] Clear filters → full list returns

### 8. Global Search

- [ ] Search from any admin page for a contact's name → result appears under Contacts group
- [ ] Clicking the result navigates to `/admin/contacts` (or shows contact)
- [ ] Search by email → contact found
- [ ] Non-office/admin user (technician) cannot see contact results (server filters)

### 9. Report Send Dialog — Recipient Suggestions

- [ ] Create a contact with `receivesReports=1` and an email for a specific customer/site
- [ ] Open Reports page, select a job for that customer/site, open Gmail send dialog
- [ ] Cyan suggestion pills appear with contact name and email
- [ ] Click pill → email field fills
- [ ] No suggestions shown if contact has no email

### 10. Invoice Edit — Billing Contact Suggestion

- [ ] Create a contact with role `billing_contact` and email for a customer
- [ ] Open that customer's invoice, open "Edit Header" dialog
- [ ] Green suggestion pills appear in Bill To section
- [ ] Click pill → billToName fills (if blank) and billToEmail fills
- [ ] Multiple billing contacts → multiple pills shown

### 11. Repair Quote Approval — Quote Approver Suggestion

- [ ] Create a contact with role `quote_approver` and email for a customer/site
- [ ] Open a repair quote for that customer, click "Record Approval"
- [ ] Violet suggestion pills appear at top of dialog
- [ ] Click pill → approvedByName fills (if blank) and approvedByEmail fills

### 12. Technician Job Details — Site Contacts

- [ ] Create a contact with role `site_contact`, phone but NO email, linked to a site
- [ ] Log in as technician, open a job at that site
- [ ] "Site Contacts" card appears between Site Field Info and Offline Readiness
- [ ] Contact shows name, role, phone (as tappable tel: link)
- [ ] Email is NOT shown
- [ ] Create a `billing_contact` for the same customer → does NOT appear in technician view
- [ ] Create an `emergency_contact` → does appear in technician view
- [ ] Create a contact with `isSiteAccessContact=1` → appears in technician view
- [ ] Contact with `isSiteAccessContact=0` and role `property_manager` → does NOT appear

### 13. Security Checks

- [ ] Technician cannot call `listContacts` or `getContact` (server returns 403)
- [ ] Technician cannot call `getRecipientsForWorkflow` (server returns 403)
- [ ] `getSiteContactsForTechnician` response has no `email` field
- [ ] Contacts from other companies are never returned (companyId filter enforced)
