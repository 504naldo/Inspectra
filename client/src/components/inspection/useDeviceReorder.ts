import { useState, useEffect } from "react";
import { type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function useDeviceReorder<T extends { id: number }>(devices: T[], disabled: boolean) {
  const [rows, setRows] = useState<T[]>(devices);

  useEffect(() => {
    setRows(devices);
  }, [devices]);

  const reorder = trpc.device.reorder.useMutation({
    onError: () => toast.error("Failed to save order"),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      reorder.mutate({ orderedIds: next.map((r) => r.id) });
      return next;
    });
  };

  return { rows, onDragEnd, sensors };
}
