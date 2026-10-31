import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { CreateAttendancePolicyDto, ListAttendancePoliciesDto } from './attendance.dto';

export type ResolvedAttendancePolicy = {
  id: string | null;
  minimumRatio: number;
  lockAfterMinutes: number;
  checkInOpensBeforeMinutes: number;
  checkInClosesAfterMinutes: number;
};

type PolicyMutationResult = {
  id: string;
  version: number;
  minimumRatio: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

@Injectable()
export class AttendancePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(access: AccessContext, input: ListAttendancePoliciesDto) {
    const activeAt = input.activeAt ? new Date(input.activeAt) : undefined;
    const policies = await this.prisma.attendancePolicyVersion.findMany({
      where: {
        organizationId: access.organizationId,
        ...(input.programVersionId ? { programVersionId: input.programVersionId } : {}),
        ...(input.cohortId ? { cohortId: input.cohortId } : {}),
        ...(activeAt
          ? {
              effectiveFrom: { lte: activeAt },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: activeAt } }],
            }
          : {}),
      },
      orderBy: [{ programVersionId: 'asc' }, { cohortId: 'asc' }, { version: 'desc' }],
      take: 500,
    });
    return {
      items: policies.map((policy) => this.present(policy)),
    };
  }

  async create(
    access: AccessContext,
    input: CreateAttendancePolicyDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<PolicyMutationResult> {
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw this.invalidPeriod();

    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<PolicyMutationResult>(
        transaction,
        access.organizationId,
        'attendance.policy.create',
        idempotencyKey,
        input,
      );
      if (attempt.replayed) return attempt.response;

      const scopeKey = `${access.organizationId}:${input.programVersionId}:${input.cohortId ?? 'DEFAULT'}`;
      await transaction.$queryRaw<Array<{ locked: string }>>`
        SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))::text AS locked
      `;

      const programVersion = await transaction.programVersion.findFirst({
        where: { organizationId: access.organizationId, id: input.programVersionId },
        select: { id: true },
      });
      if (!programVersion) throw this.notFound();
      if (input.cohortId) {
        const cohort = await transaction.cohort.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.cohortId,
            programVersionId: input.programVersionId,
          },
          select: { id: true },
        });
        if (!cohort) throw this.notFound();
      }

      const latest = await transaction.attendancePolicyVersion.findFirst({
        where: {
          organizationId: access.organizationId,
          programVersionId: input.programVersionId,
          cohortId: input.cohortId ?? null,
        },
        orderBy: { version: 'desc' },
      });
      if (latest && effectiveFrom <= latest.effectiveFrom) {
        throw new ConflictException({
          code: 'ATTENDANCE_POLICY_CHRONOLOGY_INVALID',
          messageKey: 'attendance.policyChronologyInvalid',
        });
      }
      if (latest?.effectiveTo && effectiveFrom < latest.effectiveTo) throw this.invalidPeriod();
      if (latest && !latest.effectiveTo) {
        await transaction.attendancePolicyVersion.update({
          where: { id: latest.id },
          data: { effectiveTo: effectiveFrom },
        });
      }

      const created = await transaction.attendancePolicyVersion.create({
        data: {
          organizationId: access.organizationId,
          programVersionId: input.programVersionId,
          cohortId: input.cohortId ?? null,
          version: (latest?.version ?? 0) + 1,
          minimumRatio: new Prisma.Decimal(input.minimumRatio),
          lockAfterMinutes: input.lockAfterMinutes,
          checkInOpensBeforeMinutes: input.checkInOpensBeforeMinutes,
          checkInClosesAfterMinutes: input.checkInClosesAfterMinutes,
          effectiveFrom,
          effectiveTo,
          createdBy: access.actorUserId,
        },
      });
      const result = this.mutationResult(created);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.policy.create',
        entityType: 'AttendancePolicyVersion',
        entityId: created.id,
        correlationId,
        after: result,
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'AttendancePolicyVersion',
        aggregateId: created.id,
        type: 'attendance.policy.created',
        payload: result,
      });
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }

  async resolve(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    programVersionId: string,
    cohortId: string,
    at: Date,
  ): Promise<ResolvedAttendancePolicy> {
    const common = {
      organizationId,
      programVersionId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    };
    const policy =
      (await transaction.attendancePolicyVersion.findFirst({
        where: { ...common, cohortId },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      })) ??
      (await transaction.attendancePolicyVersion.findFirst({
        where: { ...common, cohortId: null },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      }));
    if (!policy) {
      return {
        id: null,
        minimumRatio: 0.8,
        lockAfterMinutes: 1440,
        checkInOpensBeforeMinutes: 30,
        checkInClosesAfterMinutes: 30,
      };
    }
    return {
      id: policy.id,
      minimumRatio: policy.minimumRatio.toNumber(),
      lockAfterMinutes: policy.lockAfterMinutes,
      checkInOpensBeforeMinutes: policy.checkInOpensBeforeMinutes,
      checkInClosesAfterMinutes: policy.checkInClosesAfterMinutes,
    };
  }

  private present(policy: {
    id: string;
    programVersionId: string;
    cohortId: string | null;
    version: number;
    minimumRatio: Prisma.Decimal;
    lockAfterMinutes: number;
    checkInOpensBeforeMinutes: number;
    checkInClosesAfterMinutes: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdBy: string;
    createdAt: Date;
  }) {
    return {
      ...policy,
      minimumRatio: policy.minimumRatio.toFixed(4),
      effectiveFrom: policy.effectiveFrom.toISOString(),
      effectiveTo: policy.effectiveTo?.toISOString() ?? null,
      createdAt: policy.createdAt.toISOString(),
    };
  }

  private mutationResult(policy: {
    id: string;
    version: number;
    minimumRatio: Prisma.Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }): PolicyMutationResult {
    return {
      id: policy.id,
      version: policy.version,
      minimumRatio: policy.minimumRatio.toFixed(4),
      effectiveFrom: policy.effectiveFrom.toISOString(),
      effectiveTo: policy.effectiveTo?.toISOString() ?? null,
    };
  }

  private invalidPeriod(): ConflictException {
    return new ConflictException({
      code: 'ATTENDANCE_POLICY_PERIOD_INVALID',
      messageKey: 'attendance.policyPeriodInvalid',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ATTENDANCE_POLICY_SCOPE_NOT_FOUND',
      messageKey: 'attendance.policyScopeNotFound',
    });
  }
}
