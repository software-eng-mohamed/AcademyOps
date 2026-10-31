import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { AuditService } from '../platform/audit/audit.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { normalizeEgyptPhone, normalizeEmail } from '../imports/normalization';
import type {
  RegisterStudentDto,
  RegistrationResponseDto,
  ListStudentRegistrationsQueryDto,
  StudentRegistrationDetailDto,
  StudentRegistrationsPageDto,
} from './student-registration.dto';
import { Prisma } from '@prisma/client';
import {
  presentRegistrationDetail,
  presentRegistrationDetails,
} from './student-registration-presenter';
const passwordHashOptions = {
  type: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
@Injectable()
export class StudentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}
  async register(
    input: RegisterStudentDto,
    correlationId: string,
  ): Promise<RegistrationResponseDto> {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedPhone = normalizeEgyptPhone(input.phone);
    if (!normalizedEmail || !normalizedPhone) {
      throw new ConflictException({
        code: 'INVALID_CONTACT_INFO',
        messageKey: 'students.registration.invalidContact',
      });
    }
    const passwordHash = await hash(input.password, passwordHashOptions);
    const organization = await this.prisma.organization.findUnique({
      where: { code: input.organizationCode.trim().toUpperCase() },
    });
    if (!organization) return this.opaqueAccepted();
    try {
      return await this.prisma.serializable(async (transaction) => {
        const existing = await transaction.userLoginIdentifier.findFirst({
          where: {
            organizationId: organization.id,
            type: { in: ['EMAIL', 'PHONE'] },
            normalizedValue: { in: [normalizedEmail, normalizedPhone] },
            revokedAt: null,
          },
        });
        if (existing) return this.opaqueAccepted();
        const publicId = `STU-${randomBytes(6).toString('hex').toUpperCase()}`;
        const person = await transaction.person.create({
          data: {
            organizationId: organization.id,
            publicId,
            name: input.name.trim(),
          },
        });
        await transaction.studentProfile.create({
          data: {
            organizationId: organization.id,
            personId: person.id,
            portalStatus: 'PENDING',
          },
        });
        await transaction.personContact.createMany({
          data: [
            {
              organizationId: organization.id,
              personId: person.id,
              type: 'EMAIL',
              rawValue: input.email,
              normalizedValue: normalizedEmail,
              isPrimary: true,
            },
            {
              organizationId: organization.id,
              personId: person.id,
              type: 'PHONE',
              rawValue: input.phone,
              normalizedValue: normalizedPhone,
              isPrimary: true,
            },
          ],
        });
        const user = await transaction.user.create({
          data: {
            organizationId: organization.id,
            personId: person.id,
            status: 'PENDING',
            passwordHash,
            preferredLocale: input.preferredLocale || 'ar',
            mustChangePassword: false,
          },
        });
        await transaction.userLoginIdentifier.createMany({
          data: [
            {
              organizationId: organization.id,
              userId: user.id,
              type: 'EMAIL',
              normalizedValue: normalizedEmail,
              verifiedAt: null,
            },
            {
              organizationId: organization.id,
              userId: user.id,
              type: 'PHONE',
              normalizedValue: normalizedPhone,
              verifiedAt: null,
            },
          ],
        });
        const registration = await transaction.studentRegistration.create({
          data: {
            organizationId: organization.id,
            personId: person.id,
            userId: user.id,
            status: 'PENDING',
          },
        });
        await this.audit.write(transaction, {
          organizationId: organization.id,
          action: 'student.registration.submitted',
          entityType: 'StudentRegistration',
          entityId: registration.id,
          correlationId,
          after: {
            registrationId: registration.id,
            personId: person.id,
            userId: user.id,
          },
        });
        await this.outbox.add(transaction, {
          organizationId: organization.id,
          aggregateType: 'StudentRegistration',
          aggregateId: registration.id,
          type: 'student.registration.submitted',
          payload: {
            registrationId: registration.id,
            userId: user.id,
            personId: person.id,
          },
        });
        return {
          id: registration.id,
          status: registration.status as 'PENDING' | 'APPROVED' | 'REJECTED',
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.opaqueAccepted();
      }
      throw error;
    }
  }
  private opaqueAccepted(): RegistrationResponseDto {
    return { id: randomUUID(), status: 'PENDING' };
  }
  async list(
    access: AccessContext,
    query: ListStudentRegistrationsQueryDto,
  ): Promise<StudentRegistrationsPageDto> {
    const { status, page, limit } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.StudentRegistrationWhereInput = {
      organizationId: access.organizationId,
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.studentRegistration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.studentRegistration.count({ where }),
    ]);
    const resultItems = await presentRegistrationDetails(this.prisma, access.organizationId, items);
    return {
      items: resultItems,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
  async getOne(access: AccessContext, id: string): Promise<StudentRegistrationDetailDto> {
    return presentRegistrationDetail(this.prisma, access.organizationId, id);
  }
}
