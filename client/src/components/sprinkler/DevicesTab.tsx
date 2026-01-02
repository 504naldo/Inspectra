import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";

interface DevicesTabProps {
  inspectionId: number;
  isFinalized: boolean;
}

interface DeviceData {
  id?: number;
  deviceOrder: number;
  location: string | null;
  labelText: string | null;
  deviceType: string | null;
  address: string | null;
  zone: string | null;
  checkA: boolean | null;
  checkB: boolean | null;
  checkC: boolean | null;
  checkD: boolean | null;
  checkE: boolean | null;
  checkF: boolean | null;
  remarks: string | null;
}

const emptyDevice = (order: number): DeviceData => ({
  deviceOrder: order,
  location: null,
  labelText: null,
  deviceType: null,
  address: null,
  zone: null,
  checkA: false,
  checkB: false,
  checkC: false,
  checkD: false,
  checkE: false,
  checkF: false,
  remarks: null,
});

const deviceTypes = ["TS", "FS", "FPS", "LA", "PS", "TS/FS", "Other"];

export default function DevicesTab({ inspectionId, isFinalized }: DevicesTabProps) {
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [editingDevice, setEditingDevice] = useState<DeviceData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Load existing devices
  const { data: existingDevices, isLoading, refetch } = trpc.sprinkler.getDevices.useQuery(
    { inspectionId },
    { enabled: !!inspectionId }
  );

  useEffect(() => {
    if (existingDevices) {
      setDevices(existingDevices as DeviceData[]);
    }
  }, [existingDevices]);

  const saveDevices = trpc.sprinkler.upsertDevices.useMutation({
    onSuccess: () => {
      toast.success("Devices saved successfully");
      refetch();
    },
    onError: () => {
      toast.error("Failed to save devices");
    }
  });

  const deleteDevice = trpc.sprinkler.deleteDevice.useMutation({
    onSuccess: () => {
      toast.success("Device deleted");
      refetch();
    },
    onError: () => {
      toast.error("Failed to delete device");
    }
  });

  const handleSave = () => {
    saveDevices.mutate({
      inspectionId,
      devices: devices.map((d, idx) => ({
        ...d,
        deviceOrder: d.deviceOrder || idx + 1,
        location: d.location || undefined,
        labelText: d.labelText || undefined,
        deviceType: d.deviceType || undefined,
        address: d.address || undefined,
        zone: d.zone || undefined,
        checkA: d.checkA ?? undefined,
        checkB: d.checkB ?? undefined,
        checkC: d.checkC ?? undefined,
        checkD: d.checkD ?? undefined,
        checkE: d.checkE ?? undefined,
        checkF: d.checkF ?? undefined,
        remarks: d.remarks || undefined,
      })),
    });
  };

  const openEditDialog = (device: DeviceData, index: number) => {
    setEditingDevice({ ...device });
    setEditingIndex(index);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    const nextOrder = devices.length > 0 ? Math.max(...devices.map(d => d.deviceOrder)) + 1 : 1;
    setEditingDevice(emptyDevice(nextOrder));
    setEditingIndex(null);
    setIsDialogOpen(true);
  };

  const handleSaveDevice = () => {
    if (!editingDevice) return;

    if (editingIndex !== null) {
      // Update existing
      setDevices(prev => {
        const updated = [...prev];
        updated[editingIndex] = editingDevice;
        return updated;
      });
    } else {
      // Add new
      setDevices(prev => [...prev, editingDevice]);
    }

    setIsDialogOpen(false);
    setEditingDevice(null);
    setEditingIndex(null);
  };

  const handleDeleteDevice = (index: number) => {
    const device = devices[index];
    if (device.id) {
      deleteDevice.mutate({ id: device.id });
    }
    setDevices(prev => prev.filter((_, i) => i !== index));
  };

  const updateEditingDevice = (field: keyof DeviceData, value: any) => {
    if (!editingDevice) return;
    setEditingDevice({ ...editingDevice, [field]: value });
  };

  const missingLocationCount = devices.filter(d => !d.location).length;

  if (isLoading) {
    return <div className="text-center py-8">Loading devices...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sprinkler Devices</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Device inventory with required location field
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isFinalized && (
                <Button onClick={openAddDialog} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Device
                </Button>
              )}
              <Button onClick={handleSave} disabled={isFinalized || saveDevices.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save All
              </Button>
            </div>
          </div>
          {missingLocationCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 p-3 rounded-md mt-3">
              <AlertCircle className="h-4 w-4" />
              <span>
                {missingLocationCount} device{missingLocationCount > 1 ? 's' : ''} missing location (required to finalize)
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No devices added yet. Click "Add Device" to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Location</TableHead>
                    <TableHead>Label/LCD</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="text-center">A</TableHead>
                    <TableHead className="text-center">B</TableHead>
                    <TableHead className="text-center">C</TableHead>
                    <TableHead className="text-center">D</TableHead>
                    <TableHead className="text-center">E</TableHead>
                    <TableHead className="text-center">F</TableHead>
                    <TableHead>Remarks</TableHead>
                    {!isFinalized && <TableHead className="w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device, index) => (
                    <TableRow key={index} className={!device.location ? "bg-red-50" : ""}>
                      <TableCell className="font-medium">
                        {device.location || (
                          <span className="text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Required
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{device.labelText || '-'}</TableCell>
                      <TableCell>{device.deviceType || '-'}</TableCell>
                      <TableCell>{device.address || '-'}</TableCell>
                      <TableCell>{device.zone || '-'}</TableCell>
                      <TableCell className="text-center">
                        {device.checkA ? '✓' : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        {device.checkB ? '✓' : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        {device.checkC ? '✓' : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        {device.checkD ? '✓' : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        {device.checkE ? '✓' : ''}
                      </TableCell>
                      <TableCell className="text-center">
                        {device.checkF ? '✓' : ''}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {device.remarks || '-'}
                      </TableCell>
                      {!isFinalized && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(device, index)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDevice(index)}
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? 'Edit Device' : 'Add Device'}
            </DialogTitle>
          </DialogHeader>
          {editingDevice && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="location">
                  Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="location"
                  value={editingDevice.location || ''}
                  onChange={(e) => updateEditingDevice('location', e.target.value)}
                  placeholder="e.g., Main Floor, Parkade Level 1"
                  className={!editingDevice.location ? "border-red-500" : ""}
                />
                {!editingDevice.location && (
                  <p className="text-xs text-red-600 mt-1">Location is required</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="labelText">Label/LCD Text</Label>
                  <Input
                    id="labelText"
                    value={editingDevice.labelText || ''}
                    onChange={(e) => updateEditingDevice('labelText', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="deviceType">Device Type</Label>
                  <select
                    id="deviceType"
                    value={editingDevice.deviceType || ''}
                    onChange={(e) => updateEditingDevice('deviceType', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select type...</option>
                    {deviceTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={editingDevice.address || ''}
                    onChange={(e) => updateEditingDevice('address', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="zone">Zone</Label>
                  <Input
                    id="zone"
                    value={editingDevice.zone || ''}
                    onChange={(e) => updateEditingDevice('zone', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Checks</Label>
                <div className="grid grid-cols-6 gap-4">
                  {['A', 'B', 'C', 'D', 'E', 'F'].map(check => (
                    <div key={check} className="flex items-center space-x-2">
                      <Checkbox
                        id={`check${check}`}
                        checked={editingDevice[`check${check}` as keyof DeviceData] as boolean || false}
                        onCheckedChange={(checked) => updateEditingDevice(`check${check}` as keyof DeviceData, checked)}
                      />
                      <Label htmlFor={`check${check}`} className="cursor-pointer">
                        {check}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={editingDevice.remarks || ''}
                  onChange={(e) => updateEditingDevice('remarks', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDevice} disabled={!editingDevice.location}>
                  {editingIndex !== null ? 'Update' : 'Add'} Device
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
