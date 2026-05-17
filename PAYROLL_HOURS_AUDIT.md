# Payroll Hours Audit

## Existing time_entries Table

**Schema** (`drizzle/schema.ts`, `timeEntries`):
- `companyId`, `userId` — company-scoped, owner-identified
- `jobId`, `workOrderId`, `approvedWorkId`, `siteId`, `customerOrgId` — optional job links
- `entryDate` (date NOT NULL) — which day
- `startTime`, `endTime` (varchar 8) — optional clock times
- `durationMinutes` (int NOT NULL) — required duration, no break concept
- `labourType` enum: `inspection | repair | service_call | travel | admin | parts_run | other`
- `status` enum: `draft | submitted | approved | rejected | invoiced`
- `description` (varchar 1000) — entry description
- `internalNotes` (text) — used for rejection reasons (prefixed "Rejected: ...")
- `approvedById`, `approvedAt` — approval tracking
- No `breakMinutes`, no `overtimeMinutes`, no `payPeriodStart/End`
- No `submittedAt`, no `rejectedById`, no `rejectedAt`, no `rejectionReason` field
- No `exportedAt`, no `exportedById`

## Existing Timesheet Workflow

1. Technician creates entry (draft) → optionally linked to jobId
2. Technician submits → status becomes `submitted`
3. Admin/office approves → status `approved`, sets `approvedById`/`approvedAt`
4. Admin/office rejects → status `rejected`, prepends reason to `internalNotes`
5. When entry is invoiced → status becomes `invoiced` (job costing flow)
6. No export step, no pay period grouping

## Existing Access Control

- `listMine` — `technicianProcedure` (admin/office/technician): own entries only
- `listCompany` — `officeProcedure` (admin/office): all company entries
- `create`, `update`, `submit`, `deleteDraft` — `technicianProcedure`
- `approve`, `reject` — `officeProcedure`
- No office-staff self-entry path (office can only view company entries, not create)

## Existing Export Support

**None.** No CSV/JSON export exists for time entries. Status `invoiced` is set
externally by the invoice flow but there is no payroll export step.

## User Roles

Roles from `users.role`: `admin | office | technician | customer`
- `technicianProcedure` allows: admin, office, technician
- `officeProcedure` allows: admin, office

## Can Existing time_entries Support Payroll Hours?

**No — separate table is safer.** Reasons:

1. `labourType` enum is job-specific (inspection, repair, service_call, parts_run).
   Payroll needs workTypes like vacation, sick_time, stat_holiday, training, meeting.
   Extending the enum risks breaking existing job costing queries and reports.

2. Status `invoiced` is used by the job costing invoice flow.
   Payroll needs `exported` and `locked` statuses that have no meaning in job costing.

3. `durationMinutes` is required (NOT NULL) and drives job costing.
   Payroll needs `regularMinutes` + `overtimeMinutes` + `breakMinutes` as separate fields.

4. `internalNotes` is overloaded for rejection reasons ("Rejected: ...").
   Payroll needs explicit `rejectionReason`, `employeeNotes`, `adminNotes`.

5. No pay period tracking (`payPeriodStart`, `payPeriodEnd`) in time_entries.

6. No `submittedAt`, `rejectedById`, `rejectedAt`, `exportedAt`, `exportedById` fields.

7. Mixing payroll entries with job costing entries would corrupt job cost reports
   (e.g., getSummary would include vacation hours in labour minutes).

## Recommended Implementation

**Separate table: `payroll_time_entries`**

- Full payroll-specific schema
- No overlap with job costing time_entries
- No migration risk to existing job costing data
- Clean separation of concerns
- payrollHoursRouter with technicianProcedure (create/edit own) + officeProcedure (approve/export)
- Employee UI at `/tech/payroll-hours` (accessible to all roles)
- Admin review UI at `/admin/payroll-hours` (admin/office only)
- CSV export generated client-side from tRPC export query
