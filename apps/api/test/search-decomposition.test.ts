/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FinanceAccessService } from '../src/finance/finance-access.service';
import { PrismaService } from '../src/platform/database/prisma.service';
import { searchResult } from '../src/workspace/search-contract';
import { SearchDirectoryQueryService } from '../src/workspace/search-directory-query.service';
import { SearchDirectoryResolverService } from '../src/workspace/search-directory-resolver.service';
import { SearchFinanceQueryService } from '../src/workspace/search-finance-query.service';
import { SearchFinanceResolverService } from '../src/workspace/search-finance-resolver.service';
import { SearchQueryService } from '../src/workspace/search-query.service';
import { SearchRecentService } from '../src/workspace/search-recent.service';
import { SearchResolverService } from '../src/workspace/search-resolver.service';
import { SearchScopeService } from '../src/workspace/search-scope.service';
import { SearchService } from '../src/workspace/search.service';
const access = (
  grants: Array<[PermissionCode, Array<'O' | 'B' | 'A' | 'S'>]> = [],
): AccessContext => ({
  organizationId: 'org-1',
  actorUserId: 'user-1',
  grants: new Map(grants.map(([permission, scopes]) => [permission, new Set(scopes)])),
  branchIds: new Set(['branch-1']),
  assignedResourceIds: new Set(),
  studentPersonId: 'person-self',
});
describe('SearchService decomposition', () => {
  it('returns recents without dispatching entity queries when q is absent', async () => {
    const recent = [searchResult('COHORT', 'c-1', 'C1', 'C1', 'C1', 'ACTIVE')];
    const queries = { searchType: vi.fn() } as unknown as SearchQueryService;
    const recents = {
      recent: vi.fn().mockResolvedValue(recent),
      record: vi.fn(),
    } as unknown as SearchRecentService;
    const service = new SearchService(queries, recents);
    await expect(service.search(access(), { limit: 20 })).resolves.toEqual({
      query: null,
      items: [],
      recent,
    });
    expect(queries.searchType).not.toHaveBeenCalled();
  });
  it('normalizes requested types and preserves batch ranking before the global limit', async () => {
    const searchType = vi
      .fn()
      .mockImplementation((_access: AccessContext, type: 'PAYMENT' | 'STUDENT') =>
        Promise.resolve([
          searchResult(type, `${type}-1`, type, type, null, null),
          searchResult(type, `${type}-2`, type, type, null, null),
        ]),
      );
    const queries = { searchType } as unknown as SearchQueryService;
    const recents = {
      recent: vi.fn().mockResolvedValue([]),
      record: vi.fn(),
    } as unknown as SearchRecentService;
    const service = new SearchService(queries, recents);
    const result = await service.search(access(), {
      q: '  ref  ',
      types: ' payment,INVALID, student ',
      limit: 3,
    });
    expect(searchType).toHaveBeenNthCalledWith(1, expect.anything(), 'PAYMENT', 'ref', 3);
    expect(searchType).toHaveBeenNthCalledWith(2, expect.anything(), 'STUDENT', 'ref', 3);
    expect(result.items.map(({ id }) => id)).toEqual(['PAYMENT-1', 'PAYMENT-2', 'STUDENT-1']);
    expect(result.query).toBe('ref');
  });
  it('delegates recent recording without changing its public contract', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new SearchService(
      { searchType: vi.fn() } as unknown as SearchQueryService,
      { recent: vi.fn(), record } as unknown as SearchRecentService,
    );
    const input = { entityType: 'SESSION' as const, entityId: 'entity-1' };
    await expect(service.recordRecent(access(), input)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledWith(expect.anything(), input);
  });
});
describe('SearchQueryService RBAC routing', () => {
  const directory = { search: vi.fn() } as unknown as SearchDirectoryQueryService;
  const finance = { search: vi.fn() } as unknown as SearchFinanceQueryService;
  it('returns no results and performs no query without the entity permission', async () => {
    const scope = new SearchScopeService({} as PrismaService);
    const service = new SearchQueryService(scope, directory, finance);
    await expect(service.searchType(access(), 'PAYMENT', 'ref', 10)).resolves.toEqual([]);
    expect(directory.search).not.toHaveBeenCalled();
    expect(finance.search).not.toHaveBeenCalled();
  });
  it('passes branch scope to directory queries and routes finance separately', async () => {
    vi.mocked(directory.search).mockResolvedValue([]);
    vi.mocked(finance.search).mockResolvedValue([]);
    const scope = new SearchScopeService({} as PrismaService);
    const service = new SearchQueryService(scope, directory, finance);
    const scoped = access([
      ['academic.catalog.read', ['B']],
      ['payments.read', ['O']],
    ]);
    await service.searchType(scoped, 'COHORT', 'c', 5);
    expect(directory.search).toHaveBeenCalledWith(
      scoped,
      'COHORT',
      'c',
      5,
      'academic.catalog.read',
      ['branch-1'],
    );
    await service.searchType(scoped, 'PAYMENT', 'p', 5);
    expect(finance.search).toHaveBeenCalledWith(scoped, 'PAYMENT', 'p', 5, 'payments.read');
  });
});
describe('SearchScopeService invariants', () => {
  it('keeps organization precedence and branch scoping unchanged', () => {
    const scope = new SearchScopeService({} as PrismaService);
    expect(scope.branchIds(access([['leads.read', ['O', 'B']]]), 'leads.read')).toBeNull();
    expect(scope.branchIds(access([['leads.read', ['B']]]), 'leads.read')).toEqual(['branch-1']);
    expect(scope.branchIds(access([['leads.read', ['A']]]), 'leads.read')).toEqual([]);
  });
  it('unions self, branch enrollment and assigned lead people in stable order', async () => {
    const prisma = {
      enrollment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { studentPersonId: 'person-branch' },
            { studentPersonId: 'person-self' },
          ]),
      },
      lead: { findMany: vi.fn().mockResolvedValue([{ personId: 'person-assigned' }]) },
    } as unknown as PrismaService;
    const scope = new SearchScopeService(prisma);
    const scoped = access([['students.read_basic', ['S', 'B', 'A']]]);
    await expect(scope.studentPersonIds(scoped, 'students.read_basic')).resolves.toEqual([
      'person-self',
      'person-branch',
      'person-assigned',
    ]);
  });
});
describe('Search query semantics', () => {
  it('keeps tenant and actor-only lead filters when no branch is visible', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'lead-1', personId: 'person-1', source: 'Website', state: 'NEW' }]);
    const prisma = { lead: { findMany } } as unknown as PrismaService;
    const personIdsByName = vi.fn().mockResolvedValue(['person-1']);
    const people = vi
      .fn()
      .mockResolvedValue(new Map([['person-1', { id: 'person-1', name: 'Student' }]]));
    const scope = { personIdsByName, people } as unknown as SearchScopeService;
    const service = new SearchDirectoryQueryService(prisma, scope);
    const actorOnly = access([['leads.read', ['A']]]);
    await expect(service.search(actorOnly, 'LEAD', 'stu', 7, 'leads.read', [])).resolves.toEqual([
      searchResult('LEAD', 'lead-1', 'Student', 'Student', 'Website', 'NEW'),
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        branchId: { in: [] },
        assignedUserId: 'user-1',
        OR: [
          { source: { contains: 'stu', mode: 'insensitive' } },
          { personId: { in: ['person-1'] } },
        ],
      },
      take: 7,
      orderBy: { createdAt: 'desc' },
    });
  });
  it('retains the existing non-numeric receipt query behavior and billing scope', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'receipt-1',
        serialNumber: 10n,
        amount: { toFixed: () => '25.00' },
      },
    ]);
    const prisma = { internalReceipt: { findMany } } as unknown as PrismaService;
    const financeAccess = {
      visibleEnrollmentIds: vi.fn().mockResolvedValue(undefined),
    } as unknown as FinanceAccessService;
    const scope = {
      billingIds: vi.fn().mockResolvedValue(['billing-1']),
    } as unknown as SearchScopeService;
    const service = new SearchFinanceQueryService(prisma, financeAccess, scope);
    await expect(
      service.search(access([['receipts.read', ['O']]]), 'RECEIPT', 'recent', 4, 'receipts.read'),
    ).resolves.toEqual([
      searchResult('RECEIPT', 'receipt-1', 'Receipt 10', 'Receipt 10', '25.00', 'ISSUED'),
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        billingAccountId: { in: ['billing-1'] },
      },
      take: 4,
      orderBy: { issuedAt: 'desc' },
    });
  });
});
describe('SearchRecentService safety', () => {
  it('does not persist an entity that no longer resolves in scope', async () => {
    const upsert = vi.fn();
    const prisma = { userRecentEntity: { upsert } } as unknown as PrismaService;
    const resolver = {
      resolve: vi.fn().mockResolvedValue(null),
    } as unknown as SearchResolverService;
    const service = new SearchRecentService(prisma, resolver);
    await expect(
      service.record(access(), { entityType: 'STUDENT', entityId: 'person-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });
});
describe('Search Nest dependency graph', () => {
  it('compiles the facade and every collaborator without circular dependencies', async () => {
    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        SearchQueryService,
        SearchDirectoryQueryService,
        SearchFinanceQueryService,
        SearchRecentService,
        SearchResolverService,
        SearchDirectoryResolverService,
        SearchFinanceResolverService,
        SearchScopeService,
        { provide: PrismaService, useValue: {} },
        { provide: FinanceAccessService, useValue: {} },
      ],
    }).compile();
    expect(module.get(SearchService)).toBeInstanceOf(SearchService);
    await module.close();
  });
});
