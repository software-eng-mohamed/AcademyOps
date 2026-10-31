import { Injectable } from '@nestjs/common';
import type { AttendanceRecord, Prisma } from '@prisma/client';
import type { AccessContext, AttendanceStatus } from '@academyops/contracts';
import { OutboxService } from '../platform/outbox/outbox.service';
import { versionConflict } from './attendance.errors';
import type { AttendanceMutationResult } from './attendance.types';

@Injectable()
export class AttendanceRecordMutationService {
  constructor(private readonly outbox: OutboxService) {}

  async correct(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    record: AttendanceRecord,
    status: AttendanceStatus,
    reason: string,
  ): Promise<AttendanceMutationResult> {
    if (record.currentStatus === status) return { id: record.id, status, version: record.version };
    const updatedCount = await transaction.attendanceRecord.updateMany({
      where: {
        id: record.id,
        organizationId: access.organizationId,
        version: record.version,
      },
      data: {
        currentStatus: status,
        source: record.source === 'QR' && status === 'PRESENT' ? 'QR' : 'MANUAL',
        recordedAt: new Date(),
        recordedBy: access.actorUserId,
        version: { increment: 1 },
      },
    });
    if (updatedCount.count !== 1) throw versionConflict();
    const updated = await transaction.attendanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    await this.addEvent(
      transaction,
      access,
      record.id,
      updated.version,
      record.currentStatus,
      status,
      reason,
    );
    return { id: updated.id, status: updated.currentStatus, version: updated.version };
  }

  async addEvent(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    recordId: string,
    version: number,
    fromStatus: string,
    toStatus: string,
    reason: string,
  ): Promise<void> {
    await transaction.attendanceEvent.create({
      data: {
        organizationId: access.organizationId,
        attendanceRecordId: recordId,
        version,
        fromStatus,
        toStatus,
        reason,
        actorUserId: access.actorUserId,
      },
    });
    await this.outbox.add(transaction, {
      organizationId: access.organizationId,
      aggregateType: 'AttendanceRecord',
      aggregateId: recordId,
      type: 'attendance.recorded',
      payload: { recordId, version, toStatus },
    });
  }
}
