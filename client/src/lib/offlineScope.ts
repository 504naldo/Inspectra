export interface OfflineScope {
  userId: number;
  companyId: number | null;
}
export function offlineScopeFromUser(
  user: { id: number; companyId?: number | null } | null | undefined
): OfflineScope | null {
  if (
    !user ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    user.companyId === undefined
  )
    return null;
  if (
    user.companyId !== null &&
    (!Number.isSafeInteger(user.companyId) || user.companyId <= 0)
  )
    return null;
  return { userId: user.id, companyId: user.companyId };
}
export function requireOfflineScope(scope: OfflineScope | null): OfflineScope {
  if (
    !scope ||
    !offlineScopeFromUser({ id: scope.userId, companyId: scope.companyId })
  )
    throw new Error("Sign in before saving or recovering offline data");
  return scope;
}
export function offlineScopeKey(scope: OfflineScope): string {
  requireOfflineScope(scope);
  return `${scope.userId}:${scope.companyId ?? "none"}`;
}
export function belongsToOfflineScope(
  item: unknown,
  scope: OfflineScope | null
): boolean {
  if (!scope || !item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return record.userId === scope.userId && record.companyId === scope.companyId;
}
