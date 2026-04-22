import { useCallback, useMemo, useState } from "react";

type PendingFieldMap = Record<string, unknown>;
type PendingChangeMap = Record<number, PendingFieldMap>;

export function useSectionPendingChanges() {
  const [pendingChanges, setPendingChanges] = useState<PendingChangeMap>({});

  const queueChange = useCallback((deviceId: number, field: string, value: unknown) => {
    setPendingChanges((prev) => ({
      ...prev,
      [deviceId]: {
        ...(prev[deviceId] ?? {}),
        [field]: value,
      },
    }));
  }, []);

  const clearChanges = useCallback(() => {
    setPendingChanges({});
  }, []);

  const hasUnsavedChanges = useMemo(
    () => Object.keys(pendingChanges).length > 0,
    [pendingChanges]
  );

  return {
    pendingChanges,
    setPendingChanges,
    queueChange,
    clearChanges,
    hasUnsavedChanges,
  };
}
