import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { CheckToggle, type InspectionResult } from "./CheckToggle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCheck } from "lucide-react";

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
  devices: ExtinguisherRow[];
  isFinalized?: boolean;
  onResultChange?: (deviceId: number, result: InspectionResult) => void;
  carriedForwardDeviceIds?: Set<number>;
}

interface EditState {
  deviceId: number;
  field: string;
  value: string;
}

const COL_HEADERS = [
  { key: "seq", label: "#", width: "w-8 min-w-[2rem]", sticky: true },
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
  devices,
  isFinalized,
  onResultChange,
  carriedForwardDeviceIds,
}: ExtinguisherGridProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [localResults, setLocalResults] = useState<Record<number, InspectionResult>>({});

  const upsertResult = trpc.inspectionResult.upsert.useMutation({
    onError: () => toast.error("Failed to save result"),
  });

  const updateDevice = trpc.device.technicianUpdate.useMutation({
    onError: () => toast.error("Failed to save field"),
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
    updateDevice.mutate({ id: deviceId, [field]: value || undefined });
    setEditing(null);
  };

  const getEffectiveResult = (device: ExtinguisherRow): InspectionResult => {
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
    toast.success(`Marked ${devices.length} extinguisher${devices.length !== 1 ? "s" : ""} as pass`);
  }, [devices, isFinalized, jobId, upsertResult, onResultChange]);

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

                {(["location", "deviceType", "manufacturer", "model", "serialNumber", "mfgDate", "lastHST", "last6yr"] as const).map(
                  (field) => {
                    const isEditing = editing?.deviceId === device.id && editing?.field === field;
                    const value = (device as any)[field] ?? "";
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
              </tr>
            );
          })}
          {devices.length === 0 && (
            <tr>
              <td colSpan={COL_HEADERS.length} className="text-center py-8 text-muted-foreground">
                No fire extinguishers for this site
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
