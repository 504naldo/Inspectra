import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { Bell, Siren, X } from "lucide-react";
import { useLocation } from "wouter";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-l-4 border-l-red-500",
  urgent: "border-l-4 border-l-orange-500",
  warning: "border-l-4 border-l-amber-500",
  info: "border-l-4 border-l-blue-500",
};

function timeAgo(date: string | Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: unreadCount = 0 } = trpc.notifications.getMyUnreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: items = [] } = trpc.notifications.listMine.useQuery(
    { filter: "all", limit: 20 },
    { enabled: open }
  );

  const markRead = trpc.notifications.markMineRead.useMutation({
    onSuccess: () => {
      utils.notifications.getMyUnreadCount.invalidate();
      utils.notifications.listMine.invalidate();
    },
  });
  const dismiss = trpc.notifications.dismissMine.useMutation({
    onSuccess: () => {
      utils.notifications.getMyUnreadCount.invalidate();
      utils.notifications.listMine.invalidate();
    },
  });

  const handleSelect = (item: any) => {
    if (!item.isRead) markRead.mutate({ id: item.id });
    setOpen(false);
    if (item.href) navigate(item.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            items.map((item: any) => (
              <div
                key={item.id}
                className={`flex items-start gap-2 px-3 py-2.5 border-b last:border-b-0 cursor-pointer hover:bg-accent/50 ${SEVERITY_STYLES[item.severity] ?? ""} ${item.isRead ? "opacity-60" : ""}`}
                onClick={() => handleSelect(item)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.type === "emergency_job" && <Siren className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <p className="text-sm font-medium truncate">{item.title}</p>
                  </div>
                  {item.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(item.createdAt)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss.mutate({ id: item.id });
                  }}
                  className="p-1 rounded hover:bg-accent shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
