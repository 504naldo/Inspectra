import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  ShieldAlert, AlertTriangle, Info, CheckCircle2, ChevronDown, ChevronRight,
  Building2, Calendar, Wrench, ReceiptText, ExternalLink, RefreshCw, Users,
} from "lucide-react";

// ── Severity helpers ──────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  info:     "bg-blue-50 text-blue-700 border-blue-200",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  warning:  "bg-amber-500",
  info:     "bg-blue-400",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[severity]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {severity}
    </span>
  );
}

// ── Count chips ───────────────────────────────────────────────────────────────

function CountBadge({ count, severity }: { count: number; severity: Severity }) {
  if (count === 0) return null;
  return (
    <span className={`ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${SEVERITY_COLORS[severity]}`}>
      {count}
    </span>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title, icon: Icon, issueCount, severity, children, defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  issueCount: number;
  severity: Severity;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || issueCount > 0);

  return (
    <Card>
      <button
        className="w-full text-left"
        onClick={() => setOpen(o => !o)}
      >
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm">{title}</span>
            {issueCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 ml-1" />
            ) : (
              <CountBadge count={issueCount} severity={severity} />
            )}
            <span className="ml-auto">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </span>
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ── Issue group ───────────────────────────────────────────────────────────────

function IssueGroup({
  label, severity, items, renderItem,
}: {
  label: string;
  severity: Severity;
  items: unknown[];
  renderItem: (item: any, idx: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between py-1.5 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      </div>
    );
  }
  const shown = expanded ? items : items.slice(0, 5);
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        <SeverityBadge severity={severity} />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{items.length} issue{items.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-1 pl-2 border-l-2 border-muted ml-1">
        {shown.map((item, idx) => renderItem(item, idx))}
      </div>
      {items.length > 5 && (
        <button
          className="mt-1 text-xs text-muted-foreground hover:text-foreground pl-3"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? "Show less" : `Show ${items.length - 5} more…`}
        </button>
      )}
    </div>
  );
}

// ── Fix link helper ───────────────────────────────────────────────────────────

function FixLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href}>
      <span className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline cursor-pointer">
        {children ?? "Fix"}
        <ExternalLink className="h-3 w-3" />
      </span>
    </Link>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function SiteRow({ id, name }: { id: number; name: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80">{name}</span>
      <FixLink href={`/admin/sites`}>{`#${id}`}</FixLink>
    </div>
  );
}

function OrgRow({ id, name }: { id: number; name: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80">{name}</span>
      <FixLink href={`/admin/customers`}>{`#${id}`}</FixLink>
    </div>
  );
}

function WsiRow({ siteId, siteName }: { siteId: number; siteName: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80">{siteName}</span>
      <FixLink href={`/admin/sites/${siteId}/work-site-info`}>Fix</FixLink>
    </div>
  );
}

function TrackRow({ id, trackingMonth, serviceType, buildingId }: {
  id: number; trackingMonth: string; serviceType: string; buildingId: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80">
        {serviceType} — {trackingMonth}{buildingId ? ` (${buildingId})` : ""}
      </span>
      <FixLink href="/admin/schedule">Fix</FixLink>
    </div>
  );
}

function DefRow({ id, title, severity, daysOpen, jobId }: {
  id: number; title: string; severity: string; daysOpen: number; jobId: number;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs gap-2">
      <span className="truncate text-foreground/80 flex-1">{title}</span>
      <span className="shrink-0 text-muted-foreground">{daysOpen}d</span>
      <FixLink href={`/admin/jobs/${jobId}`}>Job</FixLink>
    </div>
  );
}

function AwRow({ id, approvedScope }: { id: number; approvedScope: string | null }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80">
        {approvedScope ? approvedScope.slice(0, 60) : `AW #${id}`}
      </span>
      <FixLink href={`/admin/approved-work/${id}`}>Fix</FixLink>
    </div>
  );
}

function InvRow({ id, invoiceNumber, total }: { id: number; invoiceNumber: string; total: string | null }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="truncate text-foreground/80 font-mono">{invoiceNumber}</span>
      {total && <span className="shrink-0 text-muted-foreground">${parseFloat(total).toFixed(2)}</span>}
      <FixLink href={`/admin/invoices/${id}`}>Fix</FixLink>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const SEVERITY_FILTERS: { label: string; value: Severity | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "Warning", value: "warning" },
  { label: "Info", value: "info" },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DataQuality() {
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  const { data, isLoading, isError, refetch, isFetching } = trpc.dataQuality.getSummary.useQuery(
    undefined,
    { staleTime: 60_000 },
  );

  const show = (s: Severity) => severityFilter === "all" || severityFilter === s;

  return (
    <AdminLayout title="Data Quality Center">
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Issues</p>
              <p className="text-2xl font-bold">{isLoading ? "—" : (data?.counts.total ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold text-red-600">{isLoading ? "—" : (data?.counts.critical ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Warning</p>
              <p className="text-2xl font-bold text-amber-600">{isLoading ? "—" : (data?.counts.warning ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Info</p>
              <p className="text-2xl font-bold text-blue-600">{isLoading ? "—" : (data?.counts.info ?? 0)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filter:</span>
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setSeverityFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                severityFilter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <Button
            variant="ghost" size="sm" className="ml-auto text-xs"
            onClick={() => refetch()} disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Error state */}
        {isError && (
          <Card>
            <CardContent className="py-10 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-400" />
              <p className="text-muted-foreground">Failed to load data quality summary.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-16" />
              </Card>
            ))}
          </div>
        )}

        {/* All-clear */}
        {!isLoading && !isError && data && data.counts.total === 0 && (
          <Card>
            <CardContent className="py-14 text-center">
              <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-semibold">All clear</p>
              <p className="text-sm text-muted-foreground mt-1">No data quality issues found.</p>
            </CardContent>
          </Card>
        )}

        {/* Sections */}
        {!isLoading && !isError && data && data.counts.total > 0 && (
          <div className="space-y-4">

            {/* ── Sites ── */}
            {(show("critical") || show("warning") || show("info")) && (
              <Section
                title="Sites"
                icon={Building2}
                issueCount={
                  (show("critical") ? data.sites.duplicateBuildingIds.length + data.sites.duplicateFileNumbers.length : 0) +
                  (show("warning") ? data.sites.missingBuildingId.length + data.sites.missingFileNumber.length + data.sites.missingContactInfo.length : 0) +
                  (show("info") ? data.sites.missingAddress.length + data.sites.missingCity.length : 0)
                }
                severity={data.sites.duplicateBuildingIds.length + data.sites.duplicateFileNumbers.length > 0 ? "critical" : "warning"}
              >
                {show("critical") && (
                  <>
                    <IssueGroup
                      label="Duplicate Building IDs"
                      severity="critical"
                      items={data.sites.duplicateBuildingIds}
                      renderItem={(item, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                          <span className="text-foreground/80">
                            <span className="font-mono">{item.buildingId}</span> — {item.names}
                          </span>
                          <FixLink href="/admin/sites">Fix</FixLink>
                        </div>
                      )}
                    />
                    <IssueGroup
                      label="Duplicate File Numbers"
                      severity="critical"
                      items={data.sites.duplicateFileNumbers}
                      renderItem={(item, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                          <span className="text-foreground/80">
                            <span className="font-mono">{item.fileNumber}</span> — {item.names}
                          </span>
                          <FixLink href="/admin/sites">Fix</FixLink>
                        </div>
                      )}
                    />
                  </>
                )}
                {show("warning") && (
                  <>
                    <IssueGroup label="Missing Building ID" severity="warning" items={data.sites.missingBuildingId}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                    <IssueGroup label="Missing File Number" severity="warning" items={data.sites.missingFileNumber}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                    <IssueGroup label="Missing Contact Info" severity="warning" items={data.sites.missingContactInfo}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                  </>
                )}
                {show("info") && (
                  <>
                    <IssueGroup label="Missing Address" severity="info" items={data.sites.missingAddress}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                    <IssueGroup label="Missing City" severity="info" items={data.sites.missingCity}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                  </>
                )}
              </Section>
            )}

            {/* ── Customer Orgs ── */}
            {(show("info") || show("warning")) && (
              <Section
                title="Customers"
                icon={Building2}
                issueCount={
                  (show("warning") ? data.customerOrgs.missingContactEmail.length : 0) +
                  (show("info") ? data.customerOrgs.missingContactPhone.length : 0)
                }
                severity="warning"
              >
                {show("warning") && (
                  <IssueGroup label="Missing Contact Email" severity="warning" items={data.customerOrgs.missingContactEmail}
                    renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                )}
                {show("info") && (
                  <IssueGroup label="Missing Contact Phone" severity="info" items={data.customerOrgs.missingContactPhone}
                    renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                )}
              </Section>
            )}

            {/* ── Contacts ── */}
            {(show("warning") || show("info")) && (
              <Section
                title="Contacts"
                icon={Users}
                issueCount={
                  (show("warning") ? (
                    data.contacts.orgsMissingPrimaryContact.length +
                    data.contacts.inactiveButFlagged.length +
                    data.contacts.orgsMissingReportRecipient.length +
                    data.contacts.orgsMissingBillingContact.length +
                    data.contacts.duplicateContactEmails.length
                  ) : 0) +
                  (show("info") ? (
                    data.contacts.sitesMissingSiteAccessContact.length +
                    data.contacts.orgsMissingQuoteApprover.length
                  ) : 0)
                }
                severity={
                  (data.contacts.orgsMissingPrimaryContact.length +
                   data.contacts.inactiveButFlagged.length +
                   data.contacts.orgsMissingReportRecipient.length +
                   data.contacts.orgsMissingBillingContact.length +
                   data.contacts.duplicateContactEmails.length) > 0 ? "warning" : "info"
                }
              >
                {show("warning") && (
                  <>
                    <IssueGroup label="Orgs missing primary contact" severity="warning" items={data.contacts.orgsMissingPrimaryContact}
                      renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                    <IssueGroup label="Orgs missing report recipient" severity="warning" items={data.contacts.orgsMissingReportRecipient}
                      renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                    <IssueGroup label="Orgs missing billing contact" severity="warning" items={data.contacts.orgsMissingBillingContact}
                      renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                    <IssueGroup label="Inactive contacts still flagged as recipients" severity="warning" items={data.contacts.inactiveButFlagged}
                      renderItem={(item, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                          <span className="truncate text-foreground/80">{item.name} <span className="text-muted-foreground">({item.role})</span></span>
                          <FixLink href="/admin/contacts">Fix</FixLink>
                        </div>
                      )} />
                    <IssueGroup label="Duplicate contact emails" severity="warning" items={data.contacts.duplicateContactEmails}
                      renderItem={(item, i) => (
                        <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                          <span className="truncate text-foreground/80 font-mono">{item.email}</span>
                          <span className="shrink-0 text-muted-foreground ml-2">{item.names}</span>
                        </div>
                      )} />
                  </>
                )}
                {show("info") && (
                  <>
                    <IssueGroup label="Sites missing site access contact" severity="info" items={data.contacts.sitesMissingSiteAccessContact}
                      renderItem={(item, i) => <SiteRow key={i} {...item} />} />
                    <IssueGroup label="Orgs missing quote approver" severity="info" items={data.contacts.orgsMissingQuoteApprover}
                      renderItem={(item, i) => <OrgRow key={i} {...item} />} />
                  </>
                )}
              </Section>
            )}

            {/* ── Work Site Info ── */}
            {(show("warning") || show("info")) && (
              <Section
                title="Work Site Info"
                icon={ShieldAlert}
                issueCount={
                  (show("warning") ? data.workSiteInfo.sitesMissingWsi.length : 0) +
                  (show("info") ? data.workSiteInfo.missingAccessNotes.length + data.workSiteInfo.missingPanelLocation.length + data.workSiteInfo.missingMonitoring.length : 0)
                }
                severity={data.workSiteInfo.sitesMissingWsi.length > 0 ? "warning" : "info"}
              >
                {show("warning") && (
                  <IssueGroup label="Sites missing Work Site Info" severity="warning" items={data.workSiteInfo.sitesMissingWsi}
                    renderItem={(item, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="truncate text-foreground/80">{item.name}</span>
                        <FixLink href={`/admin/sites/${item.id}/work-site-info`}>Add</FixLink>
                      </div>
                    )} />
                )}
                {show("info") && (
                  <>
                    <IssueGroup label="Missing Access Notes" severity="info" items={data.workSiteInfo.missingAccessNotes}
                      renderItem={(item, i) => <WsiRow key={i} {...item} />} />
                    <IssueGroup label="Missing Fire Alarm Panel Location" severity="info" items={data.workSiteInfo.missingPanelLocation}
                      renderItem={(item, i) => <WsiRow key={i} {...item} />} />
                    <IssueGroup label="Missing Monitoring Info" severity="info" items={data.workSiteInfo.missingMonitoring}
                      renderItem={(item, i) => <WsiRow key={i} {...item} />} />
                  </>
                )}
              </Section>
            )}

            {/* ── Monthly Tracking ── */}
            {show("warning") && (
              <Section
                title="Monthly Tracking"
                icon={Calendar}
                issueCount={data.schedule.overdueWithoutTech.length}
                severity="warning"
              >
                <IssueGroup label="Overdue items without assigned tech" severity="warning" items={data.schedule.overdueWithoutTech}
                  renderItem={(item, i) => <TrackRow key={i} {...item} />} />
              </Section>
            )}

            {/* ── Devices & Deficiencies ── */}
            {(show("critical") || show("warning") || show("info")) && (
              <Section
                title="Devices & Deficiencies"
                icon={Wrench}
                issueCount={
                  (show("critical") ? data.devicesAndDeficiencies.openDefs90 : 0) +
                  (show("warning") ? (data.devicesAndDeficiencies.openDefs60 - data.devicesAndDeficiencies.openDefs90) : 0) +
                  (show("info") ? data.devicesAndDeficiencies.devicesWithoutLocation.length + (data.devicesAndDeficiencies.openDefs30 - data.devicesAndDeficiencies.openDefs60) : 0)
                }
                severity={data.devicesAndDeficiencies.openDefs90 > 0 ? "critical" : data.devicesAndDeficiencies.openDefs60 > 0 ? "warning" : "info"}
              >
                {show("critical") && data.devicesAndDeficiencies.openDefs90 > 0 && (
                  <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <strong>{data.devicesAndDeficiencies.openDefs90}</strong> open deficiencie{data.devicesAndDeficiencies.openDefs90 !== 1 ? "s" : ""} older than 90 days — these need immediate attention.
                  </div>
                )}
                {(show("critical") || show("warning")) && data.devicesAndDeficiencies.oldestOpenDefs.length > 0 && (
                  <IssueGroup
                    label={`Open deficiencies > 30 days (${data.devicesAndDeficiencies.openDefs30} total)`}
                    severity={data.devicesAndDeficiencies.openDefs90 > 0 ? "critical" : "warning"}
                    items={data.devicesAndDeficiencies.oldestOpenDefs}
                    renderItem={(item, i) => <DefRow key={i} {...item} />}
                  />
                )}
                {show("info") && (
                  <IssueGroup label="Devices without location description" severity="info" items={data.devicesAndDeficiencies.devicesWithoutLocation}
                    renderItem={(item, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="truncate text-foreground/80">{item.deviceType} — Site #{item.siteId}</span>
                        <FixLink href={`/admin/sites`}>Fix</FixLink>
                      </div>
                    )} />
                )}
              </Section>
            )}

            {/* ── Approved Work & Invoices ── */}
            {(show("critical") || show("warning")) && (
              <Section
                title="Approved Work & Invoices"
                icon={ReceiptText}
                issueCount={
                  (show("critical") ? data.approvedWorkIssues.missingSite.length + data.approvedWorkIssues.missingCustomer.length + data.invoiceIssues.sageErrors.length : 0) +
                  (show("warning") ? data.approvedWorkIssues.completedNotInvoiced.length + data.invoiceIssues.missingCustomer.length + data.invoiceIssues.readyForSage.length : 0) +
                  (show("info") ? data.invoiceIssues.missingLineItems.length : 0)
                }
                severity={
                  (data.approvedWorkIssues.missingSite.length + data.approvedWorkIssues.missingCustomer.length + data.invoiceIssues.sageErrors.length) > 0
                    ? "critical"
                    : "warning"
                }
              >
                {show("critical") && (
                  <>
                    <IssueGroup label="Approved Work missing site" severity="critical" items={data.approvedWorkIssues.missingSite}
                      renderItem={(item, i) => <AwRow key={i} {...item} />} />
                    <IssueGroup label="Approved Work missing customer" severity="critical" items={data.approvedWorkIssues.missingCustomer}
                      renderItem={(item, i) => <AwRow key={i} {...item} />} />
                    <IssueGroup label="Sage export errors" severity="critical" items={data.invoiceIssues.sageErrors}
                      renderItem={(item, i) => <InvRow key={i} {...item} />} />
                  </>
                )}
                {show("warning") && (
                  <>
                    <IssueGroup label="Completed work not yet invoiced" severity="warning" items={data.approvedWorkIssues.completedNotInvoiced}
                      renderItem={(item, i) => <AwRow key={i} {...item} />} />
                    <IssueGroup label="Invoices missing customer" severity="warning" items={data.invoiceIssues.missingCustomer}
                      renderItem={(item, i) => <InvRow key={i} {...item} />} />
                    <IssueGroup label="Invoices ready for Sage export" severity="warning" items={data.invoiceIssues.readyForSage}
                      renderItem={(item, i) => <InvRow key={i} {...item} />} />
                  </>
                )}
                {show("info") && (
                  <IssueGroup label="Invoices with no line items ($0 total)" severity="info" items={data.invoiceIssues.missingLineItems}
                    renderItem={(item, i) => <InvRow key={i} {...item} />} />
                )}
              </Section>
            )}

          </div>
        )}
      </div>
    </AdminLayout>
  );
}
