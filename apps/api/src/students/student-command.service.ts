import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StudentContactsService } from './student-contacts.service';
import { StudentQueryService } from './student-query.service';
import { StudentScopePolicyService } from './student-scope-policy.service';
import type { CreateStudentDto, ReplaceStudentContactsDto, UpdateStudentDto } from './students.dto';
@Injectable()
export class StudentCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly scopePolicy: StudentScopePolicyService,
    private readonly queryService: StudentQueryService,
    private readonly contactsService: StudentContactsService,
  ) {}
  async create(access: AccessContext, input: CreateStudentDto, correlationId: string) {
    this.scopePolicy.assertCreationScope(access, input.branchId);
    const name = input.name?.trim();
    if (!name) {
      throw new ConflictException({
        code: 'STUDENT_NAME_REQUIRED',
        messageKey: 'students.nameRequired',
      });
    }
    const candidates = await this.queryService.findCandidates(access, {
      ...input,
      name,
    });
    const confirmed = new Set(input.confirmDistinctFromPersonIds ?? []);
    const unconfirmed = candidates.filter((candidate) => !confirmed.has(candidate.personId));
    if (unconfirmed.length) {
      throw new ConflictException({
        code: 'PERSON_MATCH_REVIEW_REQUIRED',
        messageKey: 'students.matchReviewRequired',
        fieldErrors: unconfirmed.map((candidate) => ({
          field: `candidate.${candidate.personId}`,
          messageKey: candidate.reasons.join(','),
        })),
      });
    }
    const normalizedPhone = this.contactsService.normalizeContact('PHONE', input.phone);
    const normalizedEmail = this.contactsService.normalizeContact('EMAIL', input.email);
    return this.prisma.$transaction(async (transaction) => {
      const person = await transaction.person.create({
        data: {
          organizationId: access.organizationId,
          publicId: `STU-${randomBytes(6).toString('hex').toUpperCase()}`,
          name,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          gender: input.gender ?? null,
        },
      });
      const profile = await transaction.studentProfile.create({
        data: { organizationId: access.organizationId, personId: person.id },
      });
      const contacts = [
        ...(input.phone
          ? [{ type: 'PHONE', rawValue: input.phone, normalizedValue: normalizedPhone }]
          : []),
        ...(input.email
          ? [{ type: 'EMAIL', rawValue: input.email, normalizedValue: normalizedEmail }]
          : []),
      ];
      if (contacts.length) {
        await transaction.personContact.createMany({
          data: contacts.map((contact) => ({
            organizationId: access.organizationId,
            personId: person.id,
            ...contact,
            isPrimary: true,
          })),
        });
      }
      const billingAccount = await transaction.billingAccount.create({
        data: {
          organizationId: access.organizationId,
          kind: 'INDIVIDUAL',
          personId: person.id,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.create',
        entityType: 'Person',
        entityId: person.id,
        correlationId,
        after: {
          publicId: person.publicId,
          profileId: profile.id,
          billingAccountId: billingAccount.id,
          branchId: input.branchId ?? null,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Student',
        aggregateId: person.id,
        type: 'student.created',
        payload: { personId: person.id, publicId: person.publicId },
      });
      return {
        id: person.id,
        publicId: person.publicId,
        version: person.version,
        billingAccountId: billingAccount.id,
      };
    });
  }
  async update(
    access: AccessContext,
    personId: string,
    input: UpdateStudentDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.scopePolicy.assertVisible(access, personId, 'students.update');
    if (
      (input.birthDate !== undefined || input.gender !== undefined) &&
      !(await this.scopePolicy.canSee(access, personId, 'students.update_sensitive'))
    ) {
      throw new ForbiddenException({
        code: 'STUDENT_SENSITIVE_UPDATE_FORBIDDEN',
        messageKey: 'students.sensitiveUpdateForbidden',
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const person = await transaction.person.findFirst({
        where: { id: personId, organizationId: access.organizationId },
      });
      if (!person) throw this.notFound();
      if (person.version !== expectedVersion) throw this.versionConflict();
      const updated = await transaction.person.update({
        where: { id: person.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.birthDate === undefined ? {} : { birthDate: new Date(input.birthDate) }),
          ...(input.gender === undefined ? {} : { gender: input.gender }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.update',
        entityType: 'Person',
        entityId: person.id,
        correlationId,
        before: { name: person.name, version: person.version },
        after: { name: updated.name, version: updated.version },
      });
      return updated;
    });
  }
  async replaceContacts(
    access: AccessContext,
    personId: string,
    input: ReplaceStudentContactsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    await this.scopePolicy.assertVisible(access, personId, 'students.update');
    const contacts = this.contactsService.prepareContacts(input);
    return this.prisma.$transaction(async (transaction) => {
      const person = await transaction.person.findFirst({
        where: { id: personId, organizationId: access.organizationId },
      });
      if (!person) throw this.notFound();
      if (person.version !== expectedVersion) throw this.versionConflict();
      const before = await transaction.personContact.findMany({
        where: { organizationId: access.organizationId, personId },
        select: { type: true, normalizedValue: true, isPrimary: true },
      });
      await transaction.personContact.deleteMany({
        where: { organizationId: access.organizationId, personId },
      });
      if (contacts.length) {
        await transaction.personContact.createMany({
          data: contacts.map((contact) => ({
            organizationId: access.organizationId,
            personId,
            ...contact,
          })),
        });
      }
      const updated = await transaction.person.update({
        where: { id: person.id },
        data: { version: { increment: 1 } },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'student.contacts.replace',
        entityType: 'Person',
        entityId: person.id,
        correlationId,
        before,
        after: contacts,
      });
      return { id: person.id, version: updated.version, contacts };
    });
  }
  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'STUDENT_NOT_FOUND', messageKey: 'students.notFound' });
  }
  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
  }
}
