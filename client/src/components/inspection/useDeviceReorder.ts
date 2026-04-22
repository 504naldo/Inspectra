import { useEffect, useMemo, useState } from "react";
import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

interface RowWithId {
  id: number;
}

export function useDeviceReorder<T extends RowWithId>(devices: T[], disabled: boolean) {
  const [rows, setRows] = useState<T[]>(devices);

  useEffect(() => {
    setRows(devices);
  }, [devices]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (disabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const reorder = useMemo(
    () => ({
      mutate: (_: { orderedIds: number[] }) => {
        // Intentionally no-op for now; ordering can be persisted later.
      },
    }),
    []
  );

  return { rows, setRows, onDragEnd, sensors, reorder };
}
