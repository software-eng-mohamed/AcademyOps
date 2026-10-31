import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';

@Injectable()
export class CertificateAccessService {
  async assertEnrollment(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    enrollmentId: string,
  ) {
    const visibleIds = await this.visibleEnrollmentIds(transaction, access, permission);
    const enrollment = await transaction.enrollment.findFirst({
      where: {
        organizationId: access.organizationId,
        AND: [
          { id: enrollmentId },
          ...(visibleIds === undefined ? [] : [{ id: { in: visibleIds } }]),
        ],
      },
    });
    if (!enrollment) throw this.notFound();
    return enrollment;
  }

  async assertCertificate(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    certificateId: string,
  ) {
    const certificate = await transaction.certificate.findFirst({
      where: { organizationId: access.organizationId, id: certificateId },
    });
    if (!certificate) throw this.notFound();
    await this.assertEnrollment(transaction, access, permission, certificate.enrollmentId);
    return certificate;
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

    if (scopes?.has('B') && access.branchIds.size) {
      const [homeEnrollments, cohorts] = await Promise.all([
        transaction.enrollment.findMany({
          where: {
            organizationId: access.organizationId,
            homeBranchId: { in: [...access.branchIds] },
          },
          select: { id: true },
        }),
        transaction.cohort.findMany({
          where: {
            organizationId: access.organizationId,
            owningBranchId: { in: [...access.branchIds] },
          },
          select: { id: true },
        }),
      ]);
      for (const { id } of homeEnrollments) ids.add(id);
      const placements = await transaction.enrollmentCohortAssignment.findMany({
        where: {
          organizationId: access.organizationId,
          cohortId: { in: cohorts.map(({ id }) => id) },
        },
        select: { enrollmentId: true },
      });
      for (const { enrollmentId } of placements) ids.add(enrollmentId);
    }

    if (scopes?.has('A')) {
      for (const id of access.assignedResourceIds) ids.add(id);
      const user = await transaction.user.findFirst({
        where: { organizationId: access.organizationId, id: access.actorUserId },
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
        const taughtSessions = await transaction.sessionTrainer.findMany({
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
            id: { in: taughtSessions.map(({ sessionId }) => sessionId) },
          },
          select: { cohortId: true },
        });
        const placements = await transaction.enrollmentCohortAssignment.findMany({
          where: {
            organizationId: access.organizationId,
            cohortId: { in: [...new Set(sessions.map(({ cohortId }) => cohortId))] },
          },
          select: { enrollmentId: true },
        });
        for (const { enrollmentId } of placements) ids.add(enrollmentId);
      }
    }

    return [...ids];
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'CERTIFICATE_RESOURCE_NOT_FOUND',
      messageKey: 'certificates.resourceNotFound',
    });
  }
}
