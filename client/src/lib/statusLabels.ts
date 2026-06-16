// Centralized status label/color maps shared across pages so the same status
// value always renders with the same label and color, regardless of which
// screen displays it. Do NOT change underlying enum values here — these maps
// are presentation-only.

// ── Repair quotes (drizzle `quotes.status`) ───────────────────────────────────
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready_to_send: "Ready to Send",
  sent: "Sent",
  viewed: "Viewed",
  partially_approved: "Partially Approved",
  approved: "Approved",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted_to_approved_work: "Converted to Work",
  cancelled: "Cancelled",
};

export const QUOTE_STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  ready_to_send: "bg-violet-50 text-violet-700 border-violet-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  viewed: "bg-sky-50 text-sky-700 border-sky-200",
  partially_approved: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-orange-50 text-orange-700 border-orange-200",
  converted_to_approved_work: "bg-teal-50 text-teal-700 border-teal-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

export function getQuoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status] ?? status;
}

export function getQuoteStatusBadgeClass(status: string): string {
  return QUOTE_STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

// ── Deficiencies (drizzle `deficiencies.status`) ──────────────────────────────
export const DEFICIENCY_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  deferred: "Deferred",
  quoted: "Quoted",
};

export const DEFICIENCY_STATUS_BADGE_CLASS: Record<string, string> = {
  open: "status-fail",
  in_progress: "status-pending",
  resolved: "status-pass",
  closed: "status-pass",
  deferred: "status-na",
  quoted: "bg-accent/10 text-accent",
};

export function getDeficiencyStatusLabel(status: string): string {
  return DEFICIENCY_STATUS_LABELS[status] ?? status;
}

export function getDeficiencyStatusBadgeClass(status: string): string {
  return DEFICIENCY_STATUS_BADGE_CLASS[status] ?? "status-na";
}

// ── Jobs / Work Orders (share the same status enum) ───────────────────────────
export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const JOB_STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "status-na",
  scheduled: "bg-accent/10 text-accent",
  in_progress: "status-pending",
  completed: "status-pass",
  cancelled: "status-fail",
};

export function getJobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status] ?? status;
}

export function getJobStatusBadgeClass(status: string): string {
  return JOB_STATUS_BADGE_CLASS[status] ?? "status-na";
}

// ── Approved Work (drizzle `approved_work.status`) ────────────────────────────
export const APPROVED_WORK_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  ready_to_schedule: "Ready to Schedule",
  scheduled: "Scheduled",
  assigned: "Assigned",
  in_progress: "In Progress",
  parts_required: "Parts Required",
  awaiting_parts: "Awaiting Parts",
  parts_ordered: "Parts Ordered",
  parts_received: "Parts Received",
  completed: "Completed",
  report_pending: "Report Pending",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const APPROVED_WORK_STATUS_COLORS: Record<string, string> = {
  approved: "bg-blue-100 text-blue-700",
  ready_to_schedule: "bg-teal-100 text-teal-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  assigned: "bg-violet-100 text-violet-700",
  in_progress: "bg-amber-100 text-amber-700",
  parts_required: "bg-orange-100 text-orange-700",
  awaiting_parts: "bg-orange-100 text-orange-700",
  parts_ordered: "bg-yellow-100 text-yellow-700",
  parts_received: "bg-lime-100 text-lime-700",
  completed: "bg-green-100 text-green-700",
  report_pending: "bg-cyan-100 text-cyan-700",
  invoiced: "bg-emerald-100 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700",
};

export function getApprovedWorkStatusLabel(status: string): string {
  return APPROVED_WORK_STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getApprovedWorkStatusBadgeClass(status: string): string {
  return APPROVED_WORK_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
}

// ── Invoices (drizzle `invoices.status`) ──────────────────────────────────────
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  approved: "Approved",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  void: "Void",
};

export const INVOICE_STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  viewed: "bg-purple-50 text-purple-700 border-purple-200",
  approved: "bg-cyan-50 text-cyan-700 border-cyan-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  partial: "bg-yellow-50 text-yellow-700 border-yellow-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
  void: "bg-gray-50 text-gray-400 border-gray-200",
};

export function getInvoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}

export function getInvoiceStatusBadgeClass(status: string): string {
  return INVOICE_STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
}

// ── Job priority ──────────────────────────────────────────────────────────────
export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_BADGE_CLASS: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700 font-semibold",
};

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getPriorityBadgeClass(priority: string): string {
  return PRIORITY_BADGE_CLASS[priority] ?? "bg-gray-100 text-gray-500";
}

// ── Job type ──────────────────────────────────────────────────────────────────
export const JOB_TYPE_LABELS: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  service_call: "Service Call",
  repair: "Repair",
  emergency: "Emergency",
  sprinkler_itm: "Sprinkler ITM",
  fire_alarm: "Fire Alarm",
  backflow: "Backflow",
  special_hazard: "Special Hazard",
  extinguisher: "Extinguisher",
};

export function getJobTypeLabel(type: string): string {
  return JOB_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
