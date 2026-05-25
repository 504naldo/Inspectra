# Site Delete Dependency Audit

**Conclusion up front:** Deleting and repopulating the `sites` table is **not safe**. Sites are the
central hub of the data model. 22+ tables reference `siteId` via app-level foreign keys, none of
which have cascading DELETE constraints. Deletion would permanently orphan all operational data
(devices, jobs, reports, deficiencies, work orders, invoices, and more). **Site IDs cannot be
preserved after a delete/re-insert.**

The safe strategy is **in-place reconciliation** — fill blank fields from Customer Records, report
populated conflicts, create only genuinely missing sites.

---

## 1. Tables That Reference `siteId` Directly

| Table                           | siteId nullable? | Risk if site deleted        |
|---------------------------------|------------------|-----------------------------|
| `areas`                         | NOT NULL         | All zones orphaned          |
| `devices`                       | NOT NULL         | All devices orphaned        |
| `jobs`                          | NOT NULL         | All jobs orphaned           |
| `fireAlarmSystems`              | NOT NULL         | FA system config orphaned   |
| `serviceSchedules`              | NOT NULL         | Service schedule orphaned   |
| `monthlyServiceTracking`        | NOT NULL         | Monthly tracking orphaned   |
| `repairLetterTracking`          | NOT NULL         | Repair letters orphaned     |
| `assetLifecycleEvents`          | NOT NULL         | Asset history orphaned      |
| `siteWorkSiteInfo`              | NOT NULL (UNIQUE)| WSI row orphaned            |
| `agreementSites`                | NOT NULL         | Agreement link orphaned     |
| `workOrders`                    | NOT NULL         | All work orders orphaned    |
| `quotes`                        | NOT NULL         | All quotes orphaned         |
| `approvedWork`                  | nullable         | Approved work loses site    |
| `attachments`                   | nullable         | Attachments lose site cross-ref |
| `partsRequests`                 | nullable         | Parts requests lose site    |
| `timeEntries`                   | nullable         | Time entries lose site      |
| `payrollTimeEntries`            | nullable         | Payroll entries lose site   |
| `knowledgeBase`                 | nullable         | KB articles lose site       |
| `importLogs`                    | nullable         | Import logs lose site       |
| `invoices`                      | nullable         | Invoices lose site          |
| `inspectionTemplateAssignments` | nullable         | Template assignments broken |
| `customerContacts`              | nullable         | Contacts lose site link     |

---

## 2. Tables That Depend on `siteId` Indirectly (via `jobs`)

These tables have no direct `siteId` column, but link to `jobs.siteId`:

| Table                  | Links via           | Risk if job's site deleted        |
|------------------------|---------------------|-----------------------------------|
| `inspectionResults`    | `jobId → jobs.siteId` | All test results lose site context |
| `deficiencies`         | `jobId → jobs.siteId` | All deficiencies lose site context |
| `repairs`              | `deficiencyId → deficiencies.jobId` | Repair records lose context |
| `reports`              | `jobId → jobs.siteId` | All reports lose site context |

---

## 3. Frontend Pages / Routes That Depend on `siteId`

| Page / Route                     | How siteId is used                              |
|----------------------------------|-------------------------------------------------|
| `/admin/sites`                   | Browsing, editing sites                         |
| `/admin/jobs` + `/admin/jobs/:id`| Job-site link; job creation requires siteId     |
| `/admin/devices`                 | Devices filtered by site                        |
| `/admin/contacts`                | Contacts linked to site                         |
| `/admin/work-site-info`          | WSI is 1:1 with site                            |
| `/admin/schedule`                | Service schedules by site                       |
| `/admin/reports`                 | Reports through jobs → site                     |
| `/admin/invoices` / detail       | Invoice linked to site                          |
| `/admin/approved-work`           | Approved work linked to site                    |
| `/admin/fire-alarm-setup`        | FA system config per site                       |
| `/admin/site-files`              | Attachments by site                             |
| `/admin/asset-lifecycle`         | Asset events per site                           |
| `/admin/service-agreements`      | Agreement → agreementSites                      |
| `/admin/compliance`              | Compliance checks are site-scoped               |
| `/admin/data-quality`            | Site quality checks                             |
| `/admin/scheduling-automation`   | Automation rules per site                       |
| `/admin/repair-quotes` / detail  | Repair quotes linked to site via job            |

---

## 4. Backend Routers / Mutations That Depend on `siteId`

38 routers reference `siteId`. Key mutation points:

| Router                        | Critical mutations                                    |
|-------------------------------|-------------------------------------------------------|
| `siteRouter`                  | `create`, `update`                                    |
| `jobRouter`                   | `create` (requires siteId), `listBySite`              |
| `deviceRouters`               | `create` (requires siteId), `listBySite`              |
| `workOrderRouter`             | `create` (requires siteId)                            |
| `quoteRouter`                 | `create` (requires siteId via job)                    |
| `approvedWorkRouter`          | create/update sets siteId                             |
| `invoiceRouter`               | create/update sets siteId                             |
| `serviceScheduleRouter`       | CRUD per siteId                                       |
| `reportRouter`                | generated per job (→ siteId)                          |
| `workSiteInfoRouter`          | 1:1 with site                                         |
| `contactRouter`               | create/update allows siteId                           |
| `assetLifecycleRouter`        | events linked to siteId                               |
| `attachmentRouters`           | cross-reference siteId                                |
| `complianceRouter`            | compliance checks are site-scoped                     |
| `calendarRouter`              | calendar entries link to jobs → sites                 |
| `importRouter`                | imports reference siteId for reconciliation           |
| `globalSearchRouter`          | searches across sites                                 |

---

## 5. Data That Would Be Orphaned If Sites Were Deleted

If all sites were deleted and recreated with new auto-increment IDs, the following would be
permanently orphaned (siteId references pointing to non-existent IDs):

**Immediately broken (NOT NULL references):**
- All `areas` records
- All `devices` records (and therefore `inspectionResults`, `deficiencies` via jobs)
- All `jobs` records (and therefore `reports`, `deficiencies`, `repairs`, `inspectionResults`)
- All `fireAlarmSystems` records
- All `serviceSchedules` records
- All `monthlyServiceTracking` records
- All `repairLetterTracking` records
- All `assetLifecycleEvents` records
- All `siteWorkSiteInfo` records
- All `agreementSites` records
- All `workOrders` records
- All `quotes` records

**Silently broken (nullable references become stale IDs):**
- `approvedWork.siteId`
- `attachments.siteId`
- `invoices.siteId`
- `customerContacts.siteId`
- `partsRequests.siteId`
- `timeEntries.siteId`
- `payrollTimeEntries.siteId`
- `knowledgeBase.siteId`
- `importLogs.siteId`
- `inspectionTemplateAssignments.siteId`

---

## 6. Foreign Key Constraints

**There are no `FOREIGN KEY` constraints declared in the Drizzle schema.**

PlanetScale (the database host) does not support foreign key constraints in its serverless tier.
All referential integrity is enforced at the application level only.

This means:
- The database will NOT prevent deletion of a site that has dependent records
- There is NO cascade DELETE behavior
- Orphaned rows will silently accumulate and cause application errors (404s, missing context, broken PDF generation)
- Detection requires application-level queries, not DB constraint errors

---

## 7. Can IDs Be Safely Preserved?

**No.** MySQL `AUTO_INCREMENT` columns do not allow you to DELETE and re-INSERT with the same `id`
values reliably across a PlanetScale serverless database:

- After deletion, `AUTO_INCREMENT` continues from the highest previously used value (MySQL behavior), not from 1
- Even if you explicitly INSERT with specific ID values, PlanetScale may reject or reorder them
- Any attempt to preserve IDs requires exact value insertion in the correct order, which is fragile
  and error-prone at scale
- Replication and connection pooling in PlanetScale make manual ID management especially risky

**The only safe option is to never delete sites that have any dependent records.**

---

## 8. Recommended Safe Strategy

### Do NOT delete populated sites.

Instead, reconcile in place:

1. **Create missing sites** — Drive folders with no matching DB site → `CREATE`
2. **Fill blank fields** — Drive data fills blank `fileNumber`, `buildingId`, `address`, `city` only
3. **Report populated conflicts** — If Drive value ≠ existing DB value, write to mismatch report
4. **Preserve all existing IDs** — Never touch sites that have devices, jobs, or other dependents
5. **Manual dedup tool** (future) — For suspected duplicate sites, provide a merge script that:
   - Reassigns all dependent records from the old `siteId` to the new `siteId`
   - Then deletes the old (empty) site

### Criteria for a site to be "safe to delete"

A site has **zero operational data** if it has:
- 0 devices
- 0 jobs
- 0 work orders
- 0 service schedules
- 0 monthly tracking records
- 0 attachments (via direct siteId, not via job)
- 0 WSI records
- 0 contacts
- 0 asset lifecycle events
- 0 agreement links

Only sites meeting ALL of these criteria are candidates for deletion. Run
`scripts/auditSiteDependencies.ts` to identify them.

### Customer Records fields that may safely UPDATE existing blank site fields

| Customer Records source | Target `sites` column | Update rule         |
|-------------------------|-----------------------|---------------------|
| Drive folder `#NNNN`    | `fileNumber`          | Fill if blank       |
| Drive folder `#NNNN`    | `buildingId`          | Fill if blank       |
| Folder name (address)   | `address`             | Fill if blank       |
| Folder name (city)      | `city`                | Fill if blank       |
| Org folder name         | `customerOrgId`       | Fill if blank; report if different |
| Folder site name        | `name`                | Report if different, NEVER overwrite |

Fields that must NEVER be overwritten from Customer Records:
- `site.id`
- `site.name` (if already set — name changes require manual review)
- `site.customerOrgId` (if already set — wrong org is a data integrity issue)

---

## Appendix: Site Dependency Count Summary

Run `scripts/auditSiteDependencies.ts` to get per-site dependency counts:

```
pnpm audit:site-dependencies -- --company 1
```

Outputs:
- Total sites
- Sites with devices
- Sites with jobs
- Sites with work orders / approved work / invoices
- Sites with WSI records
- Sites with service schedules
- Sites with contacts
- Sites with attachments
- Sites with no dependencies (candidate for review)
- JSON export of fully orphaned sites
