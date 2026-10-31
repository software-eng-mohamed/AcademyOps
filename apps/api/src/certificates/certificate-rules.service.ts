import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { CreateCertificateRuleDto, ListCertificateRulesDto } from './certificates.dto';

type RuleMutationResult = {
  id: string;
  version: number;
  minimumRatio: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

@Injectable()
export class CertificateRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(access: AccessContext, input: ListCertificateRulesDto) {
    const activeAt = input.activeAt ? new Date(input.activeAt) : undefined;
    const rules = await this.prisma.certificateRuleVersion.findMany({
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
    return { items: rules.map((rule) => this.present(rule)) };
  }

  async create(
    access: AccessContext,
    input: CreateCertificateRuleDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<RuleMutationResult> {
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw this.invalidPeriod();

    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<RuleMutationResult>(
        transaction,
        access.organizationId,
        'certificate.rule.create',
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

      const latest = await transaction.certificateRuleVersion.findFirst({
        where: {
          organizationId: access.organizationId,
          programVersionId: input.programVersionId,
          cohortId: input.cohortId ?? null,
        },
        orderBy: { version: 'desc' },
      });
      if (latest && effectiveFrom <= latest.effectiveFrom) {
        throw new ConflictException({
          code: 'CERTIFICATE_RULE_CHRONOLOGY_INVALID',
          messageKey: 'certificates.ruleChronologyInvalid',
        });
      }
      if (latest?.effectiveTo && effectiveFrom < latest.effectiveTo) throw this.invalidPeriod();
      if (latest && !latest.effectiveTo) {
        await transaction.certificateRuleVersion.update({
          where: { id: latest.id },
          data: { effectiveTo: effectiveFrom },
        });
      }
      const created = await transaction.certificateRuleVersion.create({
        data: {
          organizationId: access.organizationId,
          programVersionId: input.programVersionId,
          cohortId: input.cohortId ?? null,
          version: (latest?.version ?? 0) + 1,
          minimumRatio: new Prisma.Decimal(input.minimumRatio),
          effectiveFrom,
          effectiveTo,
          createdBy: access.actorUserId,
        },
      });
      const result = this.mutationResult(created);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'certificate.rule.create',
        entityType: 'CertificateRuleVersion',
        entityId: created.id,
        correlationId,
        after: result,
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'CertificateRuleVersion',
        aggregateId: created.id,
        type: 'certificate.rule.created',
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
    cohortId: string | null,
    at: Date,
  ) {
    const common = {
      organizationId,
      programVersionId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    };
    const specific = cohortId
      ? await transaction.certificateRuleVersion.findFirst({
          where: { ...common, cohortId },
          orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
        })
      : null;
    return (
      specific ??
      transaction.certificateRuleVersion.findFirst({
        where: { ...common, cohortId: null },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      })
    );
  }

  private present(rule: {
    id: string;
    programVersionId: string;
    cohortId: string | null;
    version: number;
    minimumRatio: Prisma.Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdBy: string;
    createdAt: Date;
  }) {
    return {
      ...rule,
      minimumRatio: rule.minimumRatio.toFixed(4),
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      createdAt: rule.createdAt.toISOString(),
    };
  }

  private mutationResult(rule: {
    id: string;
    version: number;
    minimumRatio: Prisma.Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }): RuleMutationResult {
    return {
      id: rule.id,
      version: rule.version,
      minimumRatio: rule.minimumRatio.toFixed(4),
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
    };
  }

  private invalidPeriod(): ConflictException {
    return new ConflictException({
      code: 'CERTIFICATE_RULE_PERIOD_INVALID',
      messageKey: 'certificates.rulePeriodInvalid',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'CERTIFICATE_RULE_SCOPE_NOT_FOUND',
      messageKey: 'certificates.ruleScopeNotFound',
    });
  }
}
