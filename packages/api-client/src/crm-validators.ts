import type {
  BusinessAccount,
  BusinessAccountDetail,
  BusinessAccountsPage,
  Lead,
  LeadStage,
  LeadsPage,
} from './crm-models.js';
import { PlgApiError } from './errors.js';

function invalidResponse(): never {
  throw new PlgApiError(500, { code: 'RESPONSE_INVALID', messageKey: 'errors.requestFailed' });
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPage(value: unknown): value is { items: unknown[]; nextCursor: string | null } {
  return (
    object(value) &&
    Array.isArray(value.items) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string')
  );
}

function validLead(value: unknown): value is Lead {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.branchId === 'string' &&
    typeof value.state === 'string' &&
    typeof value.version === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.contacts) &&
    (value.person === null || object(value.person)) &&
    (value.stage === null || object(value.stage))
  );
}

export function validateLeadsPage(value: unknown): LeadsPage {
  if (!validPage(value) || !value.items.every(validLead)) invalidResponse();
  return value as LeadsPage;
}

export function validateLead(value: unknown): Lead {
  if (!validLead(value)) invalidResponse();
  return value;
}

export function validateLeadStages(value: unknown): LeadStage[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (stage) =>
        object(stage) &&
        typeof stage.id === 'string' &&
        typeof stage.code === 'string' &&
        typeof stage.name === 'string' &&
        typeof stage.ordinal === 'number' &&
        typeof stage.isActive === 'boolean',
    )
  )
    invalidResponse();
  return value as LeadStage[];
}

function validBusinessAccount(value: unknown): value is BusinessAccount {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.owningBranchId === 'string' &&
    typeof value.legalName === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.status === 'string' &&
    typeof value.version === 'number'
  );
}

export function validateBusinessAccountsPage(value: unknown): BusinessAccountsPage {
  if (!validPage(value) || !value.items.every(validBusinessAccount)) invalidResponse();
  return value as BusinessAccountsPage;
}

export function validateBusinessAccount(value: unknown): BusinessAccountDetail {
  if (
    !validBusinessAccount(value) ||
    !Array.isArray((value as unknown as Record<string, unknown>).contacts)
  )
    invalidResponse();
  return value as BusinessAccountDetail;
}
