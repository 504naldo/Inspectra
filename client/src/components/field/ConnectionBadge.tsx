import { Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Online/offline pill for technician field screens. Dedupes the Wifi/WifiOff
 * markup that was hand-copied into several headers. Pass `online` when the page
 * already derives it (e.g. from useOfflineStorage); otherwise it reads the
 * shared useOnlineStatus hook itself.
 */
export function ConnectionBadge({ online }: { online?: boolean }) {
  const auto = useOnlineStatus();
  const isOnline = online ?? auto;
  return isOnline ? (
    <span className="online-badge flex items-center gap-1 text-xs" title="Online">
      <Wifi className="h-3 w-3" />
    </span>
  ) : (
    <span className="offline-badge flex items-center gap-1 text-xs" title="Offline — changes sync when reconnected">
      <WifiOff className="h-3 w-3" />
    </span>
  );
}
