import type { SearchEntityType } from './workspace.dto';

export type SearchResult = {
  entityType: SearchEntityType;
  id: string;
  labelAr: string;
  labelEn: string;
  secondary: string | null;
  status: string | null;
};

export const directorySearchTypes = [
  'LEAD',
  'STUDENT',
  'BUSINESS_ACCOUNT',
  'COHORT',
  'SESSION',
] as const satisfies readonly SearchEntityType[];

export function searchResult(
  entityType: SearchEntityType,
  id: string,
  labelAr: string,
  labelEn: string,
  secondary: string | null,
  status: string | null,
): SearchResult {
  return { entityType, id, labelAr, labelEn, secondary, status };
}
