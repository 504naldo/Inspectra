import AdminLayout from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Zap,
  AlertTriangle,
  Info,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterValue = "all" | "unread" | "critical" | "urgent" | "warning" | "info";

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityIcon(sev: string) {
  switch (sev) {
    case "critical": return <ShieldAlert className="h-4 w-4 text-red-500" />;
    case "urgent":   return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case "warning":  return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:         return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function severityBadge(sev: string) {
  switch (sev) {
    case "critical": return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Critical</Badge>;
    case "urgent":   return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">Urgent</Badge>;
    case "warning":  return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">Warning</Badge>;
    default:         return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Info</Badge>;
  }
}

function timeAgo(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "unread",   label: "Unread" },
  { value: "critical", label: "Critical" },
  { value: "urgent",   label: "Urgent" },
  { value: "warning",  label: "Warning" },
  { value: "info",     label: "Info" },
];

// ── Notification row ──────────────────────────────────────────────────────────

interface NotifRowProps {
  n: {
    id: number;
    severity: string;
    title: string;
    message: string | null;
    href: string | null;
    isRead: boolean;
    createdAt: Date | string;
    type: string;
  };
  onMarkRead: (id: number) => void;
  onDismiss: (id: number) => void;
}

function NotifRow({ n, onMarkRead, onDismiss }: NotifRowProps) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
        !n.isRead ? "bg-primary/5 border-primary/20" : "bg-card border-border"
      }`}
    >
      <div className="mt-0.5 shrink-0">{severityIcon(n.severity)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          {!n.isRead && (
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          )}
          <span className="font-medium text-sm leading-snug">{n.title}</span>
          {severityBadge(n.severity)}
        </div>
        {n.message && (
          <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {n.href && (
          <Link href={n.href}>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Go to item">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
        {!n.isRead && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Mark as read"
            onClick={() => onMarkRead(n.id)}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title="Dismiss"
          onClick={() => onDismiss(n.id)}
        >
          <BellOff className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Notifications() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const utils = trpc.useUtils();

  const { data: notifications = [], isLoading, refetch } = trpc.notifications.list.useQuery(
    { filter, limit: 100 },
    { staleTime: 30_000 }
  );

  const { data: unreadCount = 0 } = trpc.notifications.getUnreadCount.useQuery(undefined, {
    staleTime: 30_000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      toast.success("All notifications marked as read");
    },
  });

  const dismiss = trpc.notifications.dismiss.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
    },
  });

  const generateAlerts = trpc.notifications.generateAlerts.useMutation({
    onSuccess: ({ created }) => {
      utils.notifications.list.invalidate();
      utils.notifications.getUnreadCount.invalidate();
      if (created > 0) {
        toast.success(`Generated ${created} new alert${created > 1 ? "s" : ""}`);
      } else {
        toast.info("No new alerts — everything is up to date");
      }
    },
    onError: () => toast.error("Failed to generate alerts"),
  });

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id });
  };

  const handleDismiss = (id: number) => {
    dismiss.mutate({ id });
  };

  return (
    <AdminLayout title="Notification Center">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(f.value)}
                className="text-xs h-7"
              >
                {f.label}
                {f.value === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 bg-blue-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold leading-none">
                    {unreadCount}
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateAlerts.mutate()}
              disabled={generateAlerts.isPending}
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              {generateAlerts.isPending ? "Scanning…" : "Scan for Alerts"}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                Mark All Read
              </Button>
            )}
          </div>
        </div>

        {/* ── List ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Bell className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-muted-foreground">
                  {filter === "unread" ? "No unread notifications" : "No notifications"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {filter === "all"
                    ? "Click \"Scan for Alerts\" to check for operational issues."
                    : "Try switching to a different filter."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateAlerts.mutate()}
                disabled={generateAlerts.isPending}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Scan for Alerts
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <NotifRow
                key={n.id}
                n={n as any}
                onMarkRead={handleMarkRead}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
