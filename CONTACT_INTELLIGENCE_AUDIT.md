# Customer / Property Manager Contact Intelligence — Audit

**Date:** 2026-05-19

## Existing Contact Fields by Entity

### CustomerOrg (`customer_orgs` table — schema.ts line ~79)
| Field | Type | Notes |
|-------|------|-------|
| `contactName` | varchar(255) | Single flat contact name |
| `contactEmail` | varchar(320) | Single flat email |
| `contactPhone` | varchar(50) | Single flat phone |

**Gap:** One contact per org only. No role, no preferred method, no recipient flags.

---

### Site (`sites` table — schema.ts line ~149)
| Field | Type | Notes |
|-------|------|-------|
| `contactName` | varchar(255) | Single flat contact name |
| `contactPhone` | varchar(50) | Single flat phone |
| `summary` | JSON | Nested `contacts[]` array with name/phone/email/role — but never used as primary source |

**Gap:** No email on the flat site contact. No billing, no role separation.

---

### WorkSiteInfo (`site_work_site_info` table)
| Field | Type | Notes |
|-------|------|-------|
| `siteContactName` | varchar(255) | Field access contact name |
| `siteContactPhone` | varchar(50) | Field access contact phone |
| `propertyManagerEmail` | varchar(320) | Property manager email only (admin-side) |
| `siteContactEmail` | varchar(320) | Site contact email (admin-side) |

**Gap:** All contacts flattened. No role structure. Email fields labelled admin-only.

---

### Invoice (`invoices` table — schema.ts line ~1454)
| Field | Type | Notes |
|-------|------|-------|
| `billToName` | varchar(255) | Billing contact name |
| `billToEmail` | varchar(320) | Billing email |
| `billToAddress` | text | Billing street address |
| `billToCity` | varchar(100) | |
| `billToState` | varchar(100) | |
| `billToPostalCode` | varchar(20) | |

**Gap:** One billing contact per invoice, typed per-invoice rather than shared across invoices for the same customer.

---

### RepairQuote (approval fields — schema.ts line ~1042)
| Field | Type | Notes |
|-------|------|-------|
| `approvedByName` | varchar(255) | Approval contact name |
| `approvedByEmail` | varchar(320) | Approval contact email |
| `approvalSource` | enum | email / phone / signed_pdf / in_person / portal_later / internal_entry |

**Gap:** Per-quote approval contact, not shared across customer's quotes.

---

### Job (signature fields)
| Field | Type | Notes |
|-------|------|-------|
| `contactSignatureUrl` | text | Signature image URL |
| `contactName` | varchar(255) | Name of who signed |
| `contactSignedAt` | timestamp | Signature timestamp |

---

## Existing Send/Email Behavior

### Gmail Router (`gmailRouter.ts`)
- `sendReport` mutation: takes `recipientEmail`, `recipientName`, `subject`, `body`
- Used from `Reports.tsx` with a free-text email field
- **No contact lookup** — office staff manually type the recipient email
- `checkConnection` — verifies Google OAuth is configured

### Invoice sending:
- No automated sending — invoice PDF is downloaded manually
- `InvoiceDetail.tsx` shows `billToEmail` but does not trigger Gmail

### Quote sending:
- `RepairQuoteDetail.tsx` records approval but does not send via Gmail
- Quote accept link is generated (`/quote/accept`) for customer self-approval

---

## Missing Contact-Role Structure

The following are **not currently implemented** anywhere in the codebase:

1. **Centralized contacts table** — contacts are flat fields on each entity, not a first-class concept
2. **Contact roles** — no classification (billing_contact, report_recipient, property_manager, etc.)
3. **Recipient flags** — no `receivesReports`, `receivesInvoices`, `receivesQuotes` flags
4. **Multi-contact per customer/site** — one flat contact only
5. **Preferred communication method** — no `preferredMethod` on any entity
6. **Primary contact designation** — no `isPrimary` flag
7. **Site access contact** — contacts with `isSiteAccessContact` for technician use
8. **Emergency contact** — no role for emergency/after-hours contacts
9. **Contact deactivation** — contacts currently can only be overwritten, not deactivated
10. **Contact activity history** — no audit trail for contact changes
11. **Global search for contacts** — contacts are searched incidentally via customerOrg/site

---

## Recommended Minimal Implementation

### New table: `customer_contacts`
A centralized, role-annotated contact table linked to `customerOrg` and/or `site`.

**Key decisions:**
- A contact can belong to an org (`customerOrgId`), a site (`siteId`), or both
- Roles are a constrained enum (not free text)
- Recipient flags are separate boolean columns for query efficiency
- `isPrimary` allows one primary contact per org/site
- `isActive` allows soft-delete without data loss

### Backend: `contactRouter.ts`
- `listContacts` — filtered list for the contacts page
- `getContactsForCustomer` / `getContactsForSite` — for integration panels
- `getRecipientsForWorkflow` — for Send Center / Gmail integration
- `createContact` / `updateContact` / `deactivateContact` / `setPrimaryContact`

### Frontend: `/admin/contacts`
- Overview cards (totals by type)
- Filter bar (customer, site, role, recipient flags)
- Contact list with badges
- Add/Edit/Deactivate actions

### Integrations:
- **Reports.tsx** — suggest `receivesReports` contacts via `getRecipientsForWorkflow`
- **InvoiceDetail.tsx** — suggest billing contacts
- **RepairQuoteDetail.tsx** — suggest quote approvers
- **Technician JobDetails.tsx** — show site access + emergency contacts (role-filtered)
- **GlobalSearch** — add contacts as a search category

---

## V1 Limitations

- Contacts are a new layer on top of existing flat fields — existing `contactName/Email/Phone` on `customerOrg` and `site` are NOT migrated automatically
- The `summary.contacts[]` JSON on sites is not migrated to the new table
- Site `contactPhone` (no email) and CustomerOrg contact email remain as-is for other code
- Recipients for Gmail send are *suggested* — office staff must confirm before sending
- No deduplication of contacts across entities
- No import from existing records
