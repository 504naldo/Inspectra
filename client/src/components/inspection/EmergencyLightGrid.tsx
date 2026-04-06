import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { CheckToggle, type InspectionResult } from "./CheckToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCheck, Trash2, Plus } from "lucide-react";

interface EmergencyLightRow {
  id: number;
  deviceType: string;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  supplyVoltage?: string | null;
  modelWattage?: string | null;
  batteryYear?: string | null;
  batterySize?: string | null;
  batteryCount?: number | null;
  lampCount?: number | null;
  notes?: string | null;
  result?: InspectionResult;
}

interface EmergencyLightGridProps {
  jobId: number;
  siteId: number;
  companyId: number;
  devices: EmergencyLightRow[];
  isFinalized?: boolean;
  onResultChange?: (deviceId: number, result: InspectionResult) => void;
  carriedForwardDeviceIds?: Set<number>;
  onRefresh?: () => void;
}

interface EditState {
  deviceId: number;
  field: string;
  value: string;
}

const COL_HEADERS = [
  { key: "seq", label: "#", width: "w-8 min-w-[2rem]", sticky: true },
  { key: "location", label: "Location", width: "w-32 min-w-[8rem]" },
  { key: "deviceType", label: "Type", width: "w-24 min-w-[6rem]" },
  { key: "manufacturer", label: "Mfr", width: "w-24 min-w-[6rem]" },
  { key: "model", label: "Model", width: "w-24 min-w-[6rem]" },
  { key: "supplyVoltage", label: "Supply V", width: "w-20 min-w-[5rem]" },
  { key: "modelWattage", label: "Wattage", width: "w-20 min-w-[5rem]" },
  { key: "batteryYear", label: "Batt Yr", width: "w-16 min-w-[4rem]" },
  { key: "batterySize", label: "Batt Size", width: "w-20 min-w-[5rem]" },
  { key: "batteryCount", label: "Batt Qty", width: "w-16 min-w-[4rem]" },
  { key: "lampCount", label: "Lamps", width: "w-16 min-w-[4rem]" },
  { key: "result", label: "Result", width: "w-16 min-w-[4rem]", sticky: true, right: true },
];

const EDITABLE_FIELDS = [
  "location", "manufacturer", "model", "supplyVoltage", "modelWattage",
  "batteryYear", "batterySize", "batteryCount", "lampCount",
];

const TOTAL_COLS = COL_HEADERS.length + 1;

export function EmergencyLightGrid({
  jobId,
  siteId,
  companyId,
  devices,
  isFinalized,
  onResultChange,
  carriedForwardDeviceIds,
  onRefresh,
}: EmergencyLightGridProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [localResults, setLocalResults] = useState<Record<number, InspectionResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [addForm, setAddForm] = useState({ location: "", deviceType: "Emergency Light" });

  const upsertResult = trpc.inspectionResult.upsert.useMutation({
    onError: () => toast.error("Failed to save result"),
  });

  const updateDevice = trpc.device.technicianUpdate.useMutation({
    onError: () => toast.error("Failed to save field"),
  });

  const addDevice = trpc.device.addDuringInspection.useMutation({
    onSuccess: () => {
      toast.success("Device added");
      setShowAddRow(false);
      setAddForm({ location: "", deviceType: "Emergency Light" });
      onRefresh?.();
    },
    onError: (e) => toast.error(e.message || "Failed to add device"),
  });

  const softDelete = trpc.device.softDelete.useMutation({
    onSuccess: () => {
      toast.success("Device removed");
      setConfirmDeleteId(null);
      onRefresh?.();
    },
    onError: (e) => toast.error(e.message || "Failed to remove device"),
  });

  const handleResultChange = useCallback(
    (deviceId: number, result: InspectionResult) => {
      setLocalResults((prev) => ({ ...prev, [deviceId]: result }));
      upsertResult.mutate({ jobId, deviceId, result });
      onResultChange?.(deviceId, result);
    },
    [jobId, upsertResult, onResultChange]
  );

  const handleCellClick = (deviceId: number, field: string, currentValue: string) => {
    if (isFinalized || !EDITABLE_FIELDS.includes(field)) return;
    setEditing({ deviceId, field, value: currentValue ?? "" });
  };

  const handleEditBlur = () => {
    if (!editing) return;
    const { deviceId, field, value } = editing;
    const numericFields = ["batteryCount", "lampCount"];
    const fieldValue = value === "" ? undefined : numericFields.includes(field) ? Number(value) || undefined : value;
    updateDevice.mutate({ id: deviceId, [field]: fieldValue } as Parameters<typeof updateDevice.mutate>[0]);
    setEditing(null);
  };

  const getEffectiveResult = (device: EmergencyLightRow): InspectionResult => {
    return localResults[device.id] ?? device.result ?? "not_tested";
  };

  const handleAllPass = useCallback(() => {
    if (isFinalized) return;
    const updates: Record<number, InspectionResult> = {};
    devices.forEach((d) => { updates[d.id] = "pass"; });
    setLocalResults((prev) => ({ ...prev, ...updates }));
    devices.forEach((d) => {
      upsertResult.mutate({ jobId, deviceId: d.id, result: "pass" });
      onResultChange?.(d.id, "pass");
    });
    toast.success(`Marked ${devices.length} emergency light${devices.length !== 1 ? "s" : ""} as pass`);
  }, [devices, isFinalized, jobId, upsertResult, onResultChange]);

  const handleAddSubmit = () => {
    if (!addForm.location.trim() && !addForm.deviceType.trim()) {
      toast.error("Location or device type required");
      return;
    }
    addDevice.mutate({
      jobId,
      siteId,
      companyId,
      category: "EMERGENCY_LIGHT",
      deviceType: addForm.deviceType.trim() || "Emergency Light",
      location: addForm.location.trim() || undefined,
    });
  };

  return (
    <div>
      {!isFinalized && devices.length > 0 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleAllPass}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" /> All Pass
          </button>
        </div>
      )}
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/80 border-b">
            {COL_HEADERS.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-2 py-2 text-left font-semibold text-muted-foreground border-r last:border-r-0 whitespace-nowrap",
                  col.width,
                  col.sticky && col.right && "sticky right-0 bg-muted/80 border-l",
                  col.sticky && !col.right && "sticky left-0 bg-muted/80"
                )}
              >
                {col.label}
              </th>
            ))}
            {!isFinalized && <th className="w-8 min-w-[2rem] px-1 py-2 bg-muted/80" />}
          </tr>
        </thead>
        <tbody>
          {devices.map((device, idx) => {
            const result = getEffectiveResult(device);
            const rowBg =
              result === "pass"
                ? "bg-green-50 dark:bg-green-950/20"
                : result === "fail"
                ? "bg-red-50 dark:bg-red-950/20"
                : "";

            return (
              <tr key={device.id} className={cn("border-b hover:bg-muted/30 transition-colors", rowBg)}>
                {/* # */}
                <td className="sticky left-0 bg-inherit px-2 py-1.5 text-center text-muted-foreground border-r font-mono w-8">
                  {idx + 1}
                  {carriedForwardDeviceIds?.has(device.id) && (
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-blue-600 leading-none mt-0.5">carried</span>
                  )}
                </td>

                {(["location", "deviceType", "manufacturer", "model", "supplyVoltage", "modelWattage", "batteryYear", "batterySize", "batteryCount", "lampCount"] as const).map(
                  (field) => {
                    const isEditing = editing?.deviceId === device.id && editing?.field === field;
                    const raw = (device as any)[field];
                    const value = raw != null ? String(raw) : "";
                    const isReadOnly = field === "deviceType";

                    return (
                      <td
                        key={field}
                        className={cn(
                          "px-2 py-1.5 border-r max-w-[10rem]",
                          !isReadOnly && !isFinalized && "cursor-text hover:bg-primary/5"
                        )}
                        onClick={() => handleCellClick(device.id, field, value)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            type={["batteryCount", "lampCount"].includes(field) ? "number" : "text"}
                            className="w-full bg-transparent outline-none border-b border-primary text-xs"
                            value={editing.value}
                            onChange={(e) =>
                              setEditing((prev) => prev && { ...prev, value: e.target.value })
                            }
                            onBlur={handleEditBlur}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Tab") {
                                e.preventDefault();
                                handleEditBlur();
                              }
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                        ) : (
                          <span className="truncate block">{value || <span className="text-muted-foreground/40">—</span>}</span>
                        )}
                      </td>
                    );
                  }
                )}

                {/* Result */}
                <td className="sticky right-0 bg-inherit px-2 py-1 border-l">
                  <CheckToggle
                    value={result}
                    onChange={(r) => handleResultChange(device.id, r)}
                    disabled={isFinalized}
                    size="sm"
                  />
                </td>

                {/* Delete */}
                {!isFinalized && (
                  <td className="px-1 py-1 text-center">
                    {confirmDeleteId === device.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => softDelete.mutate({ deviceId: device.id, jobId })}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(device.id)}
                        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5"
                        title="Remove device"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}

          {/* Add row */}
          {!isFinalized && showAddRow && (
            <tr className="border-b bg-blue-50/40 dark:bg-blue-950/10">
              <td className="sticky left-0 bg-inherit px-2 py-1.5 text-center text-muted-foreground border-r font-mono w-8">
                {devices.length + 1}
              </td>
              <td className="px-2 py-1 border-r">
                <input
                  autoFocus
                  placeholder="Location"
                  className="w-full bg-transparent outline-none border-b border-primary text-xs"
                  value={addForm.location}
                  onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); if (e.key === "Escape") setShowAddRow(false); }}
                />
              </td>
              <td className="px-2 py-1 border-r">
                <input
                  placeholder="Type"
                  className="w-full bg-transparent outline-none border-b border-primary text-xs"
                  value={addForm.deviceType}
                  onChange={(e) => setAddForm((p) => ({ ...p, deviceType: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); if (e.key === "Escape") setShowAddRow(false); }}
                />
              </td>
              <td colSpan={COL_HEADERS.length - 3} className="px-2 py-1 text-muted-foreground/40 text-[10px] border-r">
                Fill remaining fields after saving
              </td>
              <td className="sticky right-0 bg-inherit px-2 py-1 border-l" />
              <td className="px-1 py-1">
                <div className="flex gap-1">
                  <button
                    onClick={handleAddSubmit}
                    disabled={addDevice.isPending}
                    className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowAddRow(false)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/70"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          )}

          {devices.length === 0 && !showAddRow && (
            <tr>
              <td colSpan={TOTAL_COLS} className="text-center py-8 text-muted-foreground">
                No emergency lights for this site
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {/* Add Device button */}
    {!isFinalized && (
      <div className="mt-2">
        <button
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add Device
        </button>
      </div>
    )}
    </div>
  );
}
