import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { CheckToggle, type InspectionResult } from "./CheckToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCheck, Trash2, Plus, GripVertical } from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDeviceReorder } from "./useDeviceReorder";
import { SortableRow } from "./SortableRow";
import { useSectionPendingChanges } from "./useSectionPendingChanges";
import { SearchInput } from "./SearchInput";

interface ExtinguisherRow {
  id: number;
  deviceType: string;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  mfgDate?: string | null;
  lastHST?: string | null;
  last6yr?: string | null;
  notes?: string | null;
  result?: InspectionResult;
}

interface ExtinguisherGridProps {
  jobId: number;
  siteId: number;
  companyId: number;
  devices: ExtinguisherRow[];
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

interface AddForm {
  location: string;
  deviceType: string;
}

const COL_HEADERS = [
  { key: "seq", label: "#", width: "w-10 min-w-[2.5rem]", sticky: true },
  { key: "location", label: "Location", width: "w-32 min-w-[8rem]" },
  { key: "deviceType", label: "Type", width: "w-28 min-w-[7rem]" },
  { key: "manufacturer", label: "Mfr", width: "w-24 min-w-[6rem]" },
  { key: "model", label: "Model/Size", width: "w-24 min-w-[6rem]" },
  { key: "serialNumber", label: "Serial #", width: "w-24 min-w-[6rem]" },
  { key: "mfgDate", label: "Mfg Date", width: "w-20 min-w-[5rem]" },
  { key: "lastHST", label: "Last HST", width: "w-20 min-w-[5rem]" },
  { key: "last6yr", label: "Last 6yr", width: "w-20 min-w-[5rem]" },
  { key: "result", label: "Result", width: "w-16 min-w-[4rem]", sticky: true, right: true },
];

const EDITABLE_FIELDS = ["location", "manufacturer", "model", "serialNumber", "mfgDate", "lastHST", "last6yr"];

export function ExtinguisherGrid({
  jobId,
  siteId,
  companyId,
  devices,
  isFinalized,
  onResultChange,
  carriedForwardDeviceIds,
  onRefresh,
}: ExtinguisherGridProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [localResults, setLocalResults] = useState<Record<number, InspectionResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ location: "", deviceType: "Fire Extinguisher" });
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const { rows, setRows, onDragEnd, sensors, reorder } = useDeviceReorder(devices, !!isFinalized);
  const [localDeviceEdits, setLocalDeviceEdits] = useState<Record<number, Partial<ExtinguisherRow>>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const rowIdxMap = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.location, d.deviceType, d.manufacturer, d.model, d.serialNumber]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);
  const {
    pendingChanges: pendingDeviceChanges,
    queueChange: queuePendingDeviceChange,
    clearChanges: clearPendingDeviceChanges,
    hasUnsavedChanges: hasPendingDeviceChanges,
  } = useSectionPendingChanges();
  const {
    pendingChanges: pendingResultChanges,
    queueChange: queuePendingResultChange,
    clearChanges: clearPendingResultChanges,
    hasUnsavedChanges: hasPendingResultChanges,
  } = useSectionPendingChanges();
  const hasPending = hasPendingDeviceChanges || hasPendingResultChanges;

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
      setAddForm({ location: "", deviceType: "Fire Extinguisher" });
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
      queuePendingResultChange(deviceId, "result", result);
      onResultChange?.(deviceId, result);
    },
    [queuePendingResultChange, onResultChange]
  );

  const handleCellClick = (deviceId: number, field: string, currentValue: string) => {
    if (isFinalized || !EDITABLE_FIELDS.includes(field)) return;
    setEditing({ deviceId, field, value: currentValue ?? "" });
  };

  const handleEditBlur = () => {
    if (!editing) return;
    const { deviceId, field, value } = editing;
    setLocalDeviceEdits((prev) => ({ ...prev, [deviceId]: { ...(prev[deviceId] ?? {}), [field]: value } }));
    queuePendingDeviceChange(deviceId, field, value);
    setEditing(null);
  };

  const handleSaveSection = useCallback(async () => {
    try {
      const deviceSaveTasks = (Object.entries(pendingDeviceChanges) as [string, Record<string, unknown>][]).map(([id, changeSet]) =>
        updateDevice.mutateAsync({ id: Number(id), ...changeSet } as Parameters<typeof updateDevice.mutate>[0])
      );
      const resultSaveTasks = (Object.entries(pendingResultChanges) as [string, Record<string, unknown>][]).map(([id, changeSet]) =>
        upsertResult.mutateAsync({
          jobId,
          deviceId: Number(id),
          result: changeSet.result as InspectionResult,
        })
      );
      await Promise.all([...deviceSaveTasks, ...resultSaveTasks]);
      clearPendingDeviceChanges();
      clearPendingResultChanges();
      toast.success("Fire extinguisher changes saved");
    } catch {
      toast.error("Failed to save fire extinguisher changes");
    }
  }, [
    pendingDeviceChanges,
    pendingResultChanges,
    updateDevice,
    upsertResult,
    jobId,
    clearPendingDeviceChanges,
    clearPendingResultChanges,
  ]);

  const getEffectiveResult = (device: ExtinguisherRow): InspectionResult => {
    return localResults[device.id] ?? device.result ?? "not_tested";
  };

  const handleAllPass = useCallback(() => {
    if (isFinalized) return;
    const updates: Record<number, InspectionResult> = {};
    devices.forEach((d) => { updates[d.id] = "pass"; });
    setLocalResults((prev) => ({ ...prev, ...updates }));
    devices.forEach((d) => {
      queuePendingResultChange(d.id, "result", "pass");
      onResultChange?.(d.id, "pass");
    });
    toast.success(`Marked ${devices.length} extinguisher${devices.length !== 1 ? "s" : ""} as pass`);
  }, [devices, isFinalized, queuePendingResultChange, onResultChange]);

  const handleSort = (dir: "asc" | "desc") => {
    setSortDir(dir);
    const sorted = [...rows].sort((a, b) => {
      const aKey = (a.location || "").toLowerCase();
      const bKey = (b.location || "").toLowerCase();
      const cmp = aKey.localeCompare(bKey, undefined, { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
    setRows(sorted);
    reorder.mutate({ orderedIds: sorted.map((r) => r.id) });
  };

  const handleAddSubmit = () => {
    if (!addForm.location.trim() && !addForm.deviceType.trim()) {
      toast.error("Location or device type required");
      return;
    }
    addDevice.mutate({
      jobId,
      siteId,
      companyId,
      category: "FIRE_EXTINGUISHER",
      deviceType: addForm.deviceType.trim() || "Fire Extinguisher",
      location: addForm.location.trim() || undefined,
    });
  };

  return (
    <div>
      {devices.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {devices.length > 1 && (
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Filter devices…" />
          )}
          {!isFinalized && (
            <div className="flex items-center gap-2 ml-auto">
              {hasPending && (
                <button
                  onClick={handleSaveSection}
                  disabled={updateDevice.isPending || upsertResult.isPending}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              )}
              {devices.length > 1 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSort("asc")}
                    className={cn("text-xs px-2 py-1 rounded transition-colors", sortDir === "asc" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                    title="Sort A→Z by location"
                  >A→Z</button>
                  <button
                    onClick={() => handleSort("desc")}
                    className={cn("text-xs px-2 py-1 rounded transition-colors", sortDir === "desc" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                    title="Sort Z→A by location"
                  >Z→A</button>
                </div>
              )}
              <button
                onClick={handleAllPass}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" /> All Pass
              </button>
            </div>
          )}
        </div>
      )}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
          </tr>
        </thead>
        <tbody>
          <SortableContext items={visibleRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {visibleRows.map((device) => {
            const idx = rowIdxMap.get(device.id)!;
            const result = getEffectiveResult(device);
            const rowBg =
              result === "pass"
                ? "bg-green-50 dark:bg-green-950/20"
                : result === "fail"
                ? "bg-red-50 dark:bg-red-950/20"
                : "";

            return (
              <SortableRow key={device.id} id={device.id} disabled={!!isFinalized || !!searchQuery} className={cn("border-b hover:bg-muted/30 transition-colors", rowBg)}>
                {(dragHandleProps) => (<>
                {/* # + delete */}
                <td className="sticky left-0 bg-inherit px-1 py-1 text-center text-muted-foreground border-r font-mono w-10">
                  {!isFinalized && (
                    <button {...dragHandleProps} className="block mx-auto text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing" title="Drag to reorder">
                      <GripVertical className="h-3 w-3" />
                    </button>
                  )}
                  <span className="block leading-none">{idx + 1}</span>
                  {carriedForwardDeviceIds?.has(device.id) && (
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-blue-600 leading-none mt-0.5">carried</span>
                  )}
                  {!isFinalized && (
                    confirmDeleteId === device.id ? (
                      <div className="flex flex-col gap-0.5 mt-1">
                        <button onClick={() => softDelete.mutate({ deviceId: device.id, jobId })} className="text-[9px] px-1 py-0.5 rounded bg-red-600 text-white leading-none">✓ Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground leading-none">✕ No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(device.id)} className="mt-0.5 text-muted-foreground/30 hover:text-red-500 transition-colors" title="Remove device">
                        <Trash2 className="h-3 w-3 mx-auto" />
                      </button>
                    )
                  )}
                </td>

                {(["location", "deviceType", "manufacturer", "model", "serialNumber", "mfgDate", "lastHST", "last6yr"] as const).map(
                  (field) => {
                    const isEditing = editing?.deviceId === device.id && editing?.field === field;
                    const value = (localDeviceEdits[device.id]?.[field as keyof ExtinguisherRow] ?? (device as any)[field] ?? "") as string;
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
              </>)}
              </SortableRow>
            );
          })}
          </SortableContext>

          {/* Add row */}
          {!isFinalized && showAddRow && (
            <tr className="border-b bg-blue-50/40 dark:bg-blue-950/10">
              <td className="sticky left-0 bg-inherit px-1 py-1 text-center text-muted-foreground border-r font-mono w-10 text-xs">
                {devices.length + 1}
              </td>
              <td className="px-2 py-1 border-r">
                <input autoFocus placeholder="Location" className="w-full bg-transparent outline-none border-b border-primary text-xs" value={addForm.location} onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); if (e.key === "Escape") setShowAddRow(false); }} />
              </td>
              <td className="px-2 py-1 border-r">
                <input placeholder="Type" className="w-full bg-transparent outline-none border-b border-primary text-xs" value={addForm.deviceType} onChange={(e) => setAddForm((p) => ({ ...p, deviceType: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); if (e.key === "Escape") setShowAddRow(false); }} />
              </td>
              <td colSpan={COL_HEADERS.length - 3} className="px-2 py-1 text-muted-foreground/40 text-[10px]">Fill remaining fields after saving</td>
              <td className="sticky right-0 bg-inherit px-2 py-1 border-l">
                <div className="flex gap-1">
                  <button onClick={handleAddSubmit} disabled={addDevice.isPending} className="text-[9px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Save</button>
                  <button onClick={() => setShowAddRow(false)} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">✕</button>
                </div>
              </td>
            </tr>
          )}

          {devices.length === 0 && !showAddRow && (
            <tr>
              <td colSpan={COL_HEADERS.length} className="text-center py-8 text-muted-foreground">
                No fire extinguishers for this site
              </td>
            </tr>
          )}
          {visibleRows.length === 0 && searchQuery && devices.length > 0 && (
            <tr>
              <td colSpan={COL_HEADERS.length} className="text-center py-6 text-muted-foreground text-xs">
                No devices match &ldquo;{searchQuery}&rdquo;
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </DndContext>

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
