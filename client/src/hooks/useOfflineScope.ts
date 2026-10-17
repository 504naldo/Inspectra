import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { offlineScopeFromUser } from "@/lib/offlineScope";
export function useOfflineScope() {
  const { user } = useAuth();
  const id = user?.id;
  const companyId = user?.companyId;
  return useMemo(
    () => offlineScopeFromUser(id === undefined ? null : { id, companyId }),
    [id, companyId]
  );
}
