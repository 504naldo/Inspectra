import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type RenderChildren = (dragHandleProps: Record<string, unknown>) => ReactNode;

export function SortableRow({
  id,
  disabled,
  className,
  children,
}: {
  id: number;
  disabled?: boolean;
  className?: string;
  children: RenderChildren;
}) {
  const sortable = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <tr ref={sortable.setNodeRef} style={style} className={className}>
      {children({
        ...sortable.attributes,
        ...sortable.listeners,
      })}
    </tr>
  );
}
