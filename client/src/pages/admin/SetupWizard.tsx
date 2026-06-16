import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Building2,
  Users,
  Package,
  FileText,
  ReceiptText,
  Clock,
  Bot,
  MapPin,
  Upload,
  Settings,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "not_started" | "in_progress" | "completed" | "skipped";

type StepData = {
  key: string;
  label: string;
  description: string;
  effectiveStatus: StepStatus;
  autoComplete: boolean;
};

// ─── Step config (icon + links + checklist) ───────────────────────────────────

type StepConfig = {
  icon: React.ElementType;
  links: { label: string; href: string }[];
  checklist: (data: OverviewData) => string[];
};

type OverviewData = any;

const STEP_CONFIGS: Record<string, StepConfig> = {
  company_profile: {
    icon: Building2,
    links: [{ label: "Company Settings", href: "/admin/settings" }],
    checklist: (d) => [
      d.company.name ? `Company name: ${d.company.name}` : "⚠ Company name not set",
      d.company.email ? `Email: ${d.company.email}` : "⚠ Company email not set",
      d.company.displayName ? `Display name: ${d.company.displayName}` : "Display name not set (optional)",
    ],
  },
  business_settings: {
    icon: Settings,
    links: [{ label: "Company Settings → Labour & Tax", href: "/admin/settings" }],
    checklist: (d) => [
      d.settings.techLabourRate ? `Technician rate: $${d.settings.techLabourRate}/hr` : "⚠ Technician labour rate not set",
      d.settings.invoiceDueDays !== null ? `Invoice due: ${d.settings.invoiceDueDays} days` : "Invoice due days: using default (30)",
      "GST and PST rates configurable in Settings → Tax",
    ],
  },
  users_roles: {
    icon: Users,
    links: [
      { label: "Users", href: "/admin/users" },
      { label: "Access Control", href: "/admin/access-control" },
    ],
    checklist: (d) => [
      d.counts.adminCount >= 1 ? `${d.counts.adminCount} admin(s) active` : "⚠ No admin users found",
      d.counts.officeCount > 0 ? `${d.counts.officeCount} office user(s)` : "No office users (optional)",
      d.counts.technicianCount >= 1 ? `${d.counts.technicianCount} technician(s) active` : "⚠ No technicians added",
      `${d.counts.totalUsers} total users, ${d.counts.activeUsers} active`,
    ],
  },
  customers_sites: {
    icon: MapPin,
    links: [
      { label: "Customers", href: "/admin/customers" },
      { label: "Sites", href: "/admin/sites" },
    ],
    checklist: (d) => [
      d.counts.customerCount > 0 ? `${d.counts.customerCount} customer org(s)` : "⚠ No customers added",
      d.counts.siteCount > 0 ? `${d.counts.siteCount} site(s)` : "⚠ No sites added",
    ],
  },
  imports: {
    icon: Upload,
    links: [
      { label: "Import Center", href: "/admin/imports" },
      { label: "Data Quality", href: "/admin/data-quality" },
    ],
    checklist: (d) => [
      d.counts.importCount > 0
        ? `${d.counts.importCount} import run(s) completed`
        : "No imports run yet — import devices, sites, or customers from CSV/Excel",
      "Check Data Quality after importing",
    ],
  },
  parts_inventory: {
    icon: Package,
    links: [
      { label: "Parts Catalog", href: "/admin/parts-catalog" },
      { label: "Inventory", href: "/admin/inventory" },
    ],
    checklist: (d) => [
      d.counts.partsCatalogCount > 0
        ? `${d.counts.partsCatalogCount} active parts catalog item(s)`
        : "⚠ Parts catalog is empty",
      d.counts.inventoryCount > 0
        ? `${d.counts.inventoryCount} inventory item(s)`
        : "No inventory items (can be set up later)",
    ],
  },
  reports_documents: {
    icon: FileText,
    links: [
      { label: "Reports", href: "/admin/reports" },
      { label: "Report QA", href: "/admin/report-qa" },
      { label: "Document Center", href: "/admin/documents" },
    ],
    checklist: (d) => [
      d.settings.reportFooter ? "Report footer text configured" : "Report footer not set (optional)",
      "Configure report footer in Settings → Reports",
      "Report QA workflows available after first inspection",
    ],
  },
  invoices_sage: {
    icon: ReceiptText,
    links: [
      { label: "Invoices", href: "/admin/invoices" },
      { label: "Company Settings → Invoices", href: "/admin/settings" },
    ],
    checklist: (d) => [
      d.settings.invoicePrefix && d.settings.invoicePrefix !== "INV"
        ? `Invoice prefix: ${d.settings.invoicePrefix}`
        : `Invoice prefix: ${d.settings.invoicePrefix ?? "INV"} (default)`,
      d.settings.sageGlCode ? `Sage GL code: ${d.settings.sageGlCode}` : "Sage GL code not set (optional if not using Sage)",
      `Invoice due: ${d.settings.invoiceDueDays ?? 30} days`,
    ],
  },
  payroll_time: {
    icon: Clock,
    links: [
      { label: "Payroll Hours", href: "/admin/payroll-hours" },
      { label: "Timesheets", href: "/admin/timesheets" },
    ],
    checklist: (d) => [
      d.settings.techLabourRate ? `Technician rate: $${d.settings.techLabourRate}/hr` : "⚠ Technician rate not configured",
      "Payroll review available at Payroll Review",
      "Availability / time off tracked per employee",
    ],
  },
  ai_knowledge: {
    icon: Bot,
    links: [
      { label: "AI Assistant", href: "/admin/ai-assistant" },
      { label: "Knowledge Base", href: "/admin/knowledge-base" },
    ],
    checklist: (d) => [
      d.counts.kbCount > 0
        ? `${d.counts.kbCount} knowledge base article(s)`
        : "No knowledge base articles yet",
      "Add site-specific or company-specific knowledge for the AI",
      "AI assistant available to office/admin users",
    ],
  },
  final_review: {
    icon: ShieldCheck,
    links: [
      { label: "Data Quality", href: "/admin/data-quality" },
      { label: "Access Control", href: "/admin/access-control" },
    ],
    checklist: () => [
      "Review all steps above are complete or intentionally skipped",
      "Check Data Quality for any critical data issues",
      "Confirm user roles and access control",
      "Mark setup complete when ready",
    ],
  },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, autoComplete }: { status: StepStatus; autoComplete: boolean }) {
  if (status === "completed") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3" />
        {autoComplete ? "Auto-detected" : "Complete"}
      </Badge>
    );
  }
  if (status === "skipped") {
    return <Badge variant="outline" className="text-xs text-muted-foreground">Skipped</Badge>;
  }
  if (status === "in_progress") {
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">In Progress</Badge>;
  }
  return <Badge variant="outline" className="text-xs text-muted-foreground">Not Started</Badge>;
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  data,
  isAdmin,
  onUpdate,
  isUpdating,
}: {
  step: StepData;
  index: number;
  data: OverviewData;
  isAdmin: boolean;
  onUpdate: (key: string, status: StepStatus) => void;
  isUpdating: boolean;
}) {
  const [expanded, setExpanded] = useState(
    step.effectiveStatus !== "completed" && step.effectiveStatus !== "skipped",
  );
  const config = STEP_CONFIGS[step.key];
  const Icon = config?.icon ?? Circle;
  const done = step.effectiveStatus === "completed" || step.effectiveStatus === "skipped";

  return (
    <Card className={`transition-all ${done ? "opacity-80" : ""}`}>
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"}`}>
            {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">{step.label}</CardTitle>
              <StatusBadge status={step.effectiveStatus} autoComplete={step.autoComplete} />
            </div>
            <CardDescription className="text-xs mt-0.5">{step.description}</CardDescription>
          </div>
          <div className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <Separator className="mb-3" />

          {/* Checklist */}
          <ul className="space-y-1 mb-4">
            {config?.checklist(data).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {item.startsWith("⚠") ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                )}
                <span className={item.startsWith("⚠") ? "text-amber-700" : "text-muted-foreground"}>
                  {item.replace(/^⚠ /, "")}
                </span>
              </li>
            ))}
          </ul>

          {/* Action links */}
          <div className="flex flex-wrap gap-2 mb-3">
            {config?.links.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ArrowRight className="h-3 w-3" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          {/* Admin actions */}
          {isAdmin && step.effectiveStatus !== "completed" && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                disabled={isUpdating}
                onClick={() => onUpdate(step.key, "completed")}
              >
                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                Mark Complete
              </Button>
              {step.effectiveStatus !== "skipped" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-muted-foreground"
                  disabled={isUpdating}
                  onClick={() => onUpdate(step.key, "skipped")}
                >
                  <SkipForward className="h-3 w-3" />
                  Skip
                </Button>
              )}
            </div>
          )}
          {isAdmin && step.effectiveStatus === "completed" && !step.autoComplete && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs text-muted-foreground"
                disabled={isUpdating}
                onClick={() => onUpdate(step.key, "not_started")}
              >
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetupWizard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.setup.getOverview.useQuery(undefined, {
    staleTime: 30_000,
  });

  const updateMutation = trpc.setup.updateStepStatus.useMutation({
    onSuccess: (_, { status }) => {
      utils.setup.getOverview.invalidate();
      toast.success(status === "completed" ? "Step marked complete" : status === "skipped" ? "Step skipped" : "Step updated");
    },
    onError: (e) => toast.error(e.message || "Failed to update step"),
  });

  const handleUpdate = (key: string, status: StepStatus) => {
    updateMutation.mutate({ stepKey: key as any, status });
  };

  if (isLoading || !data) {
    return (
      <AdminLayout title="Setup Wizard">
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const pct = Math.round((data.completedCount / data.totalSteps) * 100);

  return (
    <AdminLayout title="Setup Wizard">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header / progress */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">System Setup</h2>
                <p className="text-sm text-muted-foreground">
                  {data.completedCount} of {data.totalSteps} steps complete
                </p>
              </div>
              <div className="text-3xl font-bold text-primary">{pct}%</div>
            </div>
            <Progress value={pct} className="h-2" />
            {data.isComplete && (
              <div className="mt-3 flex items-center gap-2 text-sm text-green-700 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Setup is complete! Inspectra is fully configured.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step cards */}
        {data.steps.map((step, index) => (
          <StepCard
            key={step.key}
            step={step}
            index={index}
            data={data}
            isAdmin={isAdmin}
            onUpdate={handleUpdate}
            isUpdating={updateMutation.isPending}
          />
        ))}

        {/* Office-only note */}
        {!isAdmin && (
          <p className="text-xs text-center text-muted-foreground">
            Only admin users can mark steps complete or skip steps.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
