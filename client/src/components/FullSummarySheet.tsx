import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/utils";
import type { SiteSummary } from "../../../drizzle/schema";

interface FullSummarySheetProps {
  site: { id: number; name: string; summary?: SiteSummary | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function FullSummarySheet({ site, open, onOpenChange }: FullSummarySheetProps) {
  const [servicingHours, setServicingHours] = useState("");

  useEffect(() => {
    if (!open || !site) return;
    setServicingHours(site.summary?.estimates?.servicingHours ?? "");
  }, [open, site]);

  const updateEstimate = trpc.site.updateEstimate.useMutation({
    onSuccess: () => toast.success("Servicing hours estimate saved"),
    onError: (err) => toast.error(friendlyErrorMessage(err, "Failed to save estimate")),
  });

  if (!site) return null;
  const s = site.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Full Summary Sheet — {site.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Client / Building</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client" value={s?.client?.name} />
              <Field label="Building" value={s?.building?.name} />
              <Field label="Year Built" value={s?.building?.year} />
              <Field label="Class" value={s?.building?.class} />
              <Field label="Stories" value={s?.building?.stories} />
            </div>
          </section>

          {(s?.address?.street || s?.address?.city) && (
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Site Address</p>
              <p className="text-sm">
                {[s?.address?.street, s?.address?.city, s?.address?.state, s?.address?.postalCode].filter(Boolean).join(", ")}
              </p>
            </section>
          )}

          {(s?.billing?.address || s?.billing?.city) && (
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Billing Address</p>
              <p className="text-sm">
                {[s?.billing?.address, s?.billing?.city, s?.billing?.state, s?.billing?.postalCode].filter(Boolean).join(", ")}
              </p>
            </section>
          )}

          {s?.contacts && s.contacts.length > 0 && (
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Contacts</p>
              <div className="space-y-2">
                {s.contacts.map((c, i) => (
                  (c.name || c.phone || c.email) && (
                    <div key={i} className="rounded-lg border p-2.5 text-sm">
                      <p className="font-medium">
                        {c.name}
                        {c.role && <span className="text-muted-foreground"> ({c.role})</span>}
                      </p>
                      {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
                      {c.email && <p className="text-muted-foreground">{c.email}</p>}
                    </div>
                  )
                ))}
              </div>
            </section>
          )}

          {(s?.monitoring?.company || s?.monitoring?.accountNumber) && (
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Monitoring</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company" value={s?.monitoring?.company} />
                <Field label="Account #" value={s?.monitoring?.accountNumber} />
                <Field label="Phone" value={s?.monitoring?.phone} />
                <Field label="Passcode" value={s?.monitoring?.password} />
              </div>
            </section>
          )}

          <section className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">Estimates</p>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Estimated Servicing Hours</Label>
                <div className="flex gap-2">
                  <Input value={servicingHours} onChange={(e) => setServicingHours(e.target.value)} />
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={updateEstimate.isPending}
                    onClick={() => updateEstimate.mutate({ id: site.id, servicingHours })}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Field label="Repair Budget (office)" value={s?.estimates?.repairBudget} />
            </div>
          </section>

          {s?.notes && (
            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
