/**
 * Centralized permission map for Inspectra.
 *
 * Rules:
 * - Permissions are grouped by module.
 * - ROLE_PERMISSIONS is the single source of truth for what each role can do.
 * - hasPermission() is safe to call on both client and server.
 * - Backend procedures must call requirePermission() (server/permissions.ts)
 *   for sensitive operations — never rely solely on frontend hiding.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = "admin" | "office" | "technician" | "customer";

export type Permission =
  // Operations
  | "jobs.view"
  | "jobs.create"
  | "jobs.update"
  | "jobs.assign"
  | "jobs.complete"
  | "jobs.finalize"
  | "schedule.view"
  | "schedule.manage"
  | "workOrders.view"
  | "workOrders.manage"
  | "approvedWork.view"
  | "approvedWork.manage"
  // Customers / Sites
  | "customers.view"
  | "customers.manage"
  | "sites.view"
  | "sites.manage"
  | "customerRecords.view"
  | "agreements.view"
  | "agreements.manage"
  // Reports & Compliance
  | "reports.view"
  | "reports.generate"
  | "reports.qa"
  | "reports.approve"
  | "reports.send"
  | "compliance.view"
  | "documents.view"
  | "documents.manage"
  | "dataQuality.view"
  // Financial
  | "invoices.view"
  | "invoices.create"
  | "invoices.update"
  | "invoices.export"
  | "quotes.view"
  | "quotes.manage"
  | "purchaseOrders.view"
  | "purchaseOrders.manage"
  // Payroll & Time
  | "payroll.viewOwn"
  | "payroll.submitOwn"
  | "payroll.review"
  | "payroll.approve"
  | "payroll.export"
  | "timesheets.view"
  | "timesheets.manage"
  | "availability.viewOwn"
  | "availability.manage"
  // Field / Inventory
  | "devices.view"
  | "devices.manage"
  | "deficiencies.view"
  | "deficiencies.manage"
  | "inventory.view"
  | "inventory.manage"
  | "partsRequests.view"
  | "partsRequests.manage"
  | "vendors.view"
  | "vendors.manage"
  // AI
  | "ai.use"
  | "ai.technicianFeatures"
  | "ai.adminFeatures"
  | "ai.knowledgeManage"
  // System / Admin
  | "users.manage"
  | "settings.view"
  | "settings.manage"
  | "imports.manage"
  | "notifications.view"
  | "accessControl.view"
  | "accessControl.manage";

// ─── Module grouping for the UI ───────────────────────────────────────────────

export type PermissionModule = {
  label: string;
  permissions: Partial<Record<Permission, string>>;
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    label: "Operations",
    permissions: {
      "jobs.view": "View jobs",
      "jobs.create": "Create jobs",
      "jobs.update": "Edit jobs",
      "jobs.assign": "Assign technicians",
      "jobs.complete": "Complete jobs",
      "jobs.finalize": "Finalize / lock jobs",
      "schedule.view": "View schedule",
      "schedule.manage": "Manage schedule",
      "workOrders.view": "View work orders",
      "workOrders.manage": "Manage work orders",
      "approvedWork.view": "View approved work",
      "approvedWork.manage": "Manage approved work",
    },
  },
  {
    label: "Customers & Sites",
    permissions: {
      "customers.view": "View customers",
      "customers.manage": "Manage customers",
      "sites.view": "View sites",
      "sites.manage": "Manage sites",
      "customerRecords.view": "View customer records",
      "agreements.view": "View service agreements",
      "agreements.manage": "Manage service agreements",
    },
  },
  {
    label: "Reports & Compliance",
    permissions: {
      "reports.view": "View reports",
      "reports.generate": "Generate reports",
      "reports.qa": "Perform report QA",
      "reports.approve": "Approve reports",
      "reports.send": "Send reports to customers",
      "compliance.view": "View compliance dashboard",
      "documents.view": "View documents",
      "documents.manage": "Upload / manage documents",
      "dataQuality.view": "View data quality",
    },
  },
  {
    label: "Financial",
    permissions: {
      "invoices.view": "View invoices",
      "invoices.create": "Create invoices",
      "invoices.update": "Edit invoices",
      "invoices.export": "Export invoices (Sage)",
      "quotes.view": "View quotes",
      "quotes.manage": "Create / manage quotes",
      "purchaseOrders.view": "View purchase orders",
      "purchaseOrders.manage": "Manage purchase orders",
    },
  },
  {
    label: "Payroll & Time",
    permissions: {
      "payroll.viewOwn": "View own payroll hours",
      "payroll.submitOwn": "Submit own payroll hours",
      "payroll.review": "Review all payroll",
      "payroll.approve": "Approve payroll entries",
      "payroll.export": "Export payroll data",
      "timesheets.view": "View timesheets",
      "timesheets.manage": "Manage timesheets",
      "availability.viewOwn": "View own availability / time off",
      "availability.manage": "Manage team availability",
    },
  },
  {
    label: "Field & Inventory",
    permissions: {
      "devices.view": "View devices",
      "devices.manage": "Manage devices",
      "deficiencies.view": "View deficiencies",
      "deficiencies.manage": "Create / edit deficiencies",
      "inventory.view": "View inventory",
      "inventory.manage": "Manage inventory",
      "partsRequests.view": "View parts requests",
      "partsRequests.manage": "Manage parts requests",
      "vendors.view": "View vendors",
      "vendors.manage": "Manage vendors",
    },
  },
  {
    label: "AI Assistant",
    permissions: {
      "ai.use": "Use AI assistant",
      "ai.technicianFeatures": "Technician AI features (deficiency drafts)",
      "ai.adminFeatures": "Admin AI features (QA review, summaries)",
      "ai.knowledgeManage": "Manage knowledge base",
    },
  },
  {
    label: "System",
    permissions: {
      "users.manage": "Manage users",
      "settings.view": "View company settings",
      "settings.manage": "Edit company settings",
      "imports.manage": "Run imports",
      "notifications.view": "View notifications",
      "accessControl.view": "View access control",
      "accessControl.manage": "Manage access control",
    },
  },
];

// ─── Role → permissions map ───────────────────────────────────────────────────

const ADMIN_PERMISSIONS: Permission[] = [
  "jobs.view", "jobs.create", "jobs.update", "jobs.assign", "jobs.complete", "jobs.finalize",
  "schedule.view", "schedule.manage",
  "workOrders.view", "workOrders.manage",
  "approvedWork.view", "approvedWork.manage",
  "customers.view", "customers.manage",
  "sites.view", "sites.manage",
  "customerRecords.view",
  "agreements.view", "agreements.manage",
  "reports.view", "reports.generate", "reports.qa", "reports.approve", "reports.send",
  "compliance.view",
  "documents.view", "documents.manage",
  "dataQuality.view",
  "invoices.view", "invoices.create", "invoices.update", "invoices.export",
  "quotes.view", "quotes.manage",
  "purchaseOrders.view", "purchaseOrders.manage",
  "payroll.viewOwn", "payroll.submitOwn", "payroll.review", "payroll.approve", "payroll.export",
  "timesheets.view", "timesheets.manage",
  "availability.viewOwn", "availability.manage",
  "devices.view", "devices.manage",
  "deficiencies.view", "deficiencies.manage",
  "inventory.view", "inventory.manage",
  "partsRequests.view", "partsRequests.manage",
  "vendors.view", "vendors.manage",
  "ai.use", "ai.technicianFeatures", "ai.adminFeatures", "ai.knowledgeManage",
  "users.manage",
  "settings.view", "settings.manage",
  "imports.manage",
  "notifications.view",
  "accessControl.view", "accessControl.manage",
];

const OFFICE_PERMISSIONS: Permission[] = [
  "jobs.view", "jobs.create", "jobs.update", "jobs.assign", "jobs.complete",
  "schedule.view", "schedule.manage",
  "workOrders.view", "workOrders.manage",
  "approvedWork.view", "approvedWork.manage",
  "customers.view", "customers.manage",
  "sites.view", "sites.manage",
  "customerRecords.view",
  "agreements.view", "agreements.manage",
  "reports.view", "reports.generate", "reports.qa", "reports.approve", "reports.send",
  "compliance.view",
  "documents.view", "documents.manage",
  "dataQuality.view",
  "invoices.view", "invoices.create", "invoices.update", "invoices.export",
  "quotes.view", "quotes.manage",
  "purchaseOrders.view", "purchaseOrders.manage",
  "payroll.viewOwn", "payroll.submitOwn", "payroll.review", "payroll.approve", "payroll.export",
  "timesheets.view", "timesheets.manage",
  "availability.viewOwn", "availability.manage",
  "devices.view", "devices.manage",
  "deficiencies.view", "deficiencies.manage",
  "inventory.view", "inventory.manage",
  "partsRequests.view", "partsRequests.manage",
  "vendors.view", "vendors.manage",
  "ai.use", "ai.adminFeatures", "ai.knowledgeManage",
  "settings.view",
  "imports.manage",
  "notifications.view",
  "accessControl.view",
];

const TECHNICIAN_PERMISSIONS: Permission[] = [
  "jobs.view", "jobs.update", "jobs.complete",
  "devices.view",
  "deficiencies.view", "deficiencies.manage",
  "reports.view",
  "payroll.viewOwn", "payroll.submitOwn",
  "availability.viewOwn",
  "notifications.view",
  "ai.use", "ai.technicianFeatures",
];

const CUSTOMER_PERMISSIONS: Permission[] = [
  // Customer portal is not active. No permissions granted.
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ADMIN_PERMISSIONS,
  office: OFFICE_PERMISSIONS,
  technician: TECHNICIAN_PERMISSIONS,
  customer: CUSTOMER_PERMISSIONS,
};

// ─── Role metadata for the UI ─────────────────────────────────────────────────

export type RoleMeta = {
  role: Role;
  label: string;
  description: string;
  color: string;
  active: boolean;
};

export const ROLE_META: RoleMeta[] = [
  {
    role: "admin",
    label: "Admin",
    description: "Full access to all modules, settings, and user management.",
    color: "bg-red-100 text-red-800 border-red-200",
    active: true,
  },
  {
    role: "office",
    label: "Office",
    description:
      "Operations, scheduling, reports, financial, payroll review. Cannot manage users or system settings.",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    active: true,
  },
  {
    role: "technician",
    label: "Technician",
    description:
      "Assigned jobs, inspections, deficiencies, own payroll hours and time off. No financial or admin access.",
    color: "bg-green-100 text-green-800 border-green-200",
    active: true,
  },
  {
    role: "customer",
    label: "Customer",
    description:
      "Customer portal (currently disabled). No access to internal routes.",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    active: false,
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

export function hasPermission(
  user: { role: string },
  permission: Permission,
): boolean {
  const perms = ROLE_PERMISSIONS[user.role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

// ─── Company-scoped per-role overrides ────────────────────────────────────────

/** Roles a company admin may customize. `admin` is the platform operator and is
 *  never overridable (it always keeps every permission — prevents self-lockout). */
export const OVERRIDABLE_ROLES: Role[] = ["office", "technician", "customer"];

export function isRoleOverridable(role: string): role is Exclude<Role, "admin"> {
  return (OVERRIDABLE_ROLES as string[]).includes(role);
}

/** A single company override: for `role`, `permission` is explicitly allowed/denied. */
export type PermissionOverride = { role: Role; permission: Permission; allowed: boolean };

/**
 * Permissions whose per-role override is ENFORCED server-side today (via
 * requireCompanyPermission at the relevant endpoints). Editing any permission
 * persists, but only these currently change what a role can actually do; the UI
 * badges them so admins aren't misled. Grown incrementally as more endpoints
 * adopt requireCompanyPermission.
 */
export const ENFORCED_PERMISSIONS: Permission[] = [
  "reports.approve",
  "ai.knowledgeManage",
];

/**
 * Effective permission = baseline ROLE_PERMISSIONS, adjusted by a company's
 * overrides. `admin` is never overridden. No matching override → baseline, so
 * behaviour is identical to hasPermission() when a company has set nothing.
 * Safe on client and server.
 */
export function resolvePermission(
  role: string,
  permission: Permission,
  overrides: PermissionOverride[] | undefined,
): boolean {
  if (role === "admin") return hasPermission({ role }, permission);
  if (overrides && overrides.length > 0) {
    // Last match wins (callers pass at most one per role+permission).
    for (let i = overrides.length - 1; i >= 0; i--) {
      const o = overrides[i];
      if (o.role === role && o.permission === permission) return o.allowed;
    }
  }
  return hasPermission({ role }, permission);
}
