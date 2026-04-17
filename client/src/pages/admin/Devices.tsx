import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import {
  Search,
  AlertCircle,
  Pencil,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDevices() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;

  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit state
  const [editDevice, setEditDevice] = useState<any>(null);
  const [editDeviceType, setEditDeviceType] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerialNumber, setEditSerialNumber] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const { data: sites } = trpc.site.listByCompany.useQuery({ companyId });

  const { data: devices, isLoading, refetch } = trpc.device.listBySite.useQuery(
    { siteId: parseInt(selectedSiteId) },
    { enabled: selectedSiteId !== "all" && selectedSiteId !== "" }
  );

  const updateDevice = trpc.device.update.useMutation({
    onSuccess: () => {
      toast.success("Device updated");
      setEditDevice(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to update device"),
  });

  const filteredDevices = devices?.filter((device: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      device.deviceType.toLowerCase().includes(query) ||
      device.location?.toLowerCase().includes(query) ||
      device.manufacturer?.toLowerCase().includes(query) ||
      device.serialNumber?.toLowerCase().includes(query)
    );
  }) || [];

  function openEdit(device: any) {
    setEditDevice(device);
    setEditDeviceType(device.deviceType ?? "");
    setEditLocation(device.location ?? "");
    setEditManufacturer(device.manufacturer ?? "");
    setEditModel(device.model ?? "");
    setEditSerialNumber(device.serialNumber ?? "");
    setEditBarcode(device.barcode ?? "");
    setEditNotes(device.notes ?? "");
    setEditIsActive(device.isActive ?? true);
  }

  return (
    <AdminLayout title="Devices">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a site...</SelectItem>
              {sites?.map((site: any) => (
                <SelectItem key={site.id} value={site.id.toString()}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              disabled={selectedSiteId === "all"}
            />
          </div>
        </div>

        {/* Content */}
        {selectedSiteId === "all" ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a site to view devices</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No devices found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredDevices.map((device: any) => (
              <Card key={device.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{device.deviceType}</h3>
                      {device.location && (
                        <p className="text-sm text-muted-foreground truncate">{device.location}</p>
                      )}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {device.manufacturer && <p>Mfr: {device.manufacturer}</p>}
                        {device.model && <p>Model: {device.model}</p>}
                        {device.serialNumber && <p>S/N: {device.serialNumber}</p>}
                      </div>
                      <div className="mt-2">
                        <Badge variant={device.isActive ? "default" : "destructive"} className="text-xs">
                          {device.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(device)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Device Dialog */}
      <Dialog open={!!editDevice} onOpenChange={(open) => { if (!open) setEditDevice(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Device
            </DialogTitle>
            <DialogDescription>Update device metadata.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Device Type <span className="text-destructive">*</span></Label>
              <Input value={editDeviceType} onChange={(e) => setEditDeviceType(e.target.value)} placeholder="e.g. Smoke Detector" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Hallway — Unit 204" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input value={editManufacturer} onChange={(e) => setEditManufacturer(e.target.value)} placeholder="e.g. Kidde" />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="e.g. i4618" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Serial Number</Label>
                <Input value={editSerialNumber} onChange={(e) => setEditSerialNumber(e.target.value)} placeholder="S/N" />
              </div>
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <Input value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} placeholder="Barcode" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editIsActive ? "active" : "inactive"} onValueChange={(v) => setEditIsActive(v === "active")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditDevice(null)} disabled={updateDevice.isPending}>
                Cancel
              </Button>
              <Button
                disabled={!editDeviceType.trim() || updateDevice.isPending}
                onClick={() =>
                  updateDevice.mutate({
                    id: editDevice.id,
                    deviceType: editDeviceType.trim(),
                    location: editLocation || undefined,
                    manufacturer: editManufacturer || undefined,
                    model: editModel || undefined,
                    serialNumber: editSerialNumber || undefined,
                    barcode: editBarcode || undefined,
                    notes: editNotes || undefined,
                    isActive: editIsActive,
                  })
                }
              >
                {updateDevice.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Changes</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
