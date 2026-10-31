import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { EnrollmentEventService } from './enrollment-event.service';
import type { CreateEnrollmentDto } from './enrollment.dto';
import { assertCohortCapacity, billingInvalid } from './enrollment-common';

@Injectable()
export class EnrollmentCreateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EnrollmentEventService,
  ) {}

  async create(access: AccessContext, input: CreateEnrollmentDto, correlationId: string) {
    this.assertCreationBranch(access, input.homeBranchId);
    return this.prisma.serializable(async (transaction) => {
      const [student, programVersion, cohort, branch] = await Promise.all([
        transaction.studentProfile.findFirst({
          where: {
            organizationId: access.organizationId,
            personId: input.studentPersonId,
          },
        }),
        transaction.programVersion.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.programVersionId,
            status: 'PUBLISHED',
          },
        }),
        transaction.cohort.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.cohortId,
            programVersionId: input.programVersionId,
            status: { in: ['PLANNED', 'ACTIVE'] },
          },
        }),
        transaction.branch.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.homeBranchId,
            isActive: true,
          },
        }),
      ]);
      if (!student) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_FOUND',
          messageKey: 'students.notFound',
        });
      }
      if (!programVersion) {
        throw new ConflictException({
          code: 'PROGRAM_VERSION_NOT_PUBLISHED',
          messageKey: 'academic.versionNotPublished',
        });
      }
      if (!cohort) {
        throw new ConflictException({
          code: 'COHORT_ENROLLMENT_INVALID',
          messageKey: 'enrollments.cohortInvalid',
        });
      }
      if (!branch) {
        throw new NotFoundException({
          code: 'BRANCH_NOT_FOUND',
          messageKey: 'branches.notFound',
        });
      }
      await assertCohortCapacity(transaction, access.organizationId, cohort.id);
      const billingAccountId = await this.resolveBillingAccount(transaction, access, input);
      const enrollment = await transaction.enrollment.create({
        data: {
          organizationId: access.organizationId,
          studentPersonId: input.studentPersonId,
          programVersionId: input.programVersionId,
          billingAccountId,
          homeBranchId: input.homeBranchId,
          kind: input.kind,
        },
      });
      await transaction.enrollmentCohortAssignment.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId: enrollment.id,
          cohortId: cohort.id,
          startsAt: new Date(),
          reason: 'ENROLLMENT_CREATED',
          createdBy: access.actorUserId,
        },
      });
      await this.eventService.record(
        transaction,
        access,
        enrollment.id,
        'create',
        null,
        'DRAFT',
        { correlationId, expectedVersion: 0 },
        { cohortId: cohort.id, billingAccountId },
      );
      return { ...enrollment, billingAccountId };
    });
  }

  private assertCreationBranch(access: AccessContext, branchId: string) {
    const scopes = access.grants.get('enrollments.create');
    if (
      scopes?.has('O') ||
      ((scopes?.has('B') || scopes?.has('A')) && access.branchIds.has(branchId))
    ) {
      return;
    }
    throw new NotFoundException({
      code: 'BRANCH_NOT_FOUND',
      messageKey: 'branches.notFound',
    });
  }

  private async resolveBillingAccount(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    input: CreateEnrollmentDto,
  ) {
    if (input.kind === 'INDIVIDUAL') {
      if (input.billingAccountId) {
        const billing = await transaction.billingAccount.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.billingAccountId,
            kind: 'INDIVIDUAL',
            personId: input.studentPersonId,
          },
        });
        if (!billing) throw billingInvalid();
        return billing.id;
      }
      const existing = await transaction.billingAccount.findFirst({
        where: {
          organizationId: access.organizationId,
          kind: 'INDIVIDUAL',
          personId: input.studentPersonId,
        },
      });
      if (existing) return existing.id;
      return (
        await transaction.billingAccount.create({
          data: {
            organizationId: access.organizationId,
            kind: 'INDIVIDUAL',
            personId: input.studentPersonId,
          },
        })
      ).id;
    }
    if (!input.billingAccountId) throw billingInvalid();
    const billing = await transaction.billingAccount.findFirst({
      where: {
        organizationId: access.organizationId,
        id: input.billingAccountId,
        kind: 'CORPORATE',
        businessAccountId: { not: null },
      },
    });
    if (!billing) throw billingInvalid();
    const business = await transaction.businessAccount.findFirst({
      where: {
        organizationId: access.organizationId,
        id: billing.businessAccountId!,
        status: 'ACTIVE',
      },
    });
    if (!business) throw billingInvalid();
    return billing.id;
  }
}
