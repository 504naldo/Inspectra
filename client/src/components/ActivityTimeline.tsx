import { trpc } from "../lib/trpc";
import { User, Clock } from "lucide-react";

// ── Event-type colour mapping ─────────────────────────────────────────────────
const DOT_COLOUR: Record<string, string> = {
  created:          "bg-blue-500",
  updated:          "bg-gray-400",
  status_changed:   "bg-purple-500",
  started:          "bg-orange-500",
  completed:        "bg-green-500",
  paid:             "bg-green-600",
  voided:           "bg-red-500",
  cancelled:        "bg-red-500",
  exported:         "bg-teal-500",
  assigned:         "bg-amber-500",
  assignment_changed: "bg-amber-500",
  linked:           "bg-indigo-500",
  converted:        "bg-indigo-600",
  scheduled:        "bg-sky-500",
  rescheduled:      "bg-sky-600",
  closed:           "bg-gray-600",
};

function dotColour(eventType: string): string {
  return DOT_COLOUR[eventType] ?? "bg-gray-400";
}

// ── Relative time ─────────────────────────────────────────────────────────────
function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

function fullDatetime(date: Date | string): string {
  return new Date(date).toLocaleString("en-CA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Types accepted by the component ──────────────────────────────────────────
type EntityType =
  | "job" | "schedule" | "service_schedule" | "monthly_service_tracking"
  | "site" | "deficiency" | "repair_quote" | "approved_work"
  | "work_order" | "invoice" | "report" | "company_settings" | "parts_catalog";

interface ActivityTimelineProps {
  entityType: EntityType;
  entityId: number;
  limit?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ActivityTimeline({ entityType, entityId, limit = 50 }: ActivityTimelineProps) {
  const { data: events, isLoading, isError } = trpc.activity.listForEntity.useQuery(
    { entityType, entityId, limit },
    { enabled: !!entityId },
  );

  if (isLoading) {
    return (
      <div className="py-6 text-sm text-muted-foreground text-center animate-pulse">
        Loading activity…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-4 text-sm text-destructive text-center">
        Failed to load activity log.
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="py-6 text-sm text-muted-foreground text-center">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-0">
      {events.map((event, idx) => (
        <li key={event.id} className="mb-0 ml-4">
          {/* Connector dot */}
          <span
            className={`absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-background ${dotColour(event.eventType)}`}
          />

          <div className="pl-2 py-3 border-b border-border/50 last:border-0">
            {/* Title + time */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{event.title}</p>
              <time
                className="shrink-0 text-xs text-muted-foreground cursor-default"
                title={fullDatetime(event.createdAt)}
              >
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {relativeTime(event.createdAt)}
                </span>
              </time>
            </div>

            {/* Description */}
            {event.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
            )}

            {/* Old → New value */}
            {(event.oldValue || event.newValue) && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                {event.oldValue && (
                  <span className="line-through text-destructive opacity-70">{event.oldValue}</span>
                )}
                {event.oldValue && event.newValue && (
                  <span className="text-muted-foreground">→</span>
                )}
                {event.newValue && (
                  <span className="text-green-600 dark:text-green-400 font-medium">{event.newValue}</span>
                )}
              </div>
            )}

            {/* Actor */}
            {event.actorName && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {event.actorName}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
