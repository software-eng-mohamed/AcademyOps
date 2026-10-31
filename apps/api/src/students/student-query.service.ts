import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { normalizeEgyptPhone, normalizeEmail, normalizeText } from '../imports/normalization';
import { PrismaService } from '../platform/database/prisma.service';
import type { ListStudentsDto, MatchStudentDto } from './students.dto';
import { StudentLearningViewService } from './student-learning-view.service';
import { StudentScopePolicyService } from './student-scope-policy.service';
export type Candidate = {
  personId: string;
  publicId: string;
  name: string | null;
  reasons: string[];
};
@Injectable()
export class StudentQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopePolicy: StudentScopePolicyService,
    private readonly learningView: StudentLearningViewService,
  ) {}
  async list(access: AccessContext, input: ListStudentsDto) {
    const visiblePersonIds = await this.scopePolicy.visiblePersonIds(access, 'students.read_basic');
    const studentPersonIds = (
      await this.prisma.studentProfile.findMany({
        where: { organizationId: access.organizationId },
        select: { personId: true },
      })
    ).map(({ personId }) => personId);
    const branchPersonIds = input.branchId
      ? await this.scopePolicy.personIdsForBranchScope(
          access.organizationId,
          [input.branchId],
          input.enrollmentState,
        )
      : undefined;
    const searchPersonIds = input.search
      ? await this.searchPersonIds(access, input.search)
      : undefined;
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        AND: [
          { id: { in: studentPersonIds } },
          ...(visiblePersonIds ? [{ id: { in: visiblePersonIds } }] : []),
          ...(branchPersonIds ? [{ id: { in: branchPersonIds } }] : []),
        ],
        ...(input.search
          ? {
              OR: [
                { publicId: { contains: input.search, mode: 'insensitive' as const } },
                { name: { contains: input.search, mode: 'insensitive' as const } },
                ...(searchPersonIds?.length ? [{ id: { in: searchPersonIds } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const visible = people.slice(0, input.limit);
    const [profiles, summaries] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: {
          organizationId: access.organizationId,
          personId: { in: visible.map(({ id }) => id) },
        },
      }),
      this.learningView.summaries(
        access,
        visible.map(({ id }) => id),
      ),
    ]);
    return {
      items: visible.map((person) => ({
        ...person,
        studentProfile: profiles.find(({ personId }) => personId === person.id) ?? null,
        enrollmentSummary: summaries.get(person.id) ?? {
          total: 0,
          active: 0,
          latestState: null,
          program: null,
          cohort: null,
          branch: null,
        },
      })),
      nextCursor: people.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }
  async findCandidates(access: AccessContext, input: MatchStudentDto): Promise<Candidate[]> {
    if (!input.name && !input.phone && !input.email && !input.legacyCode) {
      throw new ConflictException({
        code: 'MATCH_INPUT_REQUIRED',
        messageKey: 'students.matchInputRequired',
      });
    }
    const phone = normalizeEgyptPhone(input.phone);
    const email = normalizeEmail(input.email);
    const name = normalizeText(input.name);
    const personIds = new Set<string>();
    const reasons = new Map<string, Set<string>>();
    if (phone || email) {
      const contacts = await this.prisma.personContact.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [
            ...(phone ? [{ type: 'PHONE', normalizedValue: phone }] : []),
            ...(email ? [{ type: 'EMAIL', normalizedValue: email }] : []),
          ],
        },
      });
      for (const contact of contacts) {
        personIds.add(contact.personId);
        const set = reasons.get(contact.personId) ?? new Set<string>();
        set.add(contact.type === 'PHONE' ? 'EXACT_PHONE' : 'EXACT_EMAIL');
        reasons.set(contact.personId, set);
      }
    }
    if (input.legacyCode) {
      const references = await this.prisma.legacyReference.findMany({
        where: {
          organizationId: access.organizationId,
          entityType: 'ENROLLMENT',
          sourceField: 'MASTER_ENROLLMENT_KEY',
          rawValue: { startsWith: `${input.legacyCode.trim().toUpperCase()}|` },
        },
      });
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: references.map(({ entityId }) => entityId) },
        },
        select: { studentPersonId: true },
      });
      for (const enrollment of enrollments) {
        personIds.add(enrollment.studentPersonId);
        const set = reasons.get(enrollment.studentPersonId) ?? new Set<string>();
        set.add('EXACT_LEGACY_CODE');
        reasons.set(enrollment.studentPersonId, set);
      }
    }
    if (name) {
      const named = await this.prisma.person.findMany({
        where: {
          organizationId: access.organizationId,
          name: { contains: name, mode: 'insensitive' },
        },
        take: 20,
      });
      for (const person of named) {
        personIds.add(person.id);
        const set = reasons.get(person.id) ?? new Set<string>();
        set.add('NAME_SIMILAR');
        reasons.set(person.id, set);
      }
    }
    const people = await this.prisma.person.findMany({
      where: { organizationId: access.organizationId, id: { in: [...personIds] } },
      take: 50,
    });
    return people.map((person) => ({
      personId: person.id,
      publicId: person.publicId,
      name: person.name,
      reasons: [...(reasons.get(person.id) ?? [])],
    }));
  }
  async read(access: AccessContext, personId: string) {
    await this.scopePolicy.assertVisible(access, personId, 'students.read_basic');
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: access.organizationId },
    });
    if (!person) throw this.notFound();
    const canReadContacts = await this.scopePolicy.canSee(
      access,
      personId,
      'students.read_contact',
    );
    const [profile, contacts, enrollments] = await Promise.all([
      this.prisma.studentProfile.findFirst({
        where: { organizationId: access.organizationId, personId },
      }),
      canReadContacts
        ? this.prisma.personContact.findMany({
            where: { organizationId: access.organizationId, personId },
            orderBy: [{ type: 'asc' }, { isPrimary: 'desc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      this.learningView.details(access, personId),
    ]);
    if (!profile) throw this.notFound();
    const name = person.name;
    const phone = contacts.find(({ type }) => type === 'PHONE')?.rawValue;
    const email = contacts.find(({ type }) => type === 'EMAIL')?.rawValue;
    const possibleDuplicates = access.grants.has('students.merge')
      ? (
          await this.findCandidates(access, {
            ...(name ? { name } : {}),
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
          })
        ).filter(
          (candidate) =>
            candidate.personId !== person.id &&
            candidate.reasons.length >= 2 &&
            candidate.reasons.some((reason) => reason.startsWith('EXACT_')),
        )
      : undefined;
    const current =
      enrollments.find(({ state }) => state === 'ACTIVE') ?? enrollments.at(0) ?? null;
    return {
      ...person,
      studentProfile: profile,
      contacts,
      enrollmentSummary: {
        total: enrollments.length,
        active: enrollments.filter(({ state }) => state === 'ACTIVE').length,
        latestState: current?.state ?? null,
        program: current?.program ?? null,
        cohort: current?.cohort ?? null,
        branch: current?.branch ?? null,
      },
      enrollments,
      ...(possibleDuplicates ? { possibleDuplicates } : {}),
    };
  }
  private async searchPersonIds(access: AccessContext, search: string): Promise<string[]> {
    const ids = new Set<string>();
    if (access.grants.has('students.read_contact')) {
      const contacts = await this.prisma.personContact.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [
            { rawValue: { contains: search, mode: 'insensitive' } },
            { normalizedValue: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { personId: true },
        take: 200,
      });
      for (const { personId } of contacts) ids.add(personId);
    }
    const references = await this.prisma.legacyReference.findMany({
      where: {
        organizationId: access.organizationId,
        entityType: 'ENROLLMENT',
        sourceField: 'MASTER_ENROLLMENT_KEY',
        rawValue: { contains: search.toUpperCase() },
      },
      select: { entityId: true },
      take: 200,
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: references.map(({ entityId }) => entityId) },
      },
      select: { studentPersonId: true },
    });
    for (const { studentPersonId } of enrollments) ids.add(studentPersonId);
    return [...ids];
  }
  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'STUDENT_NOT_FOUND', messageKey: 'students.notFound' });
  }
}
