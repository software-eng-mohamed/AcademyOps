import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { IdempotencyService } from '../platform/idempotency/idempotency.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { AttendanceAccessService } from './attendance-access.service';
import type { MakeupMutationResult } from './attendance.types';

@Injectable()
export class AttendanceMakeupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
    private readonly accessService: AttendanceAccessService,
  ) {}

  async create(
    access: AccessContext,
    missedRecordId: string,
    makeupRecordId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<MakeupMutationResult> {
    return this.prisma.serializable(async (transaction) => {
      const [missedInitial, makeupInitial] = await Promise.all([
        this.accessService.assertRecord(
          transaction,
          access,
          'attendance.correct_after_lock',
          missedRecordId,
        ),
        this.accessService.assertRecord(
          transaction,
          access,
          'attendance.correct_after_lock',
          makeupRecordId,
        ),
      ]);
      const attempt = await this.idempotency.begin<MakeupMutationResult>(
        transaction,
        access.organizationId,
        'attendance.makeup.create',
        idempotencyKey,
        { missedRecordId, makeupRecordId },
      );
      if (attempt.replayed) return attempt.response;

      const orderedIds = [missedRecordId, makeupRecordId].sort();
      await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id::text
        FROM attendance_records
        WHERE organization_id = ${access.organizationId}::uuid
          AND id IN (${Prisma.join(orderedIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
        FOR UPDATE
      `);
      const [missed, makeup] = await Promise.all([
        transaction.attendanceRecord.findUniqueOrThrow({ where: { id: missedInitial.record.id } }),
        transaction.attendanceRecord.findUniqueOrThrow({ where: { id: makeupInitial.record.id } }),
      ]);
      if (
        missed.currentStatus !== 'ABSENT' ||
        !['PRESENT', 'LATE'].includes(makeup.currentStatus) ||
        missed.enrollmentId !== makeup.enrollmentId ||
        missed.sessionId === makeup.sessionId
      ) {
        throw new ConflictException({
          code: 'MAKEUP_INVALID',
          messageKey: 'attendance.makeupInvalid',
        });
      }
      let credit;
      try {
        credit = await transaction.makeupCredit.create({
          data: {
            organizationId: access.organizationId,
            missedRecordId,
            makeupRecordId,
            approvedBy: access.actorUserId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({
            code: 'MAKEUP_ALREADY_USED',
            messageKey: 'attendance.makeupAlreadyUsed',
          });
        }
        throw error;
      }
      const result = { id: credit.id };
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'attendance.makeup.create',
        entityType: 'MakeupCredit',
        entityId: credit.id,
        correlationId,
        after: { missedRecordId, makeupRecordId },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Enrollment',
        aggregateId: missed.enrollmentId,
        type: 'attendance.makeup.created',
        payload: { creditId: credit.id, missedRecordId, makeupRecordId },
      });
      await this.idempotency.complete(transaction, attempt.recordId, 201, result);
      return result;
    });
  }
}
