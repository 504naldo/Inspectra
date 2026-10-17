/** An old component may share a query-cache response with a newly mounted
 * account. Check the displayed account again before writing durable data.
 */
export async function cacheCurrentJobDownload<T>(
  fetchData: () => Promise<T>,
  cacheData: (data: NonNullable<T>) => void,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false;
  const data = await fetchData();
  if (data == null || !isCurrent()) return false;
  cacheData(data);
  return true;
}
