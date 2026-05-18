export type HelpContent = {
  title: string;
  description: string;
  commonTasks?: string[];
  nextSteps?: string[];
  relatedPages?: Array<{ label: string; href: string }>;
  warnings?: string[];
  roleNotes?: {
    admin?: string;
    office?: string;
    technician?: string;
  };
  workflowHint?: string;
};

export const HELP_CONTENT: Record<string, HelpContent> = {

  // ── Admin: Operations ────────────────────────────────────────────────────────

  dashboard: {
    title: "Operations Dashboard",
    description:
      "Your real-time command center. See today's jobs, overdue inspections, reports awaiting QA, open deficiencies, and pending invoices in one view. The Attention Queue highlights items that need action.",
    commonTasks: [
      "Check the Attention Queue for overdue jobs or urgent deficiencies",
      "See which reports are pending QA review",
      "Monitor invoice and approved work status",
      "Review data quality warnings",
    ],
    nextSteps: [
      "Assign technicians to unscheduled jobs via Schedule",
      "Review the Report QA queue for completed inspections",
      "Export ready invoices to accounting",
    ],
    relatedPages: [
      { label: "Jobs", href: "/admin/jobs" },
      { label: "Schedule", href: "/admin/schedule" },
      { label: "Report QA", href: "/admin/report-qa" },
      { label: "Invoices", href: "/admin/invoices" },
    ],
    roleNotes: {
      admin: "Admins see all company data including data quality warnings and financial summaries.",
      office: "Office staff see operational data. Contact your admin for user or billing management.",
    },
  },

  jobs: {
    title: "Jobs",
    description:
      "Manage all inspection and service jobs for your customers. Jobs flow from pending → scheduled → in progress → completed → QA review → finalized.",
    commonTasks: [
      "Create a new job for a customer site",
      "Filter jobs by status, customer, or date range",
      "Assign technicians to jobs",
      "Open a job to view inspection progress",
    ],
    nextSteps: [
      "Schedule unscheduled jobs via the Schedule page",
      "Once completed, submit the job report for QA review",
    ],
    relatedPages: [
      { label: "Schedule", href: "/admin/schedule" },
      { label: "Report QA", href: "/admin/report-qa" },
      { label: "Job Assignments", href: "/admin/job-assignments" },
    ],
    warnings: [
      "Finalized jobs are locked — device results and deficiencies cannot be edited after finalization.",
    ],
    roleNotes: {
      admin: "Admins can create, reassign, and delete jobs.",
      office: "Office staff can create and manage jobs but cannot delete finalized records.",
    },
  },

  job_detail: {
    title: "Job Details (Admin)",
    description:
      "View the full details of an inspection job: assigned technicians, inspection progress, deficiencies, reports, and QA status.",
    commonTasks: [
      "Check inspection progress and device test results",
      "Review deficiencies logged during the inspection",
      "View or generate the inspection report",
      "Submit the job for QA review when complete",
    ],
    nextSteps: [
      "If inspection is complete, navigate to Report QA",
      "If deficiencies need repair, create a Repair Quote",
    ],
    relatedPages: [
      { label: "Report QA", href: "/admin/report-qa" },
      { label: "Repair Quotes", href: "/admin/quotes" },
    ],
    warnings: [
      "Finalized jobs are locked — no edits are possible after the report is sent.",
    ],
  },

  schedule: {
    title: "Schedule",
    description:
      "View and assign jobs across the calendar. Drag jobs to different days or technicians to reschedule. See daily workloads and identify scheduling conflicts.",
    commonTasks: [
      "Assign a technician to an unscheduled job",
      "Drag a job to a different date",
      "View how many jobs each technician has in a day",
      "Filter by technician or job type",
    ],
    nextSteps: [
      "Assign all unscheduled jobs with an upcoming due date",
      "Check for overloaded technicians and rebalance",
    ],
    relatedPages: [
      { label: "Jobs", href: "/admin/jobs" },
      { label: "Auto-Schedule", href: "/admin/scheduling-automation" },
    ],
    warnings: [
      "Jobs not assigned to a technician will not appear on the technician's mobile dashboard.",
    ],
  },

  approved_work: {
    title: "Approved Work",
    description:
      "Track repair and installation work that customers have approved. Approved Work is created when a customer accepts a Repair Quote. It moves through planning → scheduled → in_progress → completed.",
    commonTasks: [
      "View approved work by status",
      "Schedule approved work by assigning a technician and date",
      "Mark work as completed when done",
      "Convert completed work to an invoice",
    ],
    nextSteps: [
      "Once scheduled and completed, create an invoice for the work",
    ],
    relatedPages: [
      { label: "Repair Quotes", href: "/admin/quotes" },
      { label: "Invoices", href: "/admin/invoices" },
      { label: "Work Orders", href: "/admin/work-orders" },
    ],
    workflowHint:
      "Approved Work comes from customer-accepted Repair Quotes. Complete it, then invoice the customer.",
  },

  work_orders: {
    title: "Work Orders",
    description:
      "Internal work tickets for tasks that don't originate from a Repair Quote — ad-hoc service calls, warranty work, or internal repairs. Work Orders are for tracking, not customer billing.",
    commonTasks: [
      "Create a work order for an ad-hoc task",
      "Assign a technician and expected completion date",
      "Track progress and close when complete",
    ],
    relatedPages: [
      { label: "Approved Work", href: "/admin/approved-work" },
      { label: "Jobs", href: "/admin/jobs" },
    ],
    roleNotes: {
      admin: "Work Orders are internal. If the customer should be billed, use Repair Quotes → Approved Work → Invoice instead.",
      office: "Work Orders are for internal tracking only and do not generate customer invoices.",
    },
  },

  // ── Admin: Reports ───────────────────────────────────────────────────────────

  reports: {
    title: "Reports",
    description:
      "View and manage all inspection reports. Reports are generated automatically when a job is submitted for QA. They can be previewed, QA-reviewed, and sent to customers.",
    commonTasks: [
      "Find a report by job or customer",
      "Preview a generated PDF report",
      "Check QA status for a completed job",
    ],
    nextSteps: [
      "Pending reports need to go through Report QA before being sent",
    ],
    relatedPages: [
      { label: "Report QA", href: "/admin/report-qa" },
    ],
  },

  report_qa: {
    title: "Report QA",
    description:
      "Review inspection reports before they are sent to customers. Reports arrive here after a technician marks a job complete. You can approve them, request corrections, or archive them.",
    commonTasks: [
      "Open a report to preview the full inspection PDF",
      "Check deficiency documentation for completeness",
      "Approve a report when it meets quality standards",
      "Request corrections if data is missing or incorrect",
      "Send the approved report to the customer",
    ],
    nextSteps: [
      "Approved reports can be sent to the customer directly from this page",
      "If deficiencies were found, consider creating a Repair Quote",
    ],
    relatedPages: [
      { label: "Reports", href: "/admin/reports" },
      { label: "Jobs", href: "/admin/jobs" },
      { label: "Repair Quotes", href: "/admin/quotes" },
    ],
    warnings: [
      "Sent reports are archived and cannot be un-sent.",
      "Corrections requested go back to the technician — make sure instructions are clear.",
    ],
    workflowHint:
      "Status flow: Generated → Review → Approve (or Request Corrections) → Send to customer. Review deficiency documentation before approving.",
  },

  compliance: {
    title: "Compliance Dashboard",
    description:
      "Monitor compliance health across all your customer sites. See which sites have overdue inspections, unresolved deficiencies, or missing documentation.",
    commonTasks: [
      "Find sites with overdue inspections",
      "See open critical deficiencies by site",
      "Identify sites missing required documentation",
    ],
    nextSteps: [
      "Schedule inspections for overdue sites",
      "Follow up on critical deficiencies with repair quotes",
    ],
    relatedPages: [
      { label: "Sites", href: "/admin/sites" },
      { label: "Jobs", href: "/admin/jobs" },
      { label: "Repair Quotes", href: "/admin/quotes" },
    ],
    warnings: [
      "Compliance data reflects the current state in Inspectra. Always verify with the authority having jurisdiction (AHJ) for official compliance status.",
    ],
  },

  data_quality: {
    title: "Data Quality",
    description:
      "Identify and fix data gaps across your sites, customers, and devices. Data quality issues can affect report generation, compliance tracking, and invoicing.",
    commonTasks: [
      "Find sites missing required fields (Building ID, File Number, Customer Org)",
      "Fix missing device serial numbers or locations",
      "Resolve customer records with incomplete contact info",
    ],
    nextSteps: [
      "Fix high-priority data issues before generating reports",
    ],
    relatedPages: [
      { label: "Sites", href: "/admin/sites" },
      { label: "Devices", href: "/admin/devices" },
      { label: "Customers", href: "/admin/customers" },
    ],
  },

  document_center: {
    title: "Document Center",
    description:
      "Store and manage site-related documents: permits, certificates of occupancy, previous inspection reports, and other files.",
    commonTasks: [
      "Upload documents for a site",
      "Attach a document to a report or job",
      "Find previously uploaded files",
    ],
    relatedPages: [
      { label: "Sites", href: "/admin/sites" },
    ],
  },

  // ── Admin: Customers ─────────────────────────────────────────────────────────

  customers: {
    title: "Customers",
    description:
      "Manage customer organizations. Each customer can have multiple sites. Customer contact info is used in reports and invoices.",
    commonTasks: [
      "Add a new customer",
      "Edit contact information",
      "View all sites for a customer",
    ],
    relatedPages: [
      { label: "Sites", href: "/admin/sites" },
      { label: "Customer Records", href: "/admin/customer-records" },
      { label: "Service Agreements", href: "/admin/service-agreements" },
    ],
  },

  sites: {
    title: "Sites",
    description:
      "Manage inspection sites (buildings, properties). Sites belong to customers. Each site has devices, inspection history, and compliance records.",
    commonTasks: [
      "Add a new site to a customer",
      "Set up the device list for a site",
      "View inspection history for a site",
    ],
    relatedPages: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Devices", href: "/admin/devices" },
      { label: "Compliance", href: "/admin/compliance" },
    ],
  },

  customer_records: {
    title: "Customer Records",
    description:
      "View a combined record for each customer: all sites, jobs, deficiencies, invoices, and service agreements in one place.",
    relatedPages: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Sites", href: "/admin/sites" },
    ],
  },

  service_agreements: {
    title: "Service Agreements",
    description:
      "Track recurring service contracts with customers. Agreements define the inspection frequency, services included, and billing terms.",
    commonTasks: [
      "Create a new service agreement",
      "Set inspection frequency and renewal date",
      "View all active agreements",
    ],
    relatedPages: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Jobs", href: "/admin/jobs" },
      { label: "Invoices", href: "/admin/invoices" },
    ],
  },

  // ── Admin: Financial ─────────────────────────────────────────────────────────

  invoices: {
    title: "Invoices",
    description:
      "Create and manage invoices for completed jobs and approved repair work. Invoices can be exported to your accounting system.",
    commonTasks: [
      "Create an invoice for a completed job or approved work",
      "Send an invoice to a customer",
      "Mark an invoice as paid",
      "Export invoices to accounting (e.g. Sage)",
    ],
    relatedPages: [
      { label: "Approved Work", href: "/admin/approved-work" },
      { label: "Jobs", href: "/admin/jobs" },
    ],
    warnings: [
      "Exported or paid invoices are locked. Line items and amounts cannot be edited after export or payment is recorded.",
    ],
  },

  invoice_detail: {
    title: "Invoice Detail",
    description:
      "View and manage a specific invoice: line items, amounts, status, and customer communication.",
    commonTasks: [
      "Add or edit line items (draft invoices only)",
      "Send the invoice to the customer",
      "Record a payment",
      "Export to accounting",
    ],
    warnings: [
      "Exported or paid invoices are locked for accounting integrity — edits are not possible.",
    ],
    relatedPages: [
      { label: "Invoices", href: "/admin/invoices" },
      { label: "Approved Work", href: "/admin/approved-work" },
    ],
    workflowHint:
      "Exported or paid invoices are locked for accounting integrity. Edit line items before exporting.",
  },

  quotes: {
    title: "Repair Quotes",
    description:
      "Create and manage repair quotes for deficiencies found during inspections. Once a customer approves a quote, it becomes Approved Work.",
    commonTasks: [
      "Create a quote from a deficiency",
      "Add line items for parts and labor",
      "Send the quote to the customer for approval",
      "Convert an approved quote to Approved Work",
    ],
    relatedPages: [
      { label: "Approved Work", href: "/admin/approved-work" },
      { label: "Invoices", href: "/admin/invoices" },
      { label: "Parts Catalog", href: "/admin/parts-catalog" },
    ],
  },

  quote_detail: {
    title: "Repair Quote Detail",
    description:
      "View and manage a specific repair quote. Add line items, send to the customer for approval, and track the customer's response.",
    commonTasks: [
      "Add parts and labor line items",
      "Send the quote to the customer",
      "Record the customer's approval or rejection",
      "Convert an approved quote to Approved Work",
    ],
    relatedPages: [
      { label: "Approved Work", href: "/admin/approved-work" },
      { label: "Parts Catalog", href: "/admin/parts-catalog" },
    ],
    workflowHint:
      "Once the customer approves this quote, use the 'Convert to Approved Work' action to begin scheduling the repair.",
  },

  // ── Admin: Field Work ────────────────────────────────────────────────────────

  devices: {
    title: "Devices",
    description:
      "Manage all fire protection devices across your sites. Devices are tested during inspections and tracked for maintenance history.",
    commonTasks: [
      "Add devices to a site",
      "Update device information (serial number, location, manufacture date)",
      "View test history for a device",
    ],
    relatedPages: [
      { label: "Sites", href: "/admin/sites" },
      { label: "Asset Lifecycle", href: "/admin/asset-lifecycle" },
    ],
  },

  asset_lifecycle: {
    title: "Asset Lifecycle",
    description:
      "Track the full lifecycle of fire protection equipment: from installation through testing, maintenance, and end-of-life replacement.",
    commonTasks: [
      "Find devices approaching end-of-life",
      "View maintenance history for specific equipment",
      "Plan replacement schedules",
    ],
    relatedPages: [
      { label: "Devices", href: "/admin/devices" },
      { label: "Sites", href: "/admin/sites" },
    ],
  },

  payroll_hours: {
    title: "Payroll Hours",
    description:
      "Review and manage technician time entries for payroll processing. Technicians submit hours worked; office staff review and approve before export.",
    commonTasks: [
      "Review submitted technician hours",
      "Approve or reject time entries",
      "Export approved hours to payroll",
    ],
    relatedPages: [
      { label: "Payroll Review", href: "/admin/payroll-review" },
      { label: "Timesheets", href: "/admin/timesheets" },
    ],
    warnings: [
      "Payroll hours are for payroll processing. Job-level time tracking is a separate feature used for job costing — they are not the same.",
    ],
    workflowHint:
      "Payroll hours are for payroll review. Job time-tracking is separate and used for job costing — do not confuse the two.",
  },

  timesheets: {
    title: "Timesheets",
    description:
      "View and manage detailed timesheet entries for technicians. Timesheets record clock-in/out times and job-level time allocations.",
    relatedPages: [
      { label: "Payroll Hours", href: "/admin/payroll-hours" },
      { label: "Payroll Review", href: "/admin/payroll-review" },
    ],
  },

  payroll_review: {
    title: "Payroll Review",
    description:
      "Final review of payroll data before export. Verify all hours are correct, resolve discrepancies, and export to your payroll system.",
    warnings: [
      "Once exported, payroll data is considered final. Corrections require a manual adjustment in your payroll system.",
    ],
    relatedPages: [
      { label: "Payroll Hours", href: "/admin/payroll-hours" },
      { label: "Timesheets", href: "/admin/timesheets" },
    ],
  },

  // ── Admin: Inventory ─────────────────────────────────────────────────────────

  inventory: {
    title: "Inventory",
    description:
      "Track parts and materials on hand. Monitor stock levels, receive new stock, and see what's been used on jobs.",
    commonTasks: [
      "Check current stock levels",
      "Record received inventory",
      "See parts used on recent jobs",
    ],
    relatedPages: [
      { label: "Parts Catalog", href: "/admin/parts-catalog" },
      { label: "Parts Requests", href: "/admin/parts-requests" },
      { label: "Purchase Orders", href: "/admin/purchase-orders" },
    ],
  },

  parts_requests: {
    title: "Parts Requests",
    description:
      "Manage technician requests for parts and materials. Review and approve or reject requests, then fulfill them from inventory or order from a vendor.",
    relatedPages: [
      { label: "Inventory", href: "/admin/inventory" },
      { label: "Purchase Orders", href: "/admin/purchase-orders" },
      { label: "Vendors", href: "/admin/vendors" },
    ],
  },

  purchase_orders: {
    title: "Purchase Orders",
    description:
      "Create and track purchase orders sent to vendors. POs are used to restock inventory and procure materials for specific jobs.",
    relatedPages: [
      { label: "Vendors", href: "/admin/vendors" },
      { label: "Inventory", href: "/admin/inventory" },
    ],
  },

  vendors: {
    title: "Vendors",
    description:
      "Manage your supplier contacts. Vendors are linked to purchase orders and parts catalog entries.",
    relatedPages: [
      { label: "Purchase Orders", href: "/admin/purchase-orders" },
      { label: "Parts Catalog", href: "/admin/parts-catalog" },
    ],
  },

  // ── Admin: Tools ─────────────────────────────────────────────────────────────

  inspection_templates: {
    title: "Inspection Templates",
    description:
      "Create custom inspection checklists for specific job types or customer requirements. Templates are assigned to jobs and completed by technicians in the field.",
    commonTasks: [
      "Create a new inspection template",
      "Add sections and questions",
      "Assign a template to a job type",
    ],
    relatedPages: [
      { label: "Jobs", href: "/admin/jobs" },
    ],
    roleNotes: {
      admin: "Templates are managed by admin users. Changes to templates affect all future jobs using that template.",
    },
  },

  import_center: {
    title: "Import Center",
    description:
      "Import data from spreadsheets or external systems. Supports importing customers, sites, devices, and other records in bulk.",
    commonTasks: [
      "Download the import template for your data type",
      "Fill in the template with your data",
      "Upload and review the import results",
    ],
    warnings: [
      "Review all import results carefully — imported records cannot be bulk-deleted.",
      "Use the template format exactly to avoid import errors.",
    ],
    roleNotes: {
      admin: "Only admins can perform data imports. Contact your Inspectra rep if you need a custom import format.",
    },
  },

  feedback_center: {
    title: "Feedback Center",
    description:
      "Review feedback and bug reports submitted by your team. Manage status, assign items for follow-up, and track resolution.",
    commonTasks: [
      "Review new feedback submissions",
      "Assign feedback items to team members",
      "Update status as items are resolved",
    ],
    relatedPages: [
      { label: "Notifications", href: "/admin/notifications" },
    ],
    roleNotes: {
      admin: "Urgent submissions trigger an automatic notification for admins.",
    },
  },

  ai_assistant: {
    title: "AI Assistant",
    description:
      "Ask questions about your operations data, get help drafting text, or request summaries. The AI has access to your live job, site, deficiency, and invoice data.",
    commonTasks: [
      "Ask for a daily briefing on what needs attention",
      "Get help drafting a deficiency description",
      "Summarize a specific job, site, or invoice",
      "Ask for workflow guidance on any Inspectra module",
    ],
    warnings: [
      "The AI cannot approve records, send emails, or modify data — it can only read and draft.",
      "Always review AI-generated text before using it in customer-facing documents.",
    ],
  },

  knowledge_base: {
    title: "Knowledge Base",
    description:
      "Internal reference articles for your team: fire protection standards, company procedures, and Inspectra workflow guides. The AI Assistant uses this content to improve its answers.",
    commonTasks: [
      "Add a new article",
      "Search existing articles",
      "Keep procedures up to date",
    ],
    relatedPages: [
      { label: "AI Assistant", href: "/admin/ai-assistant" },
    ],
  },

  setup_wizard: {
    title: "Setup Wizard",
    description:
      "Step-by-step guide to configuring Inspectra for your company: company profile, users, sites, devices, and automation settings.",
    commonTasks: [
      "Complete your company profile",
      "Add users and assign roles",
      "Set up your first customer and site",
    ],
    relatedPages: [
      { label: "Settings", href: "/admin/settings" },
      { label: "Users", href: "/admin/users" },
    ],
    roleNotes: {
      admin: "Only admins can complete the setup wizard. Run it again at any time from the Tools menu.",
    },
  },

  // ── Technician: Field ─────────────────────────────────────────────────────────

  tech_dashboard: {
    title: "My Jobs",
    description:
      "Your personalized job list. Jobs are sorted by urgency — in-progress jobs first, then overdue, then today's schedule, then upcoming. Tap any job to open it.",
    commonTasks: [
      "Find today's scheduled jobs",
      "Continue an in-progress inspection",
      "Check for overdue or urgent jobs",
      "Sync data when you return online",
    ],
    nextSteps: [
      "Tap a job card to open it",
      "Sync offline data when you have a connection",
    ],
    relatedPages: [
      { label: "Sync Data", href: "/tech/sync" },
      { label: "My Payroll Hours", href: "/tech/payroll-hours" },
    ],
    warnings: [
      "If you see a 'Sync pending' banner, submit all offline data before you finish your day.",
    ],
    roleNotes: {
      technician: "Only jobs assigned to you will appear here. Contact your office if a job is missing.",
    },
  },

  tech_job_detail: {
    title: "Job Details",
    description:
      "Your field inspection screen. Complete device tests, log deficiencies, capture signatures, and track your progress. Tap each device to record Pass, Fail, or N/A.",
    commonTasks: [
      "Test each device and record Pass / Fail / N/A",
      "Log a deficiency when you find a problem",
      "Add notes to the job",
      "Capture a customer signature when complete",
    ],
    nextSteps: [
      "When all devices are tested, ask for a customer signature",
      "Submit for QA from the job actions menu when done",
    ],
    warnings: [
      "Make sure all data is synced before submitting for QA — unsynced data will not be included in the report.",
    ],
    workflowHint:
      "Complete all device tests and sync all data before submitting for QA. Offline data is saved locally — sync when you have a connection.",
    roleNotes: {
      technician:
        "You can work offline — results are saved to your device. Sync when you return to cell or Wi-Fi coverage.",
    },
  },

  tech_device_test: {
    title: "Device Test",
    description:
      "Record the test result for a single device. Use Pass, Fail, or N/A. Add notes to describe what you found. Flag a deficiency if the device fails or needs attention.",
    commonTasks: [
      "Set the result: Pass, Fail, or N/A",
      "Add notes about the device condition",
      "Flag a deficiency for failing or damaged devices",
      "Navigate to the next device using the arrows",
    ],
    warnings: [
      "N/A means the device was not applicable to this inspection (e.g. a sprinkler head tested under a different job type). Use 'Not Tested' if you simply didn't test it yet.",
    ],
    workflowHint:
      "Pass = device tested and working. Fail = device failed testing (log a deficiency). N/A = not applicable to this job. Not Tested = not yet completed.",
    roleNotes: {
      technician:
        "Results save automatically when you navigate away. You can update a result later in the same job.",
    },
  },

  tech_deficiency_editor: {
    title: "Deficiency",
    description:
      "Document a deficiency (a problem, failure, or code violation) found during the inspection. Provide a clear title, severity, description of the issue, and recommended corrective action.",
    commonTasks: [
      "Set the severity (Critical, Major, Minor, Observation)",
      "Describe the observed issue clearly",
      "Recommend a corrective action",
      "Attach a photo if available",
      "Use AI Assist to help draft professional language",
    ],
    warnings: [
      "Critical deficiencies represent immediate life-safety risks. Document them completely and alert your office.",
      "Use professional language — this text may appear in the customer's inspection report.",
    ],
    workflowHint:
      "Severity guide: Critical = immediate danger, Major = significant issue, Minor = code discrepancy, Observation = note for the customer.",
    roleNotes: {
      technician:
        "Deficiencies are reviewed by office staff during QA. Write clearly so reviewers understand what you found.",
    },
  },

  tech_sync: {
    title: "Sync Data",
    description:
      "Upload offline inspection results and deficiencies to Inspectra. Data saved while offline is stored on your device until you sync.",
    commonTasks: [
      "Tap Sync to upload all pending results",
      "Check pending counts before submitting a job for QA",
    ],
    warnings: [
      "Submit offline data before your office closes the job — unsynced data is not visible to your office and will not appear in the report.",
    ],
    roleNotes: {
      technician:
        "Sync whenever you return to Wi-Fi or cell coverage. Data is safe on your device until synced.",
    },
  },

  // ── Admin: Other ─────────────────────────────────────────────────────────────

  notifications: {
    title: "Notifications",
    description:
      "System alerts for your company: job completions, QA events, urgent deficiencies, and other important updates.",
    commonTasks: [
      "Mark notifications as read",
      "Click a notification to navigate to the related record",
    ],
    relatedPages: [
      { label: "Dashboard", href: "/admin" },
    ],
  },

  access_control: {
    title: "Access Control",
    description:
      "Manage what each user role can see and do in Inspectra. Restrict access to financial data, admin settings, or specific modules.",
    warnings: [
      "Changes to access control affect all users with that role immediately.",
    ],
    roleNotes: {
      admin: "Only admins can modify access control settings.",
    },
  },

  users: {
    title: "Users",
    description:
      "Manage user accounts for your company. Add new staff, assign roles, and deactivate former employees.",
    commonTasks: [
      "Invite a new user",
      "Change a user's role",
      "Deactivate a departed employee",
    ],
    warnings: [
      "Deactivated users lose access immediately. Their historical records are preserved.",
    ],
    roleNotes: {
      admin: "Only admins can manage users.",
    },
  },

  settings: {
    title: "Company Settings",
    description:
      "Configure your company profile: name, address, logo, report branding, and integration settings.",
    roleNotes: {
      admin: "Only admins can change company settings.",
    },
  },

};

// ── Route → help key mapper ──────────────────────────────────────────────────

export function routeToHelpKey(path: string): string | null {
  // Strip query string
  const p = path.split("?")[0].replace(/\/$/, "") || "/";

  // Exact matches first
  const exact: Record<string, string> = {
    "/admin":                        "dashboard",
    "/admin/jobs":                   "jobs",
    "/admin/schedule":               "schedule",
    "/admin/reports":                "reports",
    "/admin/report-qa":              "report_qa",
    "/admin/compliance":             "compliance",
    "/admin/data-quality":           "data_quality",
    "/admin/documents":              "document_center",
    "/admin/customers":              "customers",
    "/admin/sites":                  "sites",
    "/admin/customer-records":       "customer_records",
    "/admin/service-agreements":     "service_agreements",
    "/admin/invoices":               "invoices",
    "/admin/quotes":                 "quotes",
    "/admin/approved-work":          "approved_work",
    "/admin/work-orders":            "work_orders",
    "/admin/payroll-hours":          "payroll_hours",
    "/admin/payroll-review":         "payroll_review",
    "/admin/timesheets":             "timesheets",
    "/admin/inventory":              "inventory",
    "/admin/parts-requests":         "parts_requests",
    "/admin/purchase-orders":        "purchase_orders",
    "/admin/vendors":                "vendors",
    "/admin/devices":                "devices",
    "/admin/asset-lifecycle":        "asset_lifecycle",
    "/admin/inspection-templates":   "inspection_templates",
    "/admin/imports":                "import_center",
    "/admin/feedback":               "feedback_center",
    "/admin/ai-assistant":           "ai_assistant",
    "/admin/knowledge-base":         "knowledge_base",
    "/admin/setup":                  "setup_wizard",
    "/admin/notifications":          "notifications",
    "/admin/access-control":         "access_control",
    "/admin/users":                  "users",
    "/admin/settings":               "settings",
    "/tech":                         "tech_dashboard",
    "/tech/sync":                    "tech_sync",
  };

  if (exact[p]) return exact[p];

  // Prefix pattern matches (most specific first)
  if (/^\/admin\/invoices\/\d+/.test(p))              return "invoice_detail";
  if (/^\/admin\/repair-quotes\/\d+/.test(p))         return "quote_detail";
  if (/^\/admin\/quotes\/\d+/.test(p))                return "quote_detail";
  if (/^\/admin\/approved-work\/\d+/.test(p))         return "approved_work";
  if (/^\/admin\/parts-requests\/\d+/.test(p))        return "parts_requests";
  if (/^\/admin\/purchase-orders\/\d+/.test(p))       return "purchase_orders";
  if (/^\/admin\/service-agreements\/\d+/.test(p))    return "service_agreements";
  if (/^\/admin\/jobs\/\d+/.test(p))                  return "job_detail";
  if (/^\/admin\/inspection-templates\/\d+/.test(p))  return "inspection_templates";
  if (/^\/tech\/jobs\/\d+\/device\/\d+/.test(p))      return "tech_device_test";
  if (/^\/tech\/deficiency\//.test(p))                return "tech_deficiency_editor";
  if (/^\/tech\/jobs\/\d+/.test(p))                   return "tech_job_detail";

  return null;
}
