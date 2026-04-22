import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableRowProps {
  id: number;
  disabled?: boolean;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: (dragHandleProps: any) => ReactNode;
}

export function SortableRow({ id, disabled, className, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={className}
    >
      {children({ ...attributes, ...listeners })}
    </tr>
  );
}
