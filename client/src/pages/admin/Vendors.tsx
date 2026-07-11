import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Store, Plus, Pencil, Mail, Phone, Globe, MapPin, ChevronDown, ChevronUp } from "lucide-react";

// ─── Vendor form ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  notes: "",
};

function VendorDialog({
  open,
  onClose,
  initial,
  onSave,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  initial?: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM);
  const f = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Company Name *</Label>
            <Input className="mt-1" value={form.name} onChange={f("name")} placeholder="e.g. FireParts Supply Co." />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input className="mt-1" value={form.contactName} onChange={f("contactName")} placeholder="Sales rep name" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input className="mt-1" value={form.phone} onChange={f("phone")} placeholder="(555) 000-0000" />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input type="email" className="mt-1" value={form.email} onChange={f("email")} placeholder="orders@vendor.com" />
          </div>
          <div className="col-span-2">
            <Label>Website</Label>
            <Input className="mt-1" value={form.website} onChange={f("website")} placeholder="https://vendor.com" />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Textarea className="mt-1" rows={2} value={form.address} onChange={f("address")} placeholder="123 Supply St, City, Province" />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={form.notes} onChange={f("notes")} placeholder="Lead times, account numbers, etc." />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.name.trim() || isPending}
            onClick={() => onSave(form)}
          >
            {initial ? "Save Changes" : "Add Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vendor row ───────────────────────────────────────────────────────────────

function VendorRow({ vendor, onEdit }: { vendor: any; onEdit: (v: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const deactivateMut = trpc.vendorPurchase.deactivateVendor.useMutation({
    onSuccess: () => {
      toast.success("Vendor deactivated.");
      utils.vendorPurchase.listVendors.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reactivateMut = trpc.vendorPurchase.reactivateVendor.useMutation({
    onSuccess: () => {
      toast.success("Vendor reactivated.");
      utils.vendorPurchase.listVendors.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className={`border rounded-lg bg-card ${!vendor.isActive ? "opacity-60" : ""}`}>
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <Store className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{vendor.name}</span>
            {!vendor.isActive && (
              <span className="text-xs bg-muted text-muted-foreground px-1.5 rounded">Inactive</span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-0.5 text-xs text-muted-foreground">
            {vendor.contactName && <span>{vendor.contactName}</span>}
            {vendor.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {vendor.phone}
              </span>
            )}
            {vendor.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {vendor.email}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t space-y-3 bg-muted/10 rounded-b-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {vendor.website && (
              <div className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <a
                  href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {vendor.website}
                </a>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-start gap-1">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{vendor.address}</span>
              </div>
            )}
            {vendor.notes && (
              <div className="col-span-2 mt-1">
                <span className="font-medium text-foreground">Notes: </span>
                <span className="whitespace-pre-wrap">{vendor.notes}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(vendor)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            {vendor.isActive ? (
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground"
                disabled={deactivateMut.isPending}
                onClick={() => deactivateMut.mutate({ id: vendor.id })}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={reactivateMut.isPending}
                onClick={() => reactivateMut.mutate({ id: vendor.id })}
              >
                Reactivate
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Vendors() {
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [editVendor, setEditVendor] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const { data: vendors = [], isLoading } = trpc.vendorPurchase.listVendors.useQuery({
    includeInactive: showInactive,
  });

  const createMut = trpc.vendorPurchase.createVendor.useMutation({
    onSuccess: () => {
      toast.success("Vendor added.");
      utils.vendorPurchase.listVendors.invalidate();
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.vendorPurchase.updateVendor.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated.");
      utils.vendorPurchase.listVendors.invalidate();
      setEditVendor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (vendors as any[]).filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.name?.toLowerCase().includes(q) ||
      v.contactName?.toLowerCase().includes(q) ||
      v.email?.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.notes?.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="Vendors">
      {/* Actions */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Vendor
        </Button>
        <div className="flex-1 min-w-[200px]">
          <Input
            className="h-8 text-sm"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <p className="text-muted-foreground text-sm">Loading vendors…</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Store className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {(vendors as any[]).length === 0
                ? "No vendors yet. Add your first vendor."
                : "No vendors match your search."}
            </p>
          </div>
        )}
        {filtered.map((v: any) => (
          <VendorRow key={v.id} vendor={v} onEdit={setEditVendor} />
        ))}
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="mt-4 text-xs text-muted-foreground text-right">
          {filtered.length} vendor{filtered.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Add dialog */}
      <VendorDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={(data) =>
          createMut.mutate({
            name: data.name.trim(),
            contactName: data.contactName.trim() || undefined,
            email: data.email.trim() || undefined,
            phone: data.phone.trim() || undefined,
            website: data.website.trim() || undefined,
            address: data.address.trim() || undefined,
            notes: data.notes.trim() || undefined,
          })
        }
        isPending={createMut.isPending}
      />

      {/* Edit dialog */}
      {editVendor && (
        <VendorDialog
          open={!!editVendor}
          onClose={() => setEditVendor(null)}
          initial={{
            name: editVendor.name,
            contactName: editVendor.contactName ?? "",
            email: editVendor.email ?? "",
            phone: editVendor.phone ?? "",
            website: editVendor.website ?? "",
            address: editVendor.address ?? "",
            notes: editVendor.notes ?? "",
          }}
          onSave={(data) =>
            updateMut.mutate({
              id: editVendor.id,
              name: data.name.trim(),
              contactName: data.contactName.trim() || null,
              email: data.email.trim() || null,
              phone: data.phone.trim() || null,
              website: data.website.trim() || null,
              address: data.address.trim() || null,
              notes: data.notes.trim() || null,
            })
          }
          isPending={updateMut.isPending}
        />
      )}
    </AdminLayout>
  );
}
