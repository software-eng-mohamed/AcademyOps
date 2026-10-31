import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';

@Injectable()
export class StudentScopePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertVisible(
    access: AccessContext,
    personId: string,
    permission: PermissionCode,
  ): Promise<void> {
    if (!(await this.canSee(access, personId, permission))) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        messageKey: 'students.notFound',
      });
    }
  }

  async canSee(
    access: AccessContext,
    personId: string,
    permission: PermissionCode,
  ): Promise<boolean> {
    const visible = await this.visiblePersonIds(access, permission);
    return visible === undefined || visible.includes(personId);
  }

  async visiblePersonIds(
    access: AccessContext,
    permission: PermissionCode,
  ): Promise<string[] | undefined> {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return undefined;
    const ids = new Set<string>();
    if (scopes?.has('S') && access.studentPersonId) ids.add(access.studentPersonId);
    if (scopes?.has('B')) {
      for (const personId of await this.personIdsForBranchScope(access.organizationId, [
        ...access.branchIds,
      ])) {
        ids.add(personId);
      }
    }
    if (scopes?.has('A')) {
      // Like an actor-created enrollment, a directly created student stays in
      // the creator's workspace before conversion. The immutable audit event
      // binds this to the current tenant and actor, never all branch students.
      const created = await this.prisma.auditEvent.findMany({
        where: {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          action: 'student.create',
          entityType: 'Person',
        },
        select: { entityId: true },
      });
      for (const { entityId } of created) if (entityId) ids.add(entityId);
      const assignedLeads = await this.prisma.lead.findMany({
        where: {
          organizationId: access.organizationId,
          assignedUserId: access.actorUserId,
          personId: { not: null },
        },
        select: { personId: true },
      });
      for (const { personId } of assignedLeads) if (personId) ids.add(personId);
      const user = await this.prisma.user.findFirst({
        where: { organizationId: access.organizationId, id: access.actorUserId },
        select: { personId: true },
      });
      const trainer = user
        ? await this.prisma.trainerProfile.findFirst({
            where: {
              organizationId: access.organizationId,
              personId: user.personId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      if (trainer) {
        const sessionAssignments = await this.prisma.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            trainerId: trainer.id,
            bookingStatus: 'CONFIRMED',
          },
          select: { sessionId: true },
        });
        const sessions = await this.prisma.session.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: sessionAssignments.map(({ sessionId }) => sessionId) },
          },
          select: { cohortId: true },
        });
        const cohortAssignments = await this.prisma.enrollmentCohortAssignment.findMany({
          where: {
            organizationId: access.organizationId,
            cohortId: { in: sessions.map(({ cohortId }) => cohortId) },
          },
          select: { enrollmentId: true },
        });
        const enrollments = await this.prisma.enrollment.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: cohortAssignments.map(({ enrollmentId }) => enrollmentId) },
          },
          select: { studentPersonId: true },
        });
        for (const { studentPersonId } of enrollments) ids.add(studentPersonId);
      }
    }
    return [...ids];
  }

  async personIdsForEnrollmentScope(
    organizationId: string,
    branchIds: string[],
    state?: string,
  ): Promise<string[]> {
    return [
      ...new Set(
        (
          await this.prisma.enrollment.findMany({
            where: {
              organizationId,
              homeBranchId: { in: branchIds },
              ...(state ? { state } : {}),
            },
            select: { studentPersonId: true },
          })
        ).map(({ studentPersonId }) => studentPersonId),
      ),
    ];
  }

  async personIdsForBranchScope(
    organizationId: string,
    branchIds: string[],
    state?: string,
  ): Promise<string[]> {
    if (!branchIds.length) return [];
    const enrolled = await this.personIdsForEnrollmentScope(organizationId, branchIds, state);
    if (state) return enrolled;
    // Creation already validates the actor's branch and atomically writes this immutable
    // event. Retain access before the student's first enrollment without granting O scope.
    const created = await this.prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: 'student.create',
        entityType: 'Person',
        OR: branchIds.map((branchId) => ({ after: { path: ['branchId'], equals: branchId } })),
      },
      select: { entityId: true },
    });
    return [
      ...new Set([...enrolled, ...created.flatMap(({ entityId }) => (entityId ? [entityId] : []))]),
    ];
  }

  async visibleEnrollmentIds(
    access: AccessContext,
    personIds: string[],
    permission: PermissionCode,
  ): Promise<string[]> {
    if (!personIds.length) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        organizationId: access.organizationId,
        studentPersonId: { in: personIds },
      },
      select: { id: true, homeBranchId: true, studentPersonId: true },
    });
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return enrollments.map(({ id }) => id);

    const visible = new Set<string>();
    if (scopes?.has('S') && access.studentPersonId) {
      for (const enrollment of enrollments) {
        if (enrollment.studentPersonId === access.studentPersonId) visible.add(enrollment.id);
      }
    }
    if (scopes?.has('B')) {
      for (const enrollment of enrollments) {
        if (access.branchIds.has(enrollment.homeBranchId)) visible.add(enrollment.id);
      }
    }
    if (scopes?.has('A')) {
      const candidateIds = enrollments.map(({ id }) => id);
      for (const id of access.assignedResourceIds) {
        if (candidateIds.includes(id)) visible.add(id);
      }
      const [created, assignedLeads, user] = await Promise.all([
        this.prisma.enrollmentEvent.findMany({
          where: {
            organizationId: access.organizationId,
            enrollmentId: { in: candidateIds },
            actorUserId: access.actorUserId,
            type: 'CREATE',
          },
          select: { enrollmentId: true },
        }),
        this.prisma.lead.findMany({
          where: {
            organizationId: access.organizationId,
            assignedUserId: access.actorUserId,
          },
          select: { id: true },
        }),
        this.prisma.user.findFirst({
          where: { organizationId: access.organizationId, id: access.actorUserId },
          select: { personId: true },
        }),
      ]);
      for (const { enrollmentId } of created) visible.add(enrollmentId);
      const conversions = await this.prisma.leadConversion.findMany({
        where: {
          organizationId: access.organizationId,
          leadId: { in: assignedLeads.map(({ id }) => id) },
          enrollmentId: { in: candidateIds },
        },
        select: { enrollmentId: true },
      });
      for (const { enrollmentId } of conversions) visible.add(enrollmentId);

      const trainer = user
        ? await this.prisma.trainerProfile.findFirst({
            where: {
              organizationId: access.organizationId,
              personId: user.personId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      if (trainer) {
        const taughtSessions = await this.prisma.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            trainerId: trainer.id,
            bookingStatus: 'CONFIRMED',
          },
          select: { sessionId: true },
        });
        const sessions = await this.prisma.session.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: taughtSessions.map(({ sessionId }) => sessionId) },
          },
          select: { cohortId: true },
        });
        const placements = await this.prisma.enrollmentCohortAssignment.findMany({
          where: {
            organizationId: access.organizationId,
            enrollmentId: { in: candidateIds },
            cohortId: { in: sessions.map(({ cohortId }) => cohortId) },
          },
          select: { enrollmentId: true },
        });
        for (const { enrollmentId } of placements) visible.add(enrollmentId);
      }
    }
    return [...visible];
  }

  assertCreationScope(access: AccessContext, branchId?: string): void {
    const scopes = access.grants.get('students.create');
    if (scopes?.has('O')) return;
    if (branchId && access.branchIds.has(branchId) && (scopes?.has('B') || scopes?.has('A')))
      return;
    throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', messageKey: 'branches.notFound' });
  }
}
