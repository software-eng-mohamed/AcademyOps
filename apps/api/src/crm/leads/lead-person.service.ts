import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeEgyptPhone, normalizeEmail } from '../../imports/normalization';
import { PrismaService } from '../../platform/database/prisma.service';
import type { CreateLeadDto, NewLeadPersonDto, WinLeadDto } from './leads.dto';
import { personNotFound } from './leads.errors';
type Transaction = Prisma.TransactionClient;
@Injectable()
export class LeadPersonService {
  constructor(private readonly prisma: PrismaService) {}
  async resolveLeadPerson(
    transaction: Transaction,
    organizationId: string,
    input: CreateLeadDto,
  ): Promise<string> {
    if (input.personId && input.newPerson)
      throw new ConflictException({
        code: 'LEAD_PERSON_INPUT_CONFLICT',
        messageKey: 'leads.personInputConflict',
      });
    if (input.personId) {
      const person = await transaction.person.findFirst({
        where: { organizationId, id: input.personId },
      });
      if (!person) throw personNotFound();
      return person.id;
    }
    if (!input.newPerson?.name)
      throw new ConflictException({
        code: 'LEAD_PERSON_REQUIRED',
        messageKey: 'leads.personRequired',
      });
    await this.assertDistinctCandidateResolution(transaction, organizationId, input.newPerson);
    const person = await transaction.person.create({
      data: {
        organizationId,
        publicId: `PRS-${randomBytes(6).toString('hex').toUpperCase()}`,
        name: input.newPerson.name ?? null,
      },
    });
    const contacts = this.prepareNewPersonContacts(input.newPerson);
    if (contacts.length) {
      await transaction.personContact.createMany({
        data: contacts.map((contact) => ({ organizationId, personId: person.id, ...contact })),
      });
    }
    return person.id;
  }
  async resolvePersonForWin(
    transaction: Transaction,
    organizationId: string,
    leadPersonId: string | null,
    input: WinLeadDto,
  ): Promise<string> {
    if (leadPersonId && input.personId && leadPersonId !== input.personId)
      throw new ConflictException({
        code: 'LEAD_PERSON_MISMATCH',
        messageKey: 'leads.personMismatch',
      });
    const selectedId = leadPersonId ?? input.personId;
    if (selectedId) {
      const person = await transaction.person.findFirst({
        where: { id: selectedId, organizationId },
      });
      if (!person) throw personNotFound();
      return person.id;
    }
    if (!input.newPerson?.name)
      throw new ConflictException({
        code: 'PERSON_RESOLUTION_REQUIRED',
        messageKey: 'leads.personResolutionRequired',
      });
    await this.assertDistinctCandidateResolution(transaction, organizationId, input.newPerson);
    const person = await transaction.person.create({
      data: {
        organizationId,
        publicId: `STU-${randomBytes(6).toString('hex').toUpperCase()}`,
        name: input.newPerson.name ?? null,
      },
    });
    const contacts = this.prepareNewPersonContacts(input.newPerson);
    if (contacts.length)
      await transaction.personContact.createMany({
        data: contacts.map((contact) => ({ organizationId, personId: person.id, ...contact })),
      });
    return person.id;
  }
  async assertDistinctCandidateResolution(
    transaction: Transaction,
    organizationId: string,
    input: NewLeadPersonDto,
  ) {
    const contacts = this.prepareNewPersonContacts(input);
    if (!contacts.length) return;
    const candidates = await transaction.personContact.findMany({
      where: {
        organizationId,
        OR: contacts.map(({ type, normalizedValue }) => ({ type, normalizedValue })),
      },
      select: { personId: true },
    });
    const confirmed = new Set(input.confirmDistinctFromPersonIds ?? []);
    const unresolved = [...new Set(candidates.map(({ personId }) => personId))].filter(
      (personId) => !confirmed.has(personId),
    );
    if (unresolved.length)
      throw new ConflictException({
        code: 'PERSON_MATCH_REVIEW_REQUIRED',
        messageKey: 'students.matchReviewRequired',
        fieldErrors: unresolved.map((personId) => ({
          field: `candidate.${personId}`,
          messageKey: 'EXACT_CONTACT',
        })),
      });
  }
  prepareNewPersonContacts(input: NewLeadPersonDto) {
    const phone = input.phone ? normalizeEgyptPhone(input.phone) : undefined;
    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (input.phone && !phone)
      throw new ConflictException({ code: 'PHONE_INVALID', messageKey: 'students.phoneInvalid' });
    if (input.email && !email)
      throw new ConflictException({ code: 'EMAIL_INVALID', messageKey: 'students.emailInvalid' });
    return [
      ...(input.phone
        ? [
            {
              type: 'PHONE',
              rawValue: input.phone.trim(),
              normalizedValue: phone!,
              isPrimary: true,
            },
          ]
        : []),
      ...(input.email
        ? [
            {
              type: 'EMAIL',
              rawValue: input.email.trim(),
              normalizedValue: email!,
              isPrimary: true,
            },
          ]
        : []),
    ];
  }
}
