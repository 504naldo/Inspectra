import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

export default function EquipmentKnowledgeList() {
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [deviceType, setDeviceType] = useState("");

  const { data: models, refetch } = trpc.knowledgeEquipment.listModels.useQuery(undefined, {
    enabled: !!user?.companyId,
  });

  const createModel = trpc.knowledgeEquipment.createModel.useMutation({
    onSuccess: () => {
      toast.success("Equipment model saved");
      setAddOpen(false);
      setManufacturer(""); setModel(""); setDeviceType("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!user || !user.companyId) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Equipment Knowledge</h1>
            <p className="text-muted-foreground">Manufacturer manuals, classified and reviewed per equipment model.</p>
          </div>
          <Button onClick={() => setAddOpen(true)}>Add equipment model</Button>
        </div>

        {(models?.length ?? 0) === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No equipment models yet</CardTitle>
              <CardDescription>
                Register a manufacturer and model, then upload its manual to build a reviewable knowledge page.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(models ?? []).map((m) => (
            <Link key={m.id} href={`/admin/equipment-knowledge/${m.id}`}>
              <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">{m.manufacturer} {m.model}</CardTitle>
                  {m.deviceType && <CardDescription>{m.deviceType}</CardDescription>}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add equipment model</DialogTitle>
            <DialogDescription>Register a manufacturer + model. Re-adding an existing pair just reopens it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Manufacturer</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Simplex" />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 4100ES" />
            </div>
            <div>
              <Label>Device type (optional)</Label>
              <Input value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="e.g. Fire alarm panel" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!manufacturer.trim() || !model.trim() || createModel.isPending}
              onClick={() => createModel.mutate({
                manufacturer: manufacturer.trim(),
                model: model.trim(),
                deviceType: deviceType.trim() || undefined,
              })}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
