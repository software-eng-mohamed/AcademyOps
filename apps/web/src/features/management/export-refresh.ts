import type { ManagementResource, ManagementRow } from './config';

export function exportRefreshInterval(
  resource: ManagementResource,
  items: ManagementRow[] | undefined,
  error: unknown,
): number | false {
  if (resource !== 'exports' || error) return false;
  return items?.some((item) => ['QUEUED', 'RUNNING'].includes(item.status)) ? 3000 : false;
}
