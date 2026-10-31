import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { mergeStudentBillingAccounts } from './student-billing-merge';
import { StudentScopePolicyService } from './student-scope-policy.service';
import type { MergeStudentDto } from './students.dto';

type MergeMeta = {
  sourceVersion: number;
  idempotencyKey: string;
  correlationId: string;
};
type MergeResult = {
  sourcePersonId: string;
  targetPersonId: string;
  targetVersion: number;
  movedEnrollments: number;
  movedBillingAccounts: number;
};

@Injectable()
export class StudentMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly scope: StudentScopePolicyService,
  ) {}

  async merge(
    access: AccessContext,
    sourcePersonId: string,
    input: MergeStudentDto,
    meta: MergeMeta,
  ) {
    if (sourcePersonId === input.targetPersonId) {
      throw new ConflictException({
        code: 'STUDENT_MERGE_SAME_PERSON',
        messageKey: 'students.mergeSamePerson',
      });
    }
    await Promise.all([
      this.scope.assertVisible(access, sourcePersonId, 'students.merge'),
      this.scope.assertVisible(access, input.targetPersonId, 'students.merge'),
    ]);
    return this.prisma.serializable(async (transaction) => {
      const lockIds = [sourcePersonId, input.targetPersonId].sort();
      await transaction.$queryRaw`SELECT id FROM persons WHERE organization_id = ${access.organizationId}::uuid AND id IN (${lockIds[0]}::uuid, ${lockIds[1]}::uuid) ORDER BY id FOR UPDATE`;
      const people = await transaction.person.findMany({
        where: { organizationId: access.organizationId, id: { in: lockIds } },
      });
      const source = people.find(({ id }) => id === sourcePersonId);
      const target = people.find(({ id }) => id === input.targetPersonId);
      if (!source || !target) throw this.notFound();
      const attempt = await this.idempotency.begin<MergeResult>(
        transaction,
        access.organizationId,
        'student.merge',
        meta.idempotencyKey,
        { sourcePersonId, ...input, sourceVersion: meta.sourceVersion },
      );
      if (attempt.replayed) return attempt.response;
      if (source.version !== meta.sourceVersion || target.version !== input.targetVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          messageKey: 'errors.versionConflict',
        });
      }
      const profiles = await transaction.studentProfile.findMany({
        where: {
          organizationId: access.organizationId,
          personId: { in: lockIds },
        },
      });
      if (
        !profiles.some(({ personId }) => personId === source.id) ||
        !profiles.some(({ personId }) => personId === target.id)
      )
        throw this.notFound();
      const [
        staffCount,
        trainerCount,
        sourceUser,
        targetUser,
        sourceRegistration,
        targetRegistration,
      ] = await Promise.all([
        transaction.staffProfile.count({
          where: { organizationId: access.organizationId, personId: source.id },
        }),
        transaction.trainerProfile.count({
          where: { organizationId: access.organizationId, personId: source.id },
        }),
        transaction.user.findFirst({
          where: { organizationId: access.organizationId, personId: source.id },
        }),
        transaction.user.findFirst({
          where: { organizationId: access.organizationId, personId: target.id },
        }),
        transaction.studentRegistration.findFirst({
          where: { organizationId: access.organizationId, personId: source.id },
        }),
        transaction.studentRegistration.findFirst({
          where: { organizationId: access.organizationId, personId: target.id },
        }),
      ]);
      if (staffCount || trainerCount) {
        throw new ConflictException({
          code: 'STUDENT_MERGE_STAFF_IDENTITY',
          messageKey: 'students.mergeStaffIdentity',
        });
      }
      if ((sourceUser && targetUser) || (sourceRegistration && targetRegistration)) {
        throw new ConflictException({
          code: 'STUDENT_MERGE_PORTAL_CONFLICT',
          messageKey: 'students.mergePortalConflict',
        });
      }
      const sourceContacts = await transaction.personContact.findMany({
        where: { organizationId: access.organizationId, personId: source.id },
      });
      const targetContacts = await transaction.personContact.findMany({
        where: { organizationId: access.organizationId, personId: target.id },
      });
      const contactKeys = new Set(
        targetContacts.map(
          (contact) =>
            `${contact.type}|${(contact.normalizedValue ?? contact.rawValue).trim().toLowerCase()}`,
        ),
      );
      const duplicateContactIds = sourceContacts
        .filter((contact) =>
          contactKeys.has(
            `${contact.type}|${(contact.normalizedValue ?? contact.rawValue).trim().toLowerCase()}`,
          ),
        )
        .map(({ id }) => id);
      if (duplicateContactIds.length)
        await transaction.personContact.deleteMany({
          where: { id: { in: duplicateContactIds } },
        });
      await transaction.personContact.updateMany({
        where: { organizationId: access.organizationId, personId: source.id },
        data: { personId: target.id },
      });

      const businessLinks = await transaction.businessAccountContact.findMany({
        where: { organizationId: access.organizationId, personId: source.id },
      });
      for (const link of businessLinks) {
        const exists = await transaction.businessAccountContact.findFirst({
          where: {
            organizationId: access.organizationId,
            businessAccountId: link.businessAccountId,
            personId: target.id,
          },
        });
        if (exists)
          await transaction.businessAccountContact.delete({
            where: { id: link.id },
          });
        else
          await transaction.businessAccountContact.update({
            where: { id: link.id },
            data: { personId: target.id },
          });
      }

      const enrollments = await transaction.enrollment.updateMany({
        where: {
          organizationId: access.organizationId,
          studentPersonId: source.id,
        },
        data: { studentPersonId: target.id },
      });
      const movedBillingAccounts = await mergeStudentBillingAccounts(
        transaction,
        access.organizationId,
        source.id,
        target.id,
      );
      await Promise.all([
        transaction.lead.updateMany({
          where: { organizationId: access.organizationId, personId: source.id },
          data: { personId: target.id },
        }),
        transaction.leadConversion.updateMany({
          where: { organizationId: access.organizationId, personId: source.id },
          data: { personId: target.id },
        }),
        transaction.attendanceAnomaly.updateMany({
          where: {
            organizationId: access.organizationId,
            studentPersonId: source.id,
          },
          data: { studentPersonId: target.id },
        }),
        transaction.personMatchCandidate.updateMany({
          where: {
            organizationId: access.organizationId,
            candidatePersonId: source.id,
          },
          data: { candidatePersonId: target.id },
        }),
        transaction.legacyReference.updateMany({
          where: {
            organizationId: access.organizationId,
            entityType: 'Person',
            entityId: source.id,
          },
          data: { entityId: target.id },
        }),
        transaction.importRow.updateMany({
          where: {
            organizationId: access.organizationId,
            targetType: 'Person',
            targetId: source.id,
          },
          data: { targetId: target.id },
        }),
      ]);
      if (sourceUser)
        await transaction.user.update({
          where: { id: sourceUser.id },
          data: { personId: target.id, version: { increment: 1 } },
        });
      if (sourceRegistration)
        await transaction.studentRegistration.update({
          where: { id: sourceRegistration.id },
          data: { personId: target.id, version: { increment: 1 } },
        });
      await transaction.studentProfile.deleteMany({
        where: { organizationId: access.organizationId, personId: source.id },
      });
      await transaction.person.update({
        where: { id: source.id },
        data: { version: { increment: 1 } },
      });
      const updatedTarget = await transaction.person.update({
        where: { id: target.id },
        data: { version: { increment: 1 } },
      });
      const result: MergeResult = {
        sourcePersonId: source.id,
        targetPersonId: target.id,
        targetVersion: updatedTarget.version,
        movedEnrollments: enrollments.count,
        movedBillingAccounts,
      };
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.merge',
        entityType: 'Person',
        entityId: target.id,
        correlationId: meta.correlationId,
        before: {
          sourcePersonId: source.id,
          sourcePublicId: source.publicId,
          targetVersion: target.version,
        },
        after: { ...result, reason: input.reason.trim() },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Student',
        aggregateId: target.id,
        type: 'student.merged',
        payload: result,
      });
      await this.idempotency.complete(transaction, attempt.recordId, 200, result);
      return result;
    });
  }

  private notFound() {
    return new NotFoundException({
      code: 'STUDENT_NOT_FOUND',
      messageKey: 'students.notFound',
    });
  }
}
