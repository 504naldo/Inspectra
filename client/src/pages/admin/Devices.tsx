import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { findDuplicateGroups, removableDuplicateIds } from "@/lib/deviceDuplicates";
import { Search, AlertCircle, Pencil, Save, Loader2, GripVertical, RotateCcw, Copy, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function floorSortKey(floor: string | null | undefined): number {
  if (!floor) return -Infinity;
  const s = floor.trim().toUpperCase();
  if (s === "ROOF") return Infinity;
  if (s === "BASEMENT") return -9999;
  if (/^B\d+$/.test(s)) return -(parseInt(s.slice(1)) || 1);
  const n = parseInt(s);
  if (!isNaN(n)) return n;
  return -Infinity;
}

function applySort<T extends { id: number; floor?: string | null; sortOrder?: number | null }>(items: T[]): T[] {
  const hasManualOrder = items.some((d) => d.sortOrder != null);
  if (hasManualOrder) {
    return [...items].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
  }
  return [...items].sort((a, b) => floorSortKey(b.floor) - floorSortKey(a.floor));
}

// ─── SortableRow ──────────────────────────────────────────────────────────────

function SortableDeviceRow({
  device,
  onEdit,
}: {
  device: any;
  onEdit: (d: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: device.id });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="border-b hover:bg-muted/30 transition-colors text-sm"
    >
      <td className="px-2 py-2 w-8">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-3 py-2 text-muted-foreground font-mono text-xs w-16">
        {device.floor || <span className="text-muted-foreground/30">—</span>}
      </td>
      <td className="px-3 py-2 font-medium max-w-[10rem] truncate">{device.deviceType}</td>
      <td className="px-3 py-2 text-muted-foreground max-w-[12rem] truncate">
        {device.location || <span className="text-muted-foreground/30">—</span>}
      </td>
      <td className="hidden md:table-cell px-3 py-2 text-muted-foreground text-xs max-w-[8rem] truncate">
        {device.manufacturer || <span className="text-muted-foreground/30">—</span>}
      </td>
      <td className="hidden lg:table-cell px-3 py-2 text-muted-foreground text-xs max-w-[8rem] truncate">
        {device.serialNumber || <span className="text-muted-foreground/30">—</span>}
      </td>
      <td className="px-3 py-2">
        <Badge variant={device.isActive ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
          {device.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-2 py-2">
        <button
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          onClick={() => onEdit(device)}
          title="Edit device"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDevices() {
  const { user } = useAuth();

  if (!user || !user.companyId) {
    return (
      <AdminLayout title="Devices">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Loading session...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const companyId = user.companyId;

  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [localOrder, setLocalOrder] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [editDevice, setEditDevice] = useState<any>(null);
  const [editDeviceType, setEditDeviceType] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editSerialNumber, setEditSerialNumber] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // Duplicate-removal mode (for cleaning up devices added during mapping).
  const [dupMode, setDupMode] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const { data: sites } = trpc.site.listByCompany.useQuery({ companyId });
  const { data: devices, isLoading, refetch } = trpc.device.listBySite.useQuery(
    { siteId: parseInt(selectedSiteId) },
    { enabled: selectedSiteId !== "all" && selectedSiteId !== "" }
  );

  const reorder = trpc.device.reorder.useMutation({
    onSuccess: () => { toast.success("Order saved"); setIsDirty(false); refetch(); },
    onError: () => toast.error("Failed to save order"),
  });

  const clearSort = trpc.device.clearSortOrder.useMutation({
    onSuccess: () => { toast.success("Sort order reset"); setIsDirty(false); refetch(); },
    onError: () => toast.error("Failed to reset order"),
  });

  const updateDevice = trpc.device.update.useMutation({
    onSuccess: () => { toast.success("Device updated"); setEditDevice(null); refetch(); },
    onError: (err) => toast.error(err.message || "Failed to update device"),
  });

  const removeOne = trpc.device.update.useMutation({
    onSuccess: () => { toast.success("Device removed"); setRemoveTarget(null); refetch(); },
    onError: (err) => toast.error(err.message || "Failed to remove device"),
  });

  const bulkRemove = trpc.device.bulkSoftDelete.useMutation({
    onSuccess: (r) => {
      toast.success(`Removed ${r.removed} duplicate${r.removed === 1 ? "" : "s"}`);
      setConfirmBulk(false);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to remove duplicates"),
  });

  // Duplicate groups among the current site's active devices.
  const dupGroups = useMemo(() => findDuplicateGroups(devices ?? []), [devices]);
  const removableIds = useMemo(() => removableDuplicateIds(dupGroups), [dupGroups]);

  useEffect(() => {
    if (devices) {
      setLocalOrder(applySort(devices));
      setIsDirty(false);
    }
  }, [devices]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder((prev) => {
      const oldIdx = prev.findIndex((d) => d.id === active.id);
      const newIdx = prev.findIndex((d) => d.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    setIsDirty(true);
  };

  const hasManualOrder = devices?.some((d: any) => d.sortOrder != null) ?? false;

  const filteredDevices = localOrder.filter((device: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      device.deviceType?.toLowerCase().includes(q) ||
      device.location?.toLowerCase().includes(q) ||
      device.manufacturer?.toLowerCase().includes(q) ||
      device.serialNumber?.toLowerCase().includes(q)
    );
  });

  function openEdit(device: any) {
    setEditDevice(device);
    setEditDeviceType(device.deviceType ?? "");
    setEditLocation(device.location ?? "");
    setEditFloor(device.floor ?? "");
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
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedSiteId} onValueChange={(v) => { setSelectedSiteId(v); setIsDirty(false); setDupMode(false); }}>
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

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              disabled={selectedSiteId === "all"}
            />
          </div>

          {isDirty && (
            <Button
              size="sm"
              onClick={() => reorder.mutate({ orderedIds: localOrder.map((d) => d.id) })}
              disabled={reorder.isPending}
            >
              {reorder.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Order
            </Button>
          )}
          {hasManualOrder && !isDirty && selectedSiteId !== "all" && !dupMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => clearSort.mutate({ siteId: parseInt(selectedSiteId) })}
              disabled={clearSort.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reset Order
            </Button>
          )}
          {selectedSiteId !== "all" && !isLoading && (
            dupMode ? (
              <Button size="sm" variant="outline" onClick={() => setDupMode(false)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> All devices
              </Button>
            ) : (
              <Button
                size="sm"
                variant={dupGroups.length > 0 ? "default" : "outline"}
                onClick={() => setDupMode(true)}
                disabled={dupGroups.length === 0}
                title={dupGroups.length === 0 ? "No duplicate devices detected" : "Review and remove duplicate devices"}
              >
                <Copy className="h-4 w-4 mr-2" />
                {dupGroups.length > 0 ? `Find duplicates (${removableIds.length})` : "No duplicates"}
              </Button>
            )
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
        ) : dupMode ? (
          dupGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Copy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No duplicate devices found for this site.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-sm">
                  Found <strong>{removableIds.length}</strong> duplicate device
                  {removableIds.length === 1 ? "" : "s"} across <strong>{dupGroups.length}</strong> group
                  {dupGroups.length === 1 ? "" : "s"}. Removing keeps one device per group (marked{" "}
                  <span className="text-green-600 font-medium">Keep</span>); the rest are marked inactive and
                  drop off the inspection report.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmBulk(true)}
                  disabled={bulkRemove.isPending}
                >
                  {bulkRemove.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing…</>
                  ) : (
                    <><Trash2 className="h-4 w-4 mr-2" />Remove all extras ({removableIds.length})</>
                  )}
                </Button>
              </div>

              {dupGroups.map((group) => {
                const keeper = group.devices.find((x) => x.id === group.keeperId)!;
                const label = [keeper.deviceType, keeper.location, keeper.floor].filter(Boolean).join(" · ");
                return (
                  <div key={group.signature} className="rounded-lg border overflow-hidden">
                    <div className="bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
                      {label || "Device"} — {group.devices.length} copies
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {group.devices.map((dev) => {
                          const isKeeper = dev.id === group.keeperId;
                          return (
                            <tr key={dev.id} className="border-t hover:bg-muted/30 text-sm">
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs w-16">
                                {dev.floor || <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-3 py-2 font-medium max-w-[10rem] truncate">{dev.deviceType}</td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[12rem] truncate">
                                {dev.location || <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="hidden md:table-cell px-3 py-2 text-muted-foreground text-xs max-w-[8rem] truncate">
                                {dev.serialNumber || <span className="text-muted-foreground/30">—</span>}
                              </td>
                              <td className="px-3 py-2 w-20">
                                {isKeeper ? (
                                  <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1.5 py-0">Keep</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Duplicate</Badge>
                                )}
                              </td>
                              <td className="px-2 py-2 w-10 text-right">
                                {!isKeeper && (
                                  <button
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                                    onClick={() => setRemoveTarget(dev)}
                                    title="Remove this duplicate"
                                    disabled={removeOne.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredDevices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No devices found</p>
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/80 border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 w-8" />
                    <th className="px-3 py-2 text-left font-semibold w-16">Floor</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Location</th>
                    <th className="hidden md:table-cell px-3 py-2 text-left font-semibold">Manufacturer</th>
                    <th className="hidden lg:table-cell px-3 py-2 text-left font-semibold">Serial #</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={filteredDevices.map((d: any) => d.id)} strategy={verticalListSortingStrategy}>
                    {filteredDevices.map((device: any) => (
                      <SortableDeviceRow key={device.id} device={device} onEdit={openEdit} />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </div>
          </DndContext>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Hallway — Unit 204" />
              </div>
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Input value={editFloor} onChange={(e) => setEditFloor(e.target.value)} placeholder="e.g. 3, Roof, B1" />
              </div>
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
                    floor: editFloor || undefined,
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

      {/* Confirm single duplicate removal */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (
                <>
                  “{[removeTarget.deviceType, removeTarget.location, removeTarget.floor].filter(Boolean).join(" · ")}”
                  will be marked inactive and removed from the inspection report. You can re-activate it later by
                  editing the device.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeOne.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeOne.mutate({ id: removeTarget.id, isActive: false })}
              disabled={removeOne.isPending}
            >
              {removeOne.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk removal of all extras */}
      <AlertDialog open={confirmBulk} onOpenChange={(open) => { if (!open) setConfirmBulk(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removableIds.length} duplicate device{removableIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              One device is kept in each of the {dupGroups.length} group{dupGroups.length === 1 ? "" : "s"}; the
              other {removableIds.length} {removableIds.length === 1 ? "copy is" : "copies are"} marked inactive and
              removed from the inspection report. This can be undone by re-activating a device from its edit screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkRemove.mutate({ deviceIds: removableIds })}
              disabled={bulkRemove.isPending || removableIds.length === 0}
            >
              {bulkRemove.isPending ? "Removing…" : `Remove ${removableIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
