import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { StudentCommandService } from '../src/students/student-command.service';
import { StudentContactsService } from '../src/students/student-contacts.service';
import type { StudentQueryService } from '../src/students/student-query.service';
import { StudentScopePolicyService } from '../src/students/student-scope-policy.service';
import { StudentsService } from '../src/students/students.service';
const access = (
  grants: Array<[PermissionCode, Array<'O' | 'B' | 'A' | 'S'>]> = [],
  branchIds: string[] = ['b-1'],
  studentPersonId?: string,
): AccessContext => ({
  organizationId: 'org-1',
  actorUserId: 'user-1',
  grants: new Map(grants.map(([permission, scopes]) => [permission, new Set(scopes)])),
  branchIds: new Set(branchIds),
  assignedResourceIds: new Set(),
  studentPersonId,
});
describe('StudentsService facade delegation', () => {
  it('delegates query and candidate methods to StudentQueryService', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const findCandidates = vi.fn().mockResolvedValue([]);
    const read = vi.fn().mockResolvedValue({ id: 'p-1' });
    const queryService = { list, findCandidates, read } as unknown as StudentQueryService;
    const commandService = {} as StudentCommandService;
    const facade = new StudentsService(queryService, commandService);
    const ctx = access([['students.read_basic', ['O']]]);
    const listDto = { limit: 10 };
    await facade.list(ctx, listDto);
    expect(list).toHaveBeenCalledWith(ctx, listDto);
    const matchDto = { phone: '01012345678' };
    await facade.findCandidates(ctx, matchDto);
    expect(findCandidates).toHaveBeenCalledWith(ctx, matchDto);
    await facade.read(ctx, 'p-1');
    expect(read).toHaveBeenCalledWith(ctx, 'p-1');
  });
  it('delegates mutation methods to StudentCommandService', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'p-1' });
    const update = vi.fn().mockResolvedValue({ id: 'p-1' });
    const replaceContacts = vi.fn().mockResolvedValue({ id: 'p-1' });
    const queryService = {} as StudentQueryService;
    const commandService = {
      create,
      update,
      replaceContacts,
    } as unknown as StudentCommandService;
    const facade = new StudentsService(queryService, commandService);
    const ctx = access([['students.create', ['O']]]);
    const createDto = { name: 'Student 1' };
    await facade.create(ctx, createDto, 'corr-1');
    expect(create).toHaveBeenCalledWith(ctx, createDto, 'corr-1');
    const updateDto = { name: 'Student' };
    await facade.update(ctx, 'p-1', updateDto, 1, 'corr-2');
    expect(update).toHaveBeenCalledWith(ctx, 'p-1', updateDto, 1, 'corr-2');
    const contactsDto = { contacts: [] };
    await facade.replaceContacts(ctx, 'p-1', contactsDto, 1, 'corr-3');
    expect(replaceContacts).toHaveBeenCalledWith(ctx, 'p-1', contactsDto, 1, 'corr-3');
  });
});
describe('StudentScopePolicyService S/B scope', () => {
  it('retains actor-created students only through tenant-bound immutable events under A scope', async () => {
    const events = vi.fn().mockResolvedValue([{ entityId: 'own-student' }, { entityId: null }]);
    const policy = new StudentScopePolicyService({
      auditEvent: { findMany: events },
      lead: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);
    await expect(
      policy.visiblePersonIds(access([['students.read_basic', ['A']]]), 'students.read_basic'),
    ).resolves.toEqual(['own-student']);
    expect(events).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        actorUserId: 'user-1',
        action: 'student.create',
        entityType: 'Person',
      },
      select: { entityId: true },
    });
    events.mockClear();
    await expect(policy.visiblePersonIds(access([]), 'students.read_basic')).resolves.toEqual([]);
    expect(events).not.toHaveBeenCalled();
  });
  it('uses tenant-bound immutable creation events before enrollment and never widens a state filter', async () => {
    const events = vi.fn().mockResolvedValue([{ entityId: 'new-student' }, { entityId: null }]);
    const policy = new StudentScopePolicyService({
      auditEvent: { findMany: events },
      enrollment: { findMany: vi.fn().mockResolvedValue([{ studentPersonId: 'enrolled' }]) },
    } as unknown as PrismaService);
    await expect(
      policy.visiblePersonIds(access([['students.read_basic', ['B']]]), 'students.read_basic'),
    ).resolves.toEqual(['enrolled', 'new-student']);
    expect(events).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        action: 'student.create',
        entityType: 'Person',
        OR: [{ after: { path: ['branchId'], equals: 'b-1' } }],
      },
      select: { entityId: true },
    });
    events.mockClear();
    await expect(policy.personIdsForBranchScope('org-1', ['b-1'], 'ACTIVE')).resolves.toEqual([
      'enrolled',
    ]);
    await expect(policy.personIdsForBranchScope('org-1', [])).resolves.toEqual([]);
    expect(events).not.toHaveBeenCalled();
  });
  it('keeps multi-branch enrollment history inside the granted scope', async () => {
    const prisma = {
      enrollment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'e-main', homeBranchId: 'b-1', studentPersonId: 'p-1' },
          { id: 'e-other', homeBranchId: 'b-2', studentPersonId: 'p-1' },
        ]),
      },
    } as unknown as PrismaService;
    const policy = new StudentScopePolicyService(prisma);
    await expect(
      policy.visibleEnrollmentIds(
        access([['students.read_basic', ['B']]], ['b-1']),
        ['p-1'],
        'students.read_basic',
      ),
    ).resolves.toEqual(['e-main']);
  });
  it('returns undefined visiblePersonIds for O scope and resolves S, B, A scopes correctly', async () => {
    const sessionTrainerFindMany = vi.fn().mockResolvedValue([{ sessionId: 's-1' }]);
    const trainerFindFirst = vi.fn().mockResolvedValue({ id: 'tr-1' });
    const prisma = {
      auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
      enrollment: {
        findMany: vi.fn().mockImplementation(
          ({
            where,
          }: {
            where: {
              homeBranchId?: {
                in: string[];
              };
            };
          }) => {
            if (where.homeBranchId) return Promise.resolve([{ studentPersonId: 'p-branch' }]);
            return Promise.resolve([{ studentPersonId: 'p-trainer' }]);
          },
        ),
      },
      lead: { findMany: vi.fn().mockResolvedValue([{ personId: 'p-lead' }]) },
      user: { findFirst: vi.fn().mockResolvedValue({ personId: 'p-user' }) },
      trainerProfile: { findFirst: trainerFindFirst },
      sessionTrainer: { findMany: sessionTrainerFindMany },
      session: { findMany: vi.fn().mockResolvedValue([{ cohortId: 'c-1' }]) },
      enrollmentCohortAssignment: {
        findMany: vi.fn().mockResolvedValue([{ enrollmentId: 'e-1' }]),
      },
    } as unknown as PrismaService;
    const policy = new StudentScopePolicyService(prisma);
    expect(
      await policy.visiblePersonIds(
        access([['students.read_basic', ['O']]]),
        'students.read_basic',
      ),
    ).toBeUndefined();
    const sScoped = access([['students.read_basic', ['S']]], ['b-1'], 'p-self');
    expect(await policy.visiblePersonIds(sScoped, 'students.read_basic')).toEqual(['p-self']);
    const bScoped = access([['students.read_basic', ['B']]], ['b-1']);
    expect(await policy.visiblePersonIds(bScoped, 'students.read_basic')).toEqual(['p-branch']);
    const aScoped = access([['students.read_basic', ['A']]]);
    const aIds = await policy.visiblePersonIds(aScoped, 'students.read_basic');
    expect(aIds).toContain('p-lead');
    expect(aIds).toContain('p-trainer');
    expect(trainerFindFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', personId: 'p-user', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(sessionTrainerFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', trainerId: 'tr-1', bookingStatus: 'CONFIRMED' },
      select: { sessionId: true },
    });
  });
  it('asserts visible person and creation scope invariants', async () => {
    const policy = new StudentScopePolicyService({} as PrismaService);
    const ctxB = access([['students.read_basic', ['S']]], ['b-1'], 'p-self');
    await expect(policy.assertVisible(ctxB, 'p-other', 'students.read_basic')).rejects.toThrow(
      NotFoundException,
    );
    const createO = access([['students.create', ['O']]]);
    expect(() => policy.assertCreationScope(createO, 'b-any')).not.toThrow();
    const createB = access([['students.create', ['B']]], ['b-1']);
    expect(() => policy.assertCreationScope(createB, 'b-1')).not.toThrow();
    expect(() => policy.assertCreationScope(createB, 'b-2')).toThrow(NotFoundException);
  });
});
describe('StudentContactsService normalization and preparation', () => {
  const service = new StudentContactsService();
  it('normalizes valid phone and email and rejects invalid ones', () => {
    expect(service.normalizeContact('PHONE', '01012345678')).toBe('+201012345678');
    expect(service.normalizeContact('EMAIL', 'User@Example.Com')).toBe('user@example.com');
    expect(() => service.normalizeContact('PHONE', '   ')).toThrow(ConflictException);
    expect(() => service.normalizeContact('EMAIL', '   ')).toThrow(ConflictException);
  });
  it('prepares contact list defaulting primary flag and detecting duplicates', () => {
    const prepared = service.prepareContacts({
      contacts: [
        { type: 'PHONE', value: '01012345678' },
        { type: 'EMAIL', value: 'user@example.com' },
      ],
    });
    expect(prepared).toEqual([
      {
        type: 'PHONE',
        rawValue: '01012345678',
        normalizedValue: '+201012345678',
        isPrimary: true,
      },
      {
        type: 'EMAIL',
        rawValue: 'user@example.com',
        normalizedValue: 'user@example.com',
        isPrimary: true,
      },
    ]);
    expect(() =>
      service.prepareContacts({
        contacts: [
          { type: 'PHONE', value: '01012345678', isPrimary: true },
          { type: 'PHONE', value: '01099999999', isPrimary: true },
        ],
      }),
    ).toThrow(ConflictException);
    expect(() =>
      service.prepareContacts({
        contacts: [
          { type: 'EMAIL', value: 'a@b.com' },
          { type: 'EMAIL', value: 'a@b.com' },
        ],
      }),
    ).toThrow(ConflictException);
  });
});
