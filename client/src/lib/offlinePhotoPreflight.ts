import { offlineStorage, type OfflineRecoverySummary } from "./offlineStorage";
import { requireOfflineScope, type OfflineScope } from "./offlineScope";

type PhotoStore = {
  getPendingPhotosForJob(jobId: number, scope: OfflineScope | null): Promise<unknown[]>;
  recoverySummary(scope: OfflineScope | null): Promise<OfflineRecoverySummary>;
};
/** Read again at submission: another tab may have captured evidence since render. */
export async function readPhotoQaState(jobId: number, scope: OfflineScope | null, store: PhotoStore = offlineStorage) {
  requireOfflineScope(scope);
  const [photos, recovery] = await Promise.all([
    store.getPendingPhotosForJob(jobId, scope), store.recoverySummary(scope),
  ]);
  return { count: photos.length, blockers: recovery.legacy + recovery.invalid };
}
