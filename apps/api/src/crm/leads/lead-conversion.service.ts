import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { LeadAccessService } from './lead-access.service';
import { LeadPersonService } from './lead-person.service';
import { LeadTransitionService } from './lead-transition.service';
import { billingNotFound, notFound, versionConflict } from './leads.errors';
import type { WinLeadDto } from './leads.dto';

type MutationMeta = { correlationId: string; expectedVersion: number };
type WinMutationMeta = MutationMeta & { idempotencyKey: string };
type WinResult = { leadId: string; personId: string; enrollmentId: string; version: number };
type Transaction = Prisma.TransactionClient;

@Injectable()
export class LeadConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly access: LeadAccessService,
    private readonly person: LeadPersonService,
    private readonly transition: LeadTransitionService,
  ) {}

  async win(
    access: AccessContext,
    leadId: string,
    input: WinLeadDto,
    meta: WinMutationMeta,
  ): Promise<WinResult> {
    this.access.assertBranchScope(access, input.homeBranchId, 'leads.convert');
    return this.prisma.serializable(async (transaction) => {
      const attempt = await this.idempotency.begin<WinResult>(
        transaction,
        access.organizationId,
        'lead.win',
        meta.idempotencyKey,
        { leadId, input, expectedVersion: meta.expectedVersion },
      );
      if (attempt.replayed) return attempt.response;
      await transaction.$queryRaw`SELECT id FROM leads WHERE id = ${leadId}::uuid AND organization_id = ${access.organizationId}::uuid FOR UPDATE`;
      const lead = await transaction.lead.findFirst({
        where: { id: leadId, organizationId: access.organizationId },
      });
      if (!lead) throw notFound();
      this.access.assertLeadScope(access, lead, 'leads.convert');
      const existing = await transaction.leadConversion.findFirst({
        where: { organizationId: access.organizationId, leadId },
      });
      if (existing) {
        const result = {
          leadId,
          personId: existing.personId,
          enrollmentId: existing.enrollmentId,
          version: lead.version,
        };
        await this.idempotency.complete(transaction, attempt.recordId, 200, result);
        return result;
      }
      this.transition.nextState(lead.state, 'win');
      if (lead.version !== meta.expectedVersion) throw versionConflict();

      const personId = await this.person.resolvePersonForWin(
        transaction,
        access.organizationId,
        lead.personId,
        input,
      );
      const academicTarget = await this.validateAcademicTarget(
        transaction,
        access.organizationId,
        input,
      );
      const billingAccountId = await this.resolveBillingAccount(
        transaction,
        access.organizationId,
        personId,
        input,
      );
      await transaction.studentProfile.upsert({
        where: { organizationId_personId: { organizationId: access.organizationId, personId } },
        update: {},
        create: { organizationId: access.organizationId, personId },
      });
      await this.assertCohortCapacity(transaction, access.organizationId, academicTarget.id);
      const enrollment = await transaction.enrollment.create({
        data: {
          organizationId: access.organizationId,
          studentPersonId: personId,
          programVersionId: input.programVersionId,
          billingAccountId,
          homeBranchId: input.homeBranchId,
          kind: input.kind,
          state: 'DRAFT',
        },
      });
      await transaction.enrollmentCohortAssignment.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId: enrollment.id,
          cohortId: academicTarget.id,
          startsAt: new Date(),
          reason: 'LEAD_CONVERSION',
          createdBy: access.actorUserId,
        },
      });
      await transaction.enrollmentEvent.create({
        data: {
          organizationId: access.organizationId,
          enrollmentId: enrollment.id,
          type: 'CREATE',
          toState: 'DRAFT',
          reason: 'LEAD_CONVERSION',
          actorUserId: access.actorUserId,
          data: { leadId, cohortId: academicTarget.id },
        },
      });
      await transaction.leadConversion.create({
        data: {
          organizationId: access.organizationId,
          leadId,
          personId,
          enrollmentId: enrollment.id,
          convertedBy: access.actorUserId,
        },
      });
      await transaction.lead.update({
        where: { id: lead.id },
        data: { personId, state: 'WON', version: { increment: 1 } },
      });
      await transaction.leadStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          leadId,
          fromState: lead.state,
          toState: 'WON',
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'lead.win',
        entityType: 'Lead',
        entityId: leadId,
        correlationId: meta.correlationId,
        after: { personId, enrollmentId: enrollment.id, billingAccountId },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Lead',
        aggregateId: leadId,
        type: 'lead.won',
        payload: { leadId, personId, enrollmentId: enrollment.id },
      });
      const result = { leadId, personId, enrollmentId: enrollment.id, version: lead.version + 1 };
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private async validateAcademicTarget(
    transaction: Transaction,
    organizationId: string,
    input: WinLeadDto,
  ) {
    const [programVersion, cohort, homeBranch] = await Promise.all([
      transaction.programVersion.findFirst({
        where: { organizationId, id: input.programVersionId, status: 'PUBLISHED' },
      }),
      transaction.cohort.findFirst({
        where: {
          organizationId,
          id: input.cohortId,
          programVersionId: input.programVersionId,
          status: { in: ['PLANNED', 'ACTIVE'] },
        },
      }),
      transaction.branch.findFirst({
        where: { organizationId, id: input.homeBranchId, isActive: true },
      }),
    ]);
    if (!programVersion)
      throw new ConflictException({
        code: 'PROGRAM_VERSION_NOT_PUBLISHED',
        messageKey: 'academic.versionNotPublished',
      });
    if (!cohort)
      throw new ConflictException({
        code: 'COHORT_ENROLLMENT_INVALID',
        messageKey: 'enrollments.cohortInvalid',
      });
    if (!homeBranch)
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', messageKey: 'branches.notFound' });
    return cohort;
  }

  private async assertCohortCapacity(
    transaction: Transaction,
    organizationId: string,
    cohortId: string,
  ) {
    const cohort = await transaction.cohort.findFirst({
      where: { organizationId, id: cohortId },
      select: { capacity: true },
    });
    if (!cohort || cohort.capacity === null) return;
    const occupied = await transaction.enrollmentCohortAssignment.count({
      where: { organizationId, cohortId, endsAt: null },
    });
    if (occupied >= cohort.capacity)
      throw new ConflictException({
        code: 'COHORT_CAPACITY_REACHED',
        messageKey: 'enrollments.cohortCapacityReached',
      });
  }

  private async resolveBillingAccount(
    transaction: Transaction,
    organizationId: string,
    personId: string,
    input: WinLeadDto,
  ): Promise<string> {
    if (input.kind === 'INDIVIDUAL') {
      if (input.billingAccountId) {
        const billing = await transaction.billingAccount.findFirst({
          where: {
            organizationId,
            id: input.billingAccountId,
            kind: 'INDIVIDUAL',
            personId,
          },
        });
        if (!billing) throw billingNotFound();
        return billing.id;
      }
      const existing = await transaction.billingAccount.findFirst({
        where: { organizationId, kind: 'INDIVIDUAL', personId },
      });
      if (existing) return existing.id;
      return (
        await transaction.billingAccount.create({
          data: { organizationId, kind: 'INDIVIDUAL', personId },
        })
      ).id;
    }
    if (!input.billingAccountId) throw billingNotFound();
    const corporate = await transaction.billingAccount.findFirst({
      where: {
        organizationId,
        id: input.billingAccountId,
        kind: 'CORPORATE',
        businessAccountId: { not: null },
      },
    });
    if (!corporate) throw billingNotFound();
    const business = await transaction.businessAccount.findFirst({
      where: { organizationId, id: corporate.businessAccountId!, status: 'ACTIVE' },
    });
    if (!business) throw billingNotFound();
    return corporate.id;
  }
}
