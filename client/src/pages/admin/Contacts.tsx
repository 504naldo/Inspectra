import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users,
  Mail,
  Phone,
  Plus,
  Edit2,
  UserX,
  Star,
  Building2,
  MapPin,
  FileText,
  Receipt,
  Wrench,
  Key,
  AlertTriangle,
  Search,
  Loader2,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTACT_ROLES = [
  { value: "property_manager",  label: "Property Manager" },
  { value: "strata_manager",    label: "Strata Manager" },
  { value: "building_manager",  label: "Building Manager" },
  { value: "site_contact",      label: "Site Contact" },
  { value: "billing_contact",   label: "Billing Contact" },
  { value: "quote_approver",    label: "Quote Approver" },
  { value: "report_recipient",  label: "Report Recipient" },
  { value: "emergency_contact", label: "Emergency Contact" },
  { value: "tenant_contact",    label: "Tenant Contact" },
  { value: "other",             label: "Other" },
] as const;

const PREFERRED_METHODS = [
  { value: "email",  label: "Email" },
  { value: "phone",  label: "Phone" },
  { value: "mobile", label: "Mobile" },
  { value: "none",   label: "No Preference" },
  { value: "other",  label: "Other" },
] as const;

type ContactRole = typeof CONTACT_ROLES[number]["value"];
type PreferredMethod = typeof PREFERRED_METHODS[number]["value"];

const ROLE_LABELS: Record<ContactRole, string> = Object.fromEntries(
  CONTACT_ROLES.map((r) => [r.value, r.label])
) as Record<ContactRole, string>;

const ROLE_COLORS: Record<ContactRole, string> = {
  property_manager:  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  strata_manager:    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  building_manager:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  site_contact:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  billing_contact:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  quote_approver:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  report_recipient:  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  emergency_contact: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tenant_contact:    "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  other:             "bg-muted text-muted-foreground",
};

// ── Empty form ────────────────────────────────────────────────────────────────

type ContactForm = {
  customerOrgId: string;
  siteId: string;
  name: string;
  title: string;
  companyName: string;
  email: string;
  phone: string;
  mobile: string;
  role: ContactRole;
  isPrimary: boolean;
  receivesReports: boolean;
  receivesQuotes: boolean;
  receivesInvoices: boolean;
  receivesServiceUpdates: boolean;
  receivesComplianceNotices: boolean;
  isSiteAccessContact: boolean;
  preferredMethod: PreferredMethod;
  notes: string;
};

function emptyForm(): ContactForm {
  return {
    customerOrgId: "",
    siteId: "",
    name: "",
    title: "",
    companyName: "",
    email: "",
    phone: "",
    mobile: "",
    role: "other",
    isPrimary: false,
    receivesReports: false,
    receivesQuotes: false,
    receivesInvoices: false,
    receivesServiceUpdates: false,
    receivesComplianceNotices: false,
    isSiteAccessContact: false,
    preferredMethod: "email",
    notes: "",
  };
}

// ── Overview stat card ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  colorClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass ?? "bg-primary/10"}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Contact form dialog ───────────────────────────────────────────────────────

function ContactDialog({
  open,
  onClose,
  initial,
  contactId,
  customers,
  sites,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ContactForm;
  contactId?: number;
  customers: Array<{ id: number; name: string }>;
  sites: Array<{ id: number; name: string; customerOrgId: number | null }>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ContactForm>(initial);
  const utils = trpc.useUtils();

  const create = trpc.contact.createContact.useMutation({
    onSuccess: () => { toast.success("Contact created"); utils.contact.listContacts.invalidate(); utils.contact.getOverviewStats.invalidate(); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message || "Failed to create contact"),
  });
  const update = trpc.contact.updateContact.useMutation({
    onSuccess: () => { toast.success("Contact updated"); utils.contact.listContacts.invalidate(); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message || "Failed to update contact"),
  });

  const isPending = create.isPending || update.isPending;

  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k: keyof ContactForm) => (v: boolean) => setForm((f) => ({ ...f, [k]: v }));

  // Filter sites to match selected customer
  const filteredSites = form.customerOrgId
    ? sites.filter((s) => String(s.customerOrgId) === form.customerOrgId)
    : sites;

  function handleSubmit() {
    const payload = {
      customerOrgId: form.customerOrgId ? Number(form.customerOrgId) : null,
      siteId: form.siteId ? Number(form.siteId) : null,
      name: form.name.trim(),
      title: form.title.trim() || null,
      companyName: form.companyName.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      role: form.role,
      isPrimary: form.isPrimary,
      receivesReports: form.receivesReports,
      receivesQuotes: form.receivesQuotes,
      receivesInvoices: form.receivesInvoices,
      receivesServiceUpdates: form.receivesServiceUpdates,
      receivesComplianceNotices: form.receivesComplianceNotices,
      isSiteAccessContact: form.isSiteAccessContact,
      preferredMethod: form.preferredMethod,
      notes: form.notes.trim() || null,
    };

    if (contactId) {
      update.mutate({ id: contactId, ...payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPending) { if (!o) onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contactId ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={set("name")} placeholder="Full name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={set("title")} placeholder="e.g. Property Manager" />
            </div>
            <div className="space-y-1">
              <Label>Company</Label>
              <Input value={form.companyName} onChange={set("companyName")} placeholder="Company name" />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1">
            <Label>Role <span className="text-destructive">*</span></Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as ContactRole }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Linked to */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Customer</Label>
              <Select
                value={form.customerOrgId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, customerOrgId: v === "none" ? "" : v, siteId: "" }))}
              >
                <SelectTrigger><SelectValue placeholder="Any customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not linked —</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Site</Label>
              <Select
                value={form.siteId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, siteId: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Any site" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Not linked —</SelectItem>
                  {filteredSites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact info */}
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="contact@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="Office phone" />
            </div>
            <div className="space-y-1">
              <Label>Mobile</Label>
              <Input type="tel" value={form.mobile} onChange={set("mobile")} placeholder="Mobile" />
            </div>
          </div>

          {/* Preferred method */}
          <div className="space-y-1">
            <Label>Preferred Contact Method</Label>
            <Select value={form.preferredMethod} onValueChange={(v) => setForm((f) => ({ ...f, preferredMethod: v as PreferredMethod }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PREFERRED_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Flags */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient Flags</p>
            {([
              ["isPrimary",                "Primary contact for this customer/site"],
              ["receivesReports",          "Receives inspection reports"],
              ["receivesQuotes",           "Receives / approves repair quotes"],
              ["receivesInvoices",         "Receives invoices (billing)"],
              ["receivesServiceUpdates",   "Receives service call updates"],
              ["receivesComplianceNotices","Receives compliance notices"],
              ["isSiteAccessContact",      "Site access contact (visible to technicians)"],
            ] as [keyof ContactForm, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={!!form[key]}
                  onCheckedChange={toggle(key)}
                />
                <label htmlFor={key} className="text-sm cursor-pointer">{label}</label>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} placeholder="Access hours, best time to call, etc." rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{contactId ? "Saving…" : "Creating…"}</> : (contactId ? "Save Changes" : "Add Contact")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Contact card row ──────────────────────────────────────────────────────────

function ContactRow({
  contact,
  customers,
  sites,
  onEdit,
  onDeactivate,
  onSetPrimary,
  onReactivate,
}: {
  contact: any;
  customers: Array<{ id: number; name: string }>;
  sites: Array<{ id: number; name: string }>;
  onEdit: () => void;
  onDeactivate: () => void;
  onSetPrimary: () => void;
  onReactivate: () => void;
}) {
  const customer = customers.find((c) => c.id === contact.customerOrgId);
  const site = sites.find((s) => s.id === contact.siteId);
  const role = contact.role as ContactRole;

  return (
    <div className={`rounded-lg border p-4 space-y-2 ${contact.isActive === 0 ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{contact.name}</span>
            {contact.isPrimary === 1 && (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" title="Primary contact" />
            )}
            <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[role] ?? ""}`}>
              {ROLE_LABELS[role] ?? role}
            </Badge>
            {contact.isActive === 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
            )}
          </div>

          {contact.title && (
            <p className="text-xs text-muted-foreground">{contact.title}{contact.companyName ? ` · ${contact.companyName}` : ""}</p>
          )}

          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
            {contact.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
              </span>
            )}
            {contact.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                {contact.phone}
              </span>
            )}
          </div>

          {(customer || site) && (
            <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
              {customer && (
                <Link href={`/admin/customers`}>
                  <span className="flex items-center gap-1 hover:text-foreground cursor-pointer">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {customer.name}
                  </span>
                </Link>
              )}
              {site && (
                <Link href={`/admin/sites`}>
                  <span className="flex items-center gap-1 hover:text-foreground cursor-pointer">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {site.name}
                  </span>
                </Link>
              )}
            </div>
          )}

          {/* Recipient badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.receivesReports === 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 rounded px-1.5 py-0.5 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800">
                <FileText className="h-2.5 w-2.5" />Reports
              </span>
            )}
            {contact.receivesInvoices === 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                <Receipt className="h-2.5 w-2.5" />Invoices
              </span>
            )}
            {contact.receivesQuotes === 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                <Wrench className="h-2.5 w-2.5" />Quotes
              </span>
            )}
            {contact.isSiteAccessContact === 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                <Key className="h-2.5 w-2.5" />Site Access
              </span>
            )}
            {!contact.email && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800">
                <AlertTriangle className="h-2.5 w-2.5" />No email
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>
            <Edit2 className="h-3 w-3 mr-1" />Edit
          </Button>
          {contact.isActive !== 0 && (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onSetPrimary} disabled={contact.isPrimary === 1}>
                <Star className="h-3 w-3 mr-1" />Primary
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onDeactivate}>
                <UserX className="h-3 w-3 mr-1" />Deactivate
              </Button>
            </>
          )}
          {contact.isActive === 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReactivate}>
              <RefreshCw className="h-3 w-3 mr-1" />Reactivate
            </Button>
          )}
        </div>
      </div>

      {contact.notes && (
        <p className="text-xs text-muted-foreground italic border-t pt-1.5">{contact.notes}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterSite, setFilterSite] = useState<string>("all");
  const [filterRecipient, setFilterRecipient] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<any | null>(null);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.contact.getOverviewStats.useQuery();
  const { data: contacts = [], isLoading, refetch } = trpc.contact.listContacts.useQuery({
    role: filterRole !== "all" ? (filterRole as any) : undefined,
    customerOrgId: filterCustomer !== "all" ? Number(filterCustomer) : undefined,
    siteId: filterSite !== "all" ? Number(filterSite) : undefined,
    receivesReports: filterRecipient === "reports" ? true : undefined,
    receivesInvoices: filterRecipient === "invoices" ? true : undefined,
    receivesQuotes: filterRecipient === "quotes" ? true : undefined,
    activeOnly: !showInactive,
    search: search.trim() || undefined,
  });

  // Load customers and sites for dropdowns
  const { data: customerOrgs = [] } = trpc.customerOrg.list.useQuery(
    { companyId: 0 },
    { select: (d) => d }
  );
  // Use a simpler approach — fetch sites via a separate query if available
  // For now, extract unique sites from contacts to minimise extra queries
  const uniqueSiteIds = [...new Set(contacts.filter((c) => c.siteId).map((c) => c.siteId!))];

  const deactivate = trpc.contact.deactivateContact.useMutation({
    onSuccess: () => { toast.success("Contact deactivated"); utils.contact.listContacts.invalidate(); utils.contact.getOverviewStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reactivate = trpc.contact.reactivateContact.useMutation({
    onSuccess: () => { toast.success("Contact reactivated"); utils.contact.listContacts.invalidate(); utils.contact.getOverviewStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setPrimary = trpc.contact.setPrimaryContact.useMutation({
    onSuccess: () => { toast.success("Primary contact updated"); utils.contact.listContacts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function openAdd() {
    setEditContact(null);
    setDialogOpen(true);
  }

  function openEdit(c: any) {
    setEditContact(c);
    setDialogOpen(true);
  }

  const formInitial = editContact
    ? {
        customerOrgId: String(editContact.customerOrgId ?? ""),
        siteId: String(editContact.siteId ?? ""),
        name: editContact.name ?? "",
        title: editContact.title ?? "",
        companyName: editContact.companyName ?? "",
        email: editContact.email ?? "",
        phone: editContact.phone ?? "",
        mobile: editContact.mobile ?? "",
        role: editContact.role ?? "other",
        isPrimary: editContact.isPrimary === 1,
        receivesReports: editContact.receivesReports === 1,
        receivesQuotes: editContact.receivesQuotes === 1,
        receivesInvoices: editContact.receivesInvoices === 1,
        receivesServiceUpdates: editContact.receivesServiceUpdates === 1,
        receivesComplianceNotices: editContact.receivesComplianceNotices === 1,
        isSiteAccessContact: editContact.isSiteAccessContact === 1,
        preferredMethod: editContact.preferredMethod ?? "email",
        notes: editContact.notes ?? "",
      }
    : emptyForm();

  // Build lookup tables for display
  const customerMap = Object.fromEntries((customerOrgs as any[]).map((c: any) => [c.id, c]));
  const sitesFromContacts = contacts
    .filter((c) => c.siteId)
    .reduce<Record<number, { id: number; name: string; customerOrgId: number | null }>>((acc, c) => {
      if (c.siteId && !acc[c.siteId]) acc[c.siteId] = { id: c.siteId, name: `Site #${c.siteId}`, customerOrgId: c.customerOrgId };
      return acc;
    }, {});

  const customerList = (customerOrgs as any[]).map((c: any) => ({ id: c.id, name: c.name }));
  const siteList = Object.values(sitesFromContacts);

  return (
    <AdminLayout title="Contacts">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Contacts
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage customer and site contacts, roles, and recipient preferences.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>

        {/* Overview cards */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Users}    label="Active Contacts"    value={stats?.totalActive ?? 0} />
          <StatCard icon={FileText} label="Report Recipients"  value={stats?.reportRecipients ?? 0}  colorClass="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30" />
          <StatCard icon={Receipt}  label="Billing Contacts"   value={stats?.billingContacts ?? 0}   colorClass="bg-green-100 text-green-700 dark:bg-green-900/30" />
          <StatCard icon={Wrench}   label="Quote Approvers"    value={stats?.quoteApprovers ?? 0}    colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
          <StatCard icon={Key}      label="Site Access"        value={stats?.siteAccessContacts ?? 0} colorClass="bg-blue-100 text-blue-700 dark:bg-blue-900/30" />
          <StatCard icon={AlertTriangle} label="Missing Email" value={stats?.missingEmail ?? 0}      colorClass={stats?.missingEmail ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-muted"} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All roles" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {CONTACT_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All customers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customerList.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRecipient} onValueChange={setFilterRecipient}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Recipients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="reports">Receives Reports</SelectItem>
              <SelectItem value="invoices">Receives Invoices</SelectItem>
              <SelectItem value="quotes">Receives Quotes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
        </div>

        {/* Contact list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-12 text-center space-y-3">
            <Users className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">No contacts found</p>
            <p className="text-sm text-muted-foreground">Add contacts to manage who receives reports, invoices, and quotes.</p>
            <Button onClick={openAdd} className="mt-2">
              <Plus className="h-4 w-4 mr-2" />Add First Contact
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                customers={customerList}
                sites={siteList}
                onEdit={() => openEdit(c)}
                onDeactivate={() => deactivate.mutate({ id: c.id })}
                onReactivate={() => reactivate.mutate({ id: c.id })}
                onSetPrimary={() =>
                  setPrimary.mutate({
                    id: c.id,
                    customerOrgId: c.customerOrgId ?? undefined,
                    siteId: c.siteId ?? undefined,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit dialog */}
      {dialogOpen && (
        <ContactDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          initial={formInitial}
          contactId={editContact?.id}
          customers={customerList}
          sites={[...siteList, ...customerList.map((c) => ({ id: -c.id, name: c.name + " (no site)", customerOrgId: c.id }))]}
          onSaved={() => refetch()}
        />
      )}
    </AdminLayout>
  );
}
