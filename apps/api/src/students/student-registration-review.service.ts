import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { AuditService } from '../platform/audit/audit.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import type {
  ApproveStudentRegistrationDto,
  StudentRegistrationDetailDto,
} from './student-registration.dto';
import { requireRegistrationApprovalProof } from './student-registration-approval-proof';
import { presentRegistrationDetail } from './student-registration-presenter';

interface RegistrationRow {
  id: string;
  version: number;
  status: string;
  person_id: string;
  user_id: string;
}

@Injectable()
export class StudentRegistrationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async approve(
    access: AccessContext,
    id: string,
    ifMatch: number,
    proof: ApproveStudentRegistrationDto,
    correlationId: string,
  ): Promise<StudentRegistrationDetailDto> {
    const verificationReference = requireRegistrationApprovalProof(proof);
    return this.prisma.serializable(async (transaction) => {
      const rows = await transaction.$queryRaw<RegistrationRow[]>`
        SELECT id, version, status, person_id, user_id
        FROM student_registrations
        WHERE organization_id = ${access.organizationId}::uuid AND id = ${id}::uuid
        FOR UPDATE
      `;
      const registration = rows[0];
      if (!registration) {
        throw new NotFoundException({
          code: 'REGISTRATION_NOT_FOUND',
          messageKey: 'students.registration.notFound',
        });
      }
      if (registration.version !== ifMatch) {
        throw new ConflictException({
          code: 'VERSION_MISMATCH',
          messageKey: 'common.versionMismatch',
        });
      }
      if (registration.status !== 'PENDING') {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          messageKey: 'students.registration.invalidTransition',
        });
      }

      const studentRole = await transaction.role.findFirst({
        where: { organizationId: access.organizationId, code: 'STUDENT', isSystem: true },
      });
      if (!studentRole) {
        throw new NotFoundException({
          code: 'STUDENT_ROLE_NOT_FOUND',
          messageKey: 'students.registration.roleNotFound',
        });
      }

      const emailContact = await transaction.personContact.findFirst({
        where: {
          organizationId: access.organizationId,
          personId: registration.person_id,
          type: 'EMAIL',
          isPrimary: true,
        },
      });
      const email = emailContact ? emailContact.rawValue : '';

      const updateCount = await transaction.$executeRaw`
        UPDATE student_registrations
        SET status = 'APPROVED',
            version = version + 1,
            reviewed_at = NOW(),
            reviewed_by_user_id = ${access.actorUserId}::uuid
        WHERE organization_id = ${access.organizationId}::uuid
          AND id = ${id}::uuid
          AND status = 'PENDING'
          AND version = ${ifMatch}
      `;
      if (updateCount !== 1) {
        throw new ConflictException({
          code: 'VERSION_MISMATCH',
          messageKey: 'common.versionMismatch',
        });
      }

      const user = await transaction.user.update({
        where: { id: registration.user_id, organizationId: access.organizationId },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });

      await transaction.studentProfile.update({
        where: {
          organizationId_personId: {
            organizationId: access.organizationId,
            personId: registration.person_id,
          },
        },
        data: { portalStatus: 'ACTIVE', version: { increment: 1 } },
      });

      await transaction.userLoginIdentifier.updateMany({
        where: {
          organizationId: access.organizationId,
          userId: registration.user_id,
          type: 'EMAIL',
          verifiedAt: null,
        },
        data: { verifiedAt: new Date() },
      });

      await transaction.$executeRaw`
        INSERT INTO user_role_assignments (id, organization_id, user_id, role_id)
        VALUES (gen_random_uuid(), ${access.organizationId}::uuid, ${registration.user_id}::uuid, ${studentRole.id}::uuid)
        ON CONFLICT (organization_id, user_id, role_id) WHERE ends_at IS NULL
        DO NOTHING
      `;

      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.registration.approved',
        entityType: 'StudentRegistration',
        entityId: id,
        correlationId,
        before: { status: 'PENDING', version: registration.version },
        after: { status: 'APPROVED', version: registration.version + 1 },
        metadata: {
          verificationMethod: proof.verificationMethod,
          verificationReference,
        },
      });

      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'StudentRegistration',
        aggregateId: id,
        type: 'student.registration.approved',
        payload: {
          registrationId: id,
          userId: registration.user_id,
          personId: registration.person_id,
          email,
          preferredLocale: user.preferredLocale || null,
        },
      });

      return presentRegistrationDetail(transaction, access.organizationId, id);
    });
  }

  async reject(
    access: AccessContext,
    id: string,
    ifMatch: number,
    reason: string,
    correlationId: string,
  ): Promise<StudentRegistrationDetailDto> {
    return this.prisma.serializable(async (transaction) => {
      const rows = await transaction.$queryRaw<RegistrationRow[]>`
        SELECT id, version, status, person_id, user_id
        FROM student_registrations
        WHERE organization_id = ${access.organizationId}::uuid AND id = ${id}::uuid
        FOR UPDATE
      `;
      const registration = rows[0];
      if (!registration) {
        throw new NotFoundException({
          code: 'REGISTRATION_NOT_FOUND',
          messageKey: 'students.registration.notFound',
        });
      }
      if (registration.version !== ifMatch) {
        throw new ConflictException({
          code: 'VERSION_MISMATCH',
          messageKey: 'common.versionMismatch',
        });
      }
      if (registration.status !== 'PENDING') {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          messageKey: 'students.registration.invalidTransition',
        });
      }

      const emailContact = await transaction.personContact.findFirst({
        where: {
          organizationId: access.organizationId,
          personId: registration.person_id,
          type: 'EMAIL',
          isPrimary: true,
        },
      });
      const email = emailContact ? emailContact.rawValue : '';

      const updateCount = await transaction.$executeRaw`
        UPDATE student_registrations
        SET status = 'REJECTED',
            rejection_reason = ${reason},
            version = version + 1,
            reviewed_at = NOW(),
            reviewed_by_user_id = ${access.actorUserId}::uuid
        WHERE organization_id = ${access.organizationId}::uuid
          AND id = ${id}::uuid
          AND status = 'PENDING'
          AND version = ${ifMatch}
      `;
      if (updateCount !== 1) {
        throw new ConflictException({
          code: 'VERSION_MISMATCH',
          messageKey: 'common.versionMismatch',
        });
      }

      const user = await transaction.user.update({
        where: { id: registration.user_id, organizationId: access.organizationId },
        data: { status: 'REJECTED', version: { increment: 1 } },
      });

      await transaction.studentProfile.update({
        where: {
          organizationId_personId: {
            organizationId: access.organizationId,
            personId: registration.person_id,
          },
        },
        data: { portalStatus: 'REJECTED', version: { increment: 1 } },
      });

      await transaction.userLoginIdentifier.updateMany({
        where: {
          organizationId: access.organizationId,
          userId: registration.user_id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.registration.rejected',
        entityType: 'StudentRegistration',
        entityId: id,
        correlationId,
        before: { status: 'PENDING', version: registration.version },
        after: { status: 'REJECTED', rejectionReason: reason, version: registration.version + 1 },
      });

      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'StudentRegistration',
        aggregateId: id,
        type: 'student.registration.rejected',
        payload: {
          registrationId: id,
          userId: registration.user_id,
          personId: registration.person_id,
          email,
          preferredLocale: user.preferredLocale || null,
          reason,
        },
      });

      return presentRegistrationDetail(transaction, access.organizationId, id);
    });
  }
}
