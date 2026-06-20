import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/utils";
import type { SiteSummary } from "../../../drizzle/schema";

type Contact = { name?: string; role?: string; phone?: string; email?: string };

interface SummarySheetEditorProps {
  site: { id: number; name: string; summary?: SiteSummary | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const emptyContact: Contact = { name: "", role: "", phone: "", email: "" };

export function SummarySheetEditor({ site, open, onOpenChange, onSaved }: SummarySheetEditorProps) {
  const [building, setBuilding] = useState({ year: "", class: "", stories: "" });
  const [billing, setBilling] = useState({ address: "", city: "", state: "", postalCode: "" });
  const [monitoring, setMonitoring] = useState({ company: "", accountNumber: "", phone: "", password: "" });
  const [estimates, setEstimates] = useState({ servicingHours: "", repairBudget: "" });
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (!open || !site) return;
    const s = site.summary;
    setBuilding({ year: s?.building?.year ?? "", class: s?.building?.class ?? "", stories: s?.building?.stories ?? "" });
    setBilling({
      address: s?.billing?.address ?? "",
      city: s?.billing?.city ?? "",
      state: s?.billing?.state ?? "",
      postalCode: s?.billing?.postalCode ?? "",
    });
    setMonitoring({
      company: s?.monitoring?.company ?? "",
      accountNumber: s?.monitoring?.accountNumber ?? "",
      phone: s?.monitoring?.phone ?? "",
      password: s?.monitoring?.password ?? "",
    });
    setEstimates({ servicingHours: s?.estimates?.servicingHours ?? "", repairBudget: s?.estimates?.repairBudget ?? "" });
    setContacts(s?.contacts?.length ? s.contacts.map((c) => ({ ...c })) : [{ ...emptyContact }]);
  }, [open, site]);

  const updateSummary = trpc.site.updateSummarySheet.useMutation({
    onSuccess: () => {
      toast.success("Summary Sheet updated");
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) => toast.error(friendlyErrorMessage(err, "Failed to update Summary Sheet — please contact support")),
  });

  if (!site) return null;

  const updateContact = (i: number, field: keyof Contact, value: string) => {
    setContacts(contacts.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  };

  const handleSave = () => {
    updateSummary.mutate({
      id: site.id,
      summary: {
        building,
        billing,
        monitoring,
        estimates,
        contacts: contacts.filter((c) => c.name?.trim() || c.phone?.trim() || c.email?.trim()),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Summary Sheet — {site.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Building Details</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Year Built</Label>
                <Input value={building.year} onChange={(e) => setBuilding({ ...building, year: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Class</Label>
                <Input value={building.class} onChange={(e) => setBuilding({ ...building, class: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stories</Label>
                <Input value={building.stories} onChange={(e) => setBuilding({ ...building, stories: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">Billing Address</p>
            <Input value={billing.address} onChange={(e) => setBilling({ ...billing, address: e.target.value })} placeholder="Street address" />
            <div className="grid grid-cols-3 gap-2">
              <Input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} placeholder="City" />
              <Input value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} placeholder="Province" />
              <Input value={billing.postalCode} onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })} placeholder="Postal Code" />
            </div>
          </section>

          <section className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">Monitoring</p>
            <div className="grid grid-cols-2 gap-2">
              <Input value={monitoring.company} onChange={(e) => setMonitoring({ ...monitoring, company: e.target.value })} placeholder="Monitoring company" />
              <Input value={monitoring.accountNumber} onChange={(e) => setMonitoring({ ...monitoring, accountNumber: e.target.value })} placeholder="Account #" />
              <Input value={monitoring.phone} onChange={(e) => setMonitoring({ ...monitoring, phone: e.target.value })} placeholder="Phone" />
              <Input value={monitoring.password} onChange={(e) => setMonitoring({ ...monitoring, password: e.target.value })} placeholder="Passcode" />
            </div>
          </section>

          <section className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">Estimates</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Estimated Servicing Hours</Label>
                <Input value={estimates.servicingHours} onChange={(e) => setEstimates({ ...estimates, servicingHours: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Repair Budget</Label>
                <Input value={estimates.repairBudget} onChange={(e) => setEstimates({ ...estimates, repairBudget: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Contacts</p>
              <Button variant="outline" size="sm" onClick={() => setContacts([...contacts, { ...emptyContact }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
              </Button>
            </div>
            <div className="space-y-3">
              {contacts.map((contact, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Contact {i + 1}</span>
                    {contacts.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setContacts(contacts.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={contact.name ?? ""} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="Name" />
                    <Input value={contact.role ?? ""} onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role/Position" />
                    <Input value={contact.phone ?? ""} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="Phone" />
                    <Input type="email" value={contact.email ?? ""} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="Email" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={updateSummary.isPending}>
              {updateSummary.isPending ? "Saving..." : "Save Summary Sheet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
