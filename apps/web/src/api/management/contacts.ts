import {
  businessAccountsControllerContactCandidatesV1,
  businessAccountsControllerReplaceContactsV1,
} from '@/api/generated/business-accounts/business-accounts';
import type { BusinessAccountContactDto } from '@/api/generated/models/businessAccountContactDto';

export async function findBusinessContacts(branchId: string, search: string, signal?: AbortSignal) {
  return (
    await businessAccountsControllerContactCandidatesV1(
      { branchId, search },
      { signal: signal ?? null },
    )
  ).data;
}
export async function replaceBusinessContacts(
  id: string,
  version: number,
  contacts: BusinessAccountContactDto[],
  key: string,
) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Record version is required');
  return (
    await businessAccountsControllerReplaceContactsV1(
      id,
      { contacts },
      { headers: { 'If-Match': String(version) }, idempotencyKey: key },
    )
  ).data;
}
