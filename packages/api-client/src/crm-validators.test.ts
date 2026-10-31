import { describe, expect, it } from 'vitest';
import {
  validateBusinessAccount,
  validateBusinessAccountsPage,
  validateLead,
  validateLeadStages,
  validateLeadsPage,
} from './crm-validators.js';

const lead = {
  id: 'lead-1',
  branchId: 'branch-1',
  assignedUserId: null,
  personId: 'person-1',
  stageId: 'stage-1',
  state: 'OPEN',
  source: 'Front desk',
  nextActionAt: null,
  lostReason: null,
  version: 2,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
  person: { id: 'person-1', publicId: 'PLG-1', name: 'Amina' },
  contacts: [],
  stage: {
    id: 'stage-1',
    code: 'CONTACTED',
    name: 'Contacted',
    ordinal: 2,
    isActive: true,
    version: 1,
  },
};
describe('CRM response validators', () => {
  it('accepts canonical lead pages, details and stages', () => {
    expect(validateLeadsPage({ items: [lead], nextCursor: null }).items[0]?.id).toBe('lead-1');
    expect(validateLead({ ...lead, activities: [], history: [] }).state).toBe('OPEN');
    expect(validateLeadStages([lead.stage])[0]?.code).toBe('CONTACTED');
  });
  it('accepts business account pages and details', () => {
    const account = {
      id: 'company-1',
      owningBranchId: 'branch-1',
      legalName: 'PLG Client LLC',
      displayName: 'PLG Client',
      registrationNo: 'REG-1',
      taxId: null,
      status: 'ACTIVE',
      version: 1,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    expect(validateBusinessAccountsPage({ items: [account], nextCursor: null }).items).toHaveLength(
      1,
    );
    expect(
      validateBusinessAccount({ ...account, billingAccount: null, contacts: [] }).contacts,
    ).toEqual([]);
  });
  it('rejects malformed CRM responses before partial data reaches the UI', () => {
    expect(() => validateLeadsPage({ items: [{ id: 'lead-1' }], nextCursor: null })).toThrow();
    expect(() => validateLeadStages([{ id: 'stage-1' }])).toThrow();
    expect(() => validateBusinessAccount({ id: 'company-1', contacts: [] })).toThrow();
  });
});
