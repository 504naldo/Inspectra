import { useEffect, useState } from "react";
import { offlineStorage, subscribePendingPhotos } from "@/lib/offlineStorage";

/**
 * Tracks how many deficiency photos are queued in IndexedDB awaiting upload.
 * Reacts instantly to queue/upload/delete via offlineStorage's pub/sub instead of polling.
 */
export function usePendingPhotoCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      offlineStorage.getPendingPhotoCount().then((n) => {
        if (!cancelled) setCount((prev) => (prev === n ? prev : n));
      }).catch(() => {});
    };

    refresh();
    return subscribePendingPhotos(refresh);
  }, []);

  return count;
}
