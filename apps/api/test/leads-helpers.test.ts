import { describe, expect, it } from 'vitest';
import { LeadPersonService } from '../src/crm/leads/lead-person.service';
import { LeadAccessService } from '../src/crm/leads/lead-access.service';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import type { PrismaService } from '../src/platform/database/prisma.service';

describe('LeadPersonService - prepareNewPersonContacts', () => {
  const service = new LeadPersonService(null as unknown as PrismaService);

  it('correctly prepares phone and email contacts when valid', () => {
    const result = service.prepareNewPersonContacts({
      phone: '010 1234 5678',
      email: ' Test@Example.com ',
    });

    expect(result).toEqual([
      {
        type: 'PHONE',
        rawValue: '010 1234 5678',
        normalizedValue: '+201012345678',
        isPrimary: true,
      },
      {
        type: 'EMAIL',
        rawValue: 'Test@Example.com',
        normalizedValue: 'test@example.com',
        isPrimary: true,
      },
    ]);
  });

  it('throws ConflictException on invalid phone', () => {
    expect(() =>
      service.prepareNewPersonContacts({
        phone: '   ',
      }),
    ).toThrowError();
  });

  it('throws ConflictException on invalid email', () => {
    expect(() =>
      service.prepareNewPersonContacts({
        email: '   ',
      }),
    ).toThrowError();
  });
});

describe('LeadAccessService - scopeWhere', () => {
  const accessService = new LeadAccessService(null as unknown as PrismaService);

  it('returns empty where condition for organization scope O', () => {
    const access: AccessContext = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(),
      assignedResourceIds: new Set(),
      grants: new Map<PermissionCode, Set<'O' | 'B' | 'A'>>([['leads.read', new Set(['O'])]]),
    };

    const result = accessService.scopeWhere(access, 'leads.read');
    expect(result).toEqual({});
  });

  it('returns branch filters for branch scope B', () => {
    const access: AccessContext = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(['branch-1', 'branch-2']),
      assignedResourceIds: new Set(),
      grants: new Map<PermissionCode, Set<'O' | 'B' | 'A'>>([['leads.read', new Set(['B'])]]),
    };

    const result = accessService.scopeWhere(access, 'leads.read');
    expect(result).toEqual({
      OR: [{ branchId: { in: ['branch-1', 'branch-2'] } }],
    });
  });

  it('returns actor assignment filters for assignment scope A', () => {
    const access: AccessContext = {
      organizationId: 'org-1',
      actorUserId: 'user-1',
      branchIds: new Set(),
      assignedResourceIds: new Set(['lead-1']),
      grants: new Map<PermissionCode, Set<'O' | 'B' | 'A'>>([['leads.read', new Set(['A'])]]),
    };

    const result = accessService.scopeWhere(access, 'leads.read');
    expect(result).toEqual({
      OR: [
        {
          OR: [{ assignedUserId: 'user-1' }, { id: { in: ['lead-1'] } }],
        },
      ],
    });
  });
});
