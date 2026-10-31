import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import type { ListEnrollmentsDto } from './enrollment.dto';
import { enrollmentNotFound } from './enrollment-common';
@Injectable()
export class EnrollmentQueryService {
  constructor(private readonly prisma: PrismaService) {}
  async list(access: AccessContext, input: ListEnrollmentsDto) {
    const visibleIds = await this.prisma.$transaction((transaction) =>
      this.visibleEnrollmentIds(transaction, access, 'enrollments.read'),
    );
    const cohortEnrollmentIds = input.cohortId
      ? (
          await this.prisma.enrollmentCohortAssignment.findMany({
            where: {
              organizationId: access.organizationId,
              cohortId: input.cohortId,
            },
            select: { enrollmentId: true },
          })
        ).map(({ enrollmentId }) => enrollmentId)
      : undefined;
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        organizationId: access.organizationId,
        AND: [
          ...(visibleIds ? [{ id: { in: visibleIds } }] : []),
          ...(cohortEnrollmentIds ? [{ id: { in: cohortEnrollmentIds } }] : []),
        ],
        ...(input.studentPersonId ? { studentPersonId: input.studentPersonId } : {}),
        ...(input.branchId ? { homeBranchId: input.branchId } : {}),
        ...(input.programVersionId ? { programVersionId: input.programVersionId } : {}),
        ...(input.state ? { state: input.state } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const items = await this.hydrateEnrollments(enrollments.slice(0, input.limit));
    return {
      items,
      nextCursor:
        enrollments.length > input.limit ? (enrollments[input.limit - 1]?.id ?? null) : null,
    };
  }
  async read(access: AccessContext, enrollmentId: string) {
    const enrollment = await this.prisma.$transaction((transaction) =>
      this.findScoped(transaction, access, enrollmentId, 'enrollments.read'),
    );
    const canReadCancellationRequests = await this.prisma.$transaction(async (transaction) => {
      for (const permission of [
        'enrollments.cancel.approve',
        'enrollments.cancel.request',
      ] as const) {
        if (!access.grants.has(permission)) continue;
        const visibleIds = await this.visibleEnrollmentIds(transaction, access, permission);
        if (visibleIds === undefined || visibleIds.includes(enrollmentId)) return true;
      }
      return false;
    });
    const [hydrated, assignments, events, retakes, cancellationRequests] = await Promise.all([
      this.hydrateEnrollments([enrollment]),
      this.prisma.enrollmentCohortAssignment.findMany({
        where: { organizationId: access.organizationId, enrollmentId },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.enrollmentEvent.findMany({
        where: { organizationId: access.organizationId, enrollmentId },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.prisma.moduleRetake.findMany({
        where: { organizationId: access.organizationId, enrollmentId },
        orderBy: { createdAt: 'desc' },
      }),
      canReadCancellationRequests
        ? this.prisma.enrollmentCancellationRequest.findMany({
            where: { organizationId: access.organizationId, enrollmentId },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    const canReadFinance =
      access.grants.has('pricing.read') || access.grants.has('finance.balance.read');
    let finance: unknown;
    if (canReadFinance) {
      const [agreements, entries] = await Promise.all([
        this.prisma.pricingAgreement.findMany({
          where: { organizationId: access.organizationId, enrollmentId },
          orderBy: { version: 'desc' },
        }),
        this.prisma.ledgerEntry.findMany({
          where: { organizationId: access.organizationId, enrollmentId },
          select: { direction: true, amount: true },
        }),
      ]);
      const balance = entries.reduce(
        (total, entry) => total + Number(entry.amount) * (entry.direction === 'DEBIT' ? 1 : -1),
        0,
      );
      finance = {
        agreements,
        balance: balance.toFixed(2),
        currencyCode: 'EGP',
      };
    }
    return {
      ...hydrated[0],
      assignments,
      events,
      retakes,
      cancellationRequests,
      ...(canReadFinance ? { finance } : {}),
    };
  }
  async findScoped(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    id: string,
    permission: PermissionCode,
  ) {
    const enrollment = await transaction.enrollment.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!enrollment) throw enrollmentNotFound();
    const visibleIds = await this.visibleEnrollmentIds(transaction, access, permission);
    if (visibleIds === undefined || visibleIds.includes(enrollment.id)) {
      return enrollment;
    }
    throw enrollmentNotFound();
  }
  async visibleEnrollmentIds(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
  ): Promise<string[] | undefined> {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return undefined;
    const ids = new Set<string>();
    if (scopes?.has('S') && access.studentPersonId) {
      const self = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          studentPersonId: access.studentPersonId,
        },
        select: { id: true },
      });
      for (const { id } of self) ids.add(id);
    }
    if (scopes?.has('B')) {
      const branchEnrollments = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          homeBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      for (const { id } of branchEnrollments) ids.add(id);
    }
    if (scopes?.has('A')) {
      const createdEvents = await transaction.enrollmentEvent.findMany({
        where: {
          organizationId: access.organizationId,
          actorUserId: access.actorUserId,
          type: 'CREATE',
        },
        select: { enrollmentId: true },
      });
      for (const { enrollmentId } of createdEvents) ids.add(enrollmentId);
      const assignedLeads = await transaction.lead.findMany({
        where: {
          organizationId: access.organizationId,
          assignedUserId: access.actorUserId,
        },
        select: { id: true },
      });
      const conversions = await transaction.leadConversion.findMany({
        where: {
          organizationId: access.organizationId,
          leadId: { in: assignedLeads.map(({ id }) => id) },
        },
        select: { enrollmentId: true },
      });
      for (const { enrollmentId } of conversions) ids.add(enrollmentId);
      const user = await transaction.user.findFirst({
        where: {
          organizationId: access.organizationId,
          id: access.actorUserId,
        },
        select: { personId: true },
      });
      const trainer = user
        ? await transaction.trainerProfile.findFirst({
            where: {
              organizationId: access.organizationId,
              personId: user.personId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null;
      if (trainer) {
        const trainerSessions = await transaction.sessionTrainer.findMany({
          where: {
            organizationId: access.organizationId,
            trainerId: trainer.id,
            bookingStatus: 'CONFIRMED',
          },
          select: { sessionId: true },
        });
        const sessions = await transaction.session.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: trainerSessions.map(({ sessionId }) => sessionId) },
          },
          select: { cohortId: true },
        });
        const assignments = await transaction.enrollmentCohortAssignment.findMany({
          where: {
            organizationId: access.organizationId,
            cohortId: { in: sessions.map(({ cohortId }) => cohortId) },
          },
          select: { enrollmentId: true },
        });
        for (const { enrollmentId } of assignments) ids.add(enrollmentId);
      }
    }
    return [...ids];
  }
  async hydrateEnrollments<
    T extends {
      id: string;
      organizationId: string;
      studentPersonId: string;
      programVersionId: string;
    },
  >(enrollments: T[]) {
    if (!enrollments.length) return [];
    const organizationId = enrollments[0]!.organizationId;
    const [people, versions, assignments] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          organizationId,
          id: { in: enrollments.map(({ studentPersonId }) => studentPersonId) },
        },
        select: { id: true, publicId: true, name: true },
      }),
      this.prisma.programVersion.findMany({
        where: {
          organizationId,
          id: { in: enrollments.map(({ programVersionId }) => programVersionId) },
        },
      }),
      this.prisma.enrollmentCohortAssignment.findMany({
        where: {
          organizationId,
          enrollmentId: { in: enrollments.map(({ id }) => id) },
          endsAt: null,
        },
      }),
    ]);
    const programs = await this.prisma.program.findMany({
      where: {
        organizationId,
        id: { in: versions.map(({ programId }) => programId) },
      },
    });
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        organizationId,
        id: { in: assignments.map(({ cohortId }) => cohortId) },
      },
    });
    return enrollments.map((enrollment) => {
      const version = versions.find(({ id }) => id === enrollment.programVersionId) ?? null;
      const assignment =
        assignments.find(({ enrollmentId }) => enrollmentId === enrollment.id) ?? null;
      return {
        ...enrollment,
        student: people.find(({ id }) => id === enrollment.studentPersonId) ?? null,
        programVersion: version,
        program: programs.find(({ id }) => id === version?.programId) ?? null,
        activeCohortAssignment: assignment,
        cohort: cohorts.find(({ id }) => id === assignment?.cohortId) ?? null,
      };
    });
  }
}
