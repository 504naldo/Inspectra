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
import { useState, useEffect } from "react";
import {
  Search,
  AlertCircle,
  Pencil,
  Save,
  Loader2,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Floor sort helpers ───────────────────────────────────────────────────────

function floorSortKey(floor: string | null | undefined): number {
  if (!floor) return Number.NEGATIVE_INFINITY;
  const s = floor.trim().toLowerCase();
  if (s === "roof" || s.startsWith("penthouse") || s.startsWith("ph")) return Number.POSITIVE_INFINITY;
  if (s === "basement") return -9999;
  const bMatch = /^b(\d+)$/.exec(s);
  if (bMatch) return -parseInt(bMatch[1], 10);
  if (s === "b") return -1;
  const numMatch = /^(\d+)/.exec(s);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
}

function defaultSort(items: any[]): any[] {
  return [...items].sort((a, b) => floorSortKey(b.floor) - floorSortKey(a.floor));
}

function applySort(items: any[]): any[] {
  const hasManualOrder = items.some((d) => d.sortOrder != null);
  if (hasManualOrder) {
    return [...items].sort((a, b) => {
      if (a.sortOrder == null && b.sortOrder == null) return 0;
      if (a.sortOrder == null) return 1;
      if (b.sortOrder == null) return -1;
      return a.sortOrder - b.sortOrder;
    });
  }
  return defaultSort(items);
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  device,
  onEdit,
}: {
  device: any;
  onEdit: (d: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: device.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b last:border-0 hover:bg-muted/40 group"
    >
      <td className="pl-2 pr-1 py-2 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-3 py-2 text-sm font-mono text-muted-foreground w-16 shrink-0">
        {device.floor ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm font-medium">{device.deviceType}</td>
      <td className="px-3 py-2 text-sm text-muted-foreground max-w-[220px] truncate">
        {device.location ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground hidden md:table-cell">
        {device.manufacturer ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-muted-foreground font-mono hidden lg:table-cell">
        {device.serialNumber ?? "—"}
      </td>
      <td className="px-3 py-2 w-20">
        <Badge
          variant={device.isActive ? "default" : "destructive"}
          className="text-xs"
        >
          {device.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-2 py-2 w-9">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onEdit(device)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDevices() {
  const { user } = useAuth();
  const companyId = user?.companyId || 1;

  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [localOrder, setLocalOrder] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);

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

  const reorderMutation = trpc.device.reorder.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      refetch();
    },
    onError: () => toast.error("Failed to save order"),
  });

  const clearSortMutation = trpc.device.clearSortOrder.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      refetch();
    },
    onError: () => toast.error("Failed to reset order"),
  });

  const updateDevice = trpc.device.update.useMutation({
    onSuccess: () => {
      toast.success("Device updated");
      setEditDevice(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to update device"),
  });

  // Sync localOrder whenever fresh data arrives
  useEffect(() => {
    if (devices) {
      setLocalOrder(applySort(devices));
      setIsDirty(false);
    }
  }, [devices]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder((prev) => {
      const oldIndex = prev.findIndex((d) => d.id === active.id);
      const newIndex = prev.findIndex((d) => d.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setIsDirty(true);
  }

  function saveOrder() {
    reorderMutation.mutate({ orderedIds: localOrder.map((d) => d.id) });
  }

  function resetOrder() {
    clearSortMutation.mutate({ siteId: parseInt(selectedSiteId) });
  }

  const filteredDevices = localOrder.filter((device: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      device.deviceType.toLowerCase().includes(q) ||
      device.location?.toLowerCase().includes(q) ||
      device.manufacturer?.toLowerCase().includes(q) ||
      device.serialNumber?.toLowerCase().includes(q) ||
      device.floor?.toLowerCase().includes(q)
    );
  });

  const hasManualOrder = (devices ?? []).some((d: any) => d.sortOrder != null);

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
      <div className="space-y-4">
        {/* Filters + actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={selectedSiteId} onValueChange={(v) => { setSelectedSiteId(v); setIsDirty(false); }}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select a site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a site…</SelectItem>
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
              placeholder="Search devices…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              disabled={selectedSiteId === "all"}
            />
          </div>

          {isDirty && (
            <Button onClick={saveOrder} disabled={reorderMutation.isPending} className="shrink-0">
              {reorderMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Save Order</>
              )}
            </Button>
          )}

          {hasManualOrder && !isDirty && selectedSiteId !== "all" && (
            <Button
              variant="outline"
              onClick={resetOrder}
              disabled={clearSortMutation.isPending}
              className="shrink-0"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Order
            </Button>
          )}
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
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="pl-2 pr-1 py-2 w-8" />
                    <th className="px-3 py-2 text-left w-16">Floor</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Location</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Manufacturer</th>
                    <th className="px-3 py-2 text-left hidden lg:table-cell">Serial #</th>
                    <th className="px-3 py-2 text-left w-20">Status</th>
                    <th className="px-2 py-2 w-9" />
                  </tr>
                </thead>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={filteredDevices.map((d: any) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {filteredDevices.map((device: any) => (
                        <SortableRow key={device.id} device={device} onEdit={openEdit} />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
            {isDirty && (
              <div className="px-4 py-2 bg-amber-50 border-t text-xs text-amber-700 flex items-center gap-2">
                <span>Order changed — click <strong>Save Order</strong> to persist.</span>
              </div>
            )}
            {hasManualOrder && !isDirty && (
              <div className="px-4 py-2 bg-muted/30 border-t text-xs text-muted-foreground">
                Showing manual order — <button className="underline hover:text-foreground" onClick={resetOrder}>reset to floor sort</button>
              </div>
            )}
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
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal notes…" rows={2} />
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
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
