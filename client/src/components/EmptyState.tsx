import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Standardized empty state for lists and collections. Replaces the ad-hoc
 * "No X found" blocks hand-rolled across pages so wording, spacing, and the
 * optional icon/action read consistently. (UX-8)
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className ?? ""}`}>
      {Icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
