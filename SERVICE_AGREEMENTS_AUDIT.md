# Service Agreements — Pre-Build Audit

## Existing Customer/Site Billing Fields

### customerOrgs
| Field | Notes |
|---|---|
| name, contactName, contactEmail, contactPhone | Basic contact info |
| No billing/contract fields | No agreement number, no renewal date, no contract status |

### sites
| Field | Notes |
|---|---|
| fileNumber | Matches FILE # in service tracking spreadsheet (e.g. "#0007") |
| notes | Freeform text |
| No billing/contract fields | No agreement linkage |

### serviceSchedules
| Field | Notes |
|---|---|
| frequency (monthly/quarterly/semi_annual/annual/other) | Per-site recurring schedule |
| estimatedHours, requiredTechCount, requiredSystems | Planning fields |
| active, lastCompletedAt, nextDueAt | Scheduling state |
| No contract dates | No startDate, endDate, renewalDate, customer approval fields |

### monthlyServiceTracking
| Field | Notes |
|---|---|
| agreementSigned (boolean) | Single boolean flag — is there a signed agreement? No FK, no detail |
| No reference to agreement record | Just a boolean checkbox from spreadsheet import |

### invoices
No agreement linkage fields. No FK to any contract.

---

## Existing Recurring Schedule / Monthly Tracking

- `serviceSchedules`: Per-site/service-type recurring definition. Has frequency. No customer-facing contract metadata.
- `monthlyServiceTracking`: Admin tracking rows per month. Has `agreementSigned` flag only.
- No "contract" or "service agreement" concept exists beyond the boolean flag.

---

## Existing Invoice Linkage

Invoices have: `customerOrgId`, `siteId`, `jobId`, `workOrderId`. No `agreementId` foreign key.

---

## Existing Contract / Agreement Tables

**None.** No `service_agreements`, `contracts`, or `customer_agreements` tables exist.

---

## Missing Pieces

1. **service_agreements table** — the core contract record
2. **agreement_sites table** — many-to-many: one agreement can cover multiple sites, each with per-site service overrides
3. **Status lifecycle** — draft → active → expiring_soon → expired / cancelled
4. **Billing cycle field** — monthly, quarterly, semi_annual, annual, per_service, custom
5. **Included/excluded services as JSON** — list of service type strings
6. **Renewal tracking** — renewalDate, endDate
7. **Document attachment** — documentUrl for the signed PDF
8. **Agreement number generator** — SA-{YEAR}-{SEQ4}
9. **Notifications** — alert when expiring in 30/60/90 days, when expired, when active but no sites
10. **Nav + routes** — /admin/service-agreements, /admin/service-agreements/:id

---

## What Can Be Reused

| Existing | Reused For |
|---|---|
| `officeProcedure` | Auth guard for all router procedures |
| `db.getCustomerOrgsByCompany()` | List customers for create/edit form |
| `db.getSitesByCompany()` | List sites for add-site flow |
| `db.getSiteById()` | Enrich site data on agreement detail |
| `logActivity` | Audit trail for create/update/cancel/site changes |
| `db.createNotification + hasUndismissedNotification` | Expiry/coverage-gap notifications |
| Activity Timeline component | Show agreement activity on detail page |
| Existing tab filter pattern (Invoices.tsx) | Status filter tabs on list page |

---

## Recommended Minimal Implementation

- Two new tables: `service_agreements` + `agreement_sites`
- `serviceAgreementRouter` with 10 procedures
- List page with status tabs, search, expiring-soon badges
- Detail page with covered sites, included services, billing notes
- Nav entry under "More" dropdown
- Fire-and-forget expiry notifications on list
