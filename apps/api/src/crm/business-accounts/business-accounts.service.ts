import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../../platform/audit/audit.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import {
  assertBusinessAccountTransition,
  rethrowBusinessAccountArchiveConflict,
} from './business-account-transitions';
import type {
  BusinessAccountContactDto,
  CreateBusinessAccountDto,
  ListBusinessAccountsDto,
  ListBusinessContactCandidatesDto,
  ReplaceBusinessAccountContactsDto,
  UpdateBusinessAccountDto,
} from './business-accounts.dto';
type Transaction = Prisma.TransactionClient;
@Injectable()
export class BusinessAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}
  async list(access: AccessContext, input: ListBusinessAccountsDto) {
    const scopes = access.grants.get('business_accounts.read');
    const branchIds = scopes?.has('O') ? undefined : [...access.branchIds];
    const accounts = await this.prisma.businessAccount.findMany({
      where: {
        organizationId: access.organizationId,
        ...(branchIds ? { owningBranchId: { in: branchIds } } : {}),
        ...(input.branchId ? { owningBranchId: input.branchId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search
          ? {
              OR: [
                { legalName: { contains: input.search, mode: 'insensitive' as const } },
                { displayName: { contains: input.search, mode: 'insensitive' as const } },
                { registrationNo: { contains: input.search, mode: 'insensitive' as const } },
                { taxId: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const items = accounts.slice(0, input.limit);
    return {
      items,
      nextCursor: accounts.length > input.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async listContactCandidates(access: AccessContext, input: ListBusinessContactCandidatesDto) {
    this.assertBranchScope(access, input.branchId, 'business_accounts.manage');
    const candidatePersonIds = await this.contactCandidatePersonIds(
      access.organizationId,
      input.branchId,
    );
    const contacts = await this.prisma.personContact.findMany({
      where: {
        organizationId: access.organizationId,
        personId: { in: candidatePersonIds },
        OR: [
          { rawValue: { contains: input.search, mode: 'insensitive' } },
          { normalizedValue: { contains: input.search, mode: 'insensitive' } },
        ],
      },
      select: { personId: true },
      take: input.limit * 2,
    });
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: candidatePersonIds },
        OR: [
          { id: { in: contacts.map(({ personId }) => personId) } },
          { publicId: { contains: input.search, mode: 'insensitive' } },
          { name: { contains: input.search, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: { id: true, publicId: true, name: true },
    });
    const personContacts = await this.prisma.personContact.findMany({
      where: {
        organizationId: access.organizationId,
        personId: { in: people.map(({ id }) => id) },
        type: { in: ['PHONE', 'EMAIL'] },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { personId: true, type: true, rawValue: true, isPrimary: true },
    });
    return {
      items: people.map((person) => ({
        personId: person.id,
        publicId: person.publicId,
        name: person.name,
        contacts: personContacts.filter(({ personId }) => personId === person.id),
      })),
    };
  }
  private async contactCandidatePersonIds(organizationId: string, branchId: string) {
    const now = new Date();
    const [enrollments, leads, staffAssignments, accounts] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { organizationId, homeBranchId: branchId },
        select: { studentPersonId: true },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, branchId, personId: { not: null } },
        select: { personId: true },
      }),
      this.prisma.staffBranchAssignment.findMany({
        where: {
          organizationId,
          branchId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { staffProfileId: true },
      }),
      this.prisma.businessAccount.findMany({
        where: { organizationId, owningBranchId: branchId },
        select: { id: true },
      }),
    ]);
    const [staff, businessContacts] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where: {
          organizationId,
          id: { in: staffAssignments.map(({ staffProfileId }) => staffProfileId) },
          isActive: true,
        },
        select: { personId: true },
      }),
      this.prisma.businessAccountContact.findMany({
        where: {
          organizationId,
          businessAccountId: { in: accounts.map(({ id }) => id) },
        },
        select: { personId: true },
      }),
    ]);
    return [
      ...new Set([
        ...enrollments.map(({ studentPersonId }) => studentPersonId),
        ...leads.flatMap(({ personId }) => (personId ? [personId] : [])),
        ...staff.map(({ personId }) => personId),
        ...businessContacts.map(({ personId }) => personId),
      ]),
    ];
  }
  async read(access: AccessContext, id: string) {
    const account = await this.findScoped(access, id, 'business_accounts.read');
    const [contactLinks, billingAccount] = await Promise.all([
      this.prisma.businessAccountContact.findMany({
        where: { organizationId: access.organizationId, businessAccountId: account.id },
        orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.billingAccount.findFirst({
        where: {
          organizationId: access.organizationId,
          businessAccountId: account.id,
          kind: 'CORPORATE',
        },
      }),
    ]);
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: contactLinks.map(({ personId }) => personId) },
      },
      select: { id: true, publicId: true, name: true },
    });
    return {
      ...account,
      billingAccount,
      contacts: contactLinks.map((contact) => ({
        ...contact,
        person: people.find(({ id: personId }) => personId === contact.personId) ?? null,
      })),
    };
  }
  async create(access: AccessContext, input: CreateBusinessAccountDto, correlationId: string) {
    this.assertBranchScope(access, input.owningBranchId, 'business_accounts.manage');
    const contacts = this.prepareContacts(input.contacts ?? []);
    const allowedContactPersonIds = new Set(
      await this.contactCandidatePersonIds(access.organizationId, input.owningBranchId),
    );
    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({
        where: {
          organizationId: access.organizationId,
          id: input.owningBranchId,
          isActive: true,
        },
      });
      if (!branch) throw this.notFound();
      await this.validateContactPeople(
        transaction,
        access.organizationId,
        contacts,
        allowedContactPersonIds,
      );
      const account = await transaction.businessAccount.create({
        data: {
          organizationId: access.organizationId,
          owningBranchId: branch.id,
          legalName: input.legalName.trim(),
          displayName: input.displayName.trim(),
          registrationNo: input.registrationNo?.trim() ?? null,
          taxId: input.taxId?.trim() ?? null,
        },
      });
      await this.writeContacts(transaction, access.organizationId, account.id, contacts);
      const billingAccount = await transaction.billingAccount.create({
        data: {
          organizationId: access.organizationId,
          kind: 'CORPORATE',
          businessAccountId: account.id,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'business_account.create',
        entityType: 'BusinessAccount',
        entityId: account.id,
        correlationId,
        after: {
          owningBranchId: account.owningBranchId,
          displayName: account.displayName,
          billingAccountId: billingAccount.id,
        },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'BusinessAccount',
        aggregateId: account.id,
        type: 'business_account.created',
        payload: { businessAccountId: account.id, billingAccountId: billingAccount.id },
      });
      return { ...account, billingAccountId: billingAccount.id };
    });
  }
  async update(
    access: AccessContext,
    id: string,
    input: UpdateBusinessAccountDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    const scoped = await this.findScoped(access, id, 'business_accounts.manage');
    if (scoped.version !== expectedVersion) throw this.versionConflict();
    assertBusinessAccountTransition(scoped.status, input.status);
    const change = this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.businessAccount.updateMany({
        where: { id, organizationId: access.organizationId, version: expectedVersion },
        data: {
          ...(input.legalName === undefined ? {} : { legalName: input.legalName.trim() }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
          ...(input.registrationNo === undefined
            ? {}
            : { registrationNo: input.registrationNo.trim() }),
          ...(input.taxId === undefined ? {} : { taxId: input.taxId.trim() }),
          ...(input.status === undefined ? {} : { status: input.status }),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw this.versionConflict();
      const result = await transaction.businessAccount.findUniqueOrThrow({ where: { id } });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'business_account.update',
        entityType: 'BusinessAccount',
        entityId: id,
        correlationId,
        before: { status: scoped.status, displayName: scoped.displayName, version: scoped.version },
        after: { status: result.status, displayName: result.displayName, version: result.version },
      });
      return result;
    });
    return change.catch(rethrowBusinessAccountArchiveConflict);
  }
  async replaceContacts(
    access: AccessContext,
    id: string,
    input: ReplaceBusinessAccountContactsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    const scoped = await this.findScoped(access, id, 'business_accounts.manage');
    if (scoped.version !== expectedVersion) throw this.versionConflict();
    const contacts = this.prepareContacts(input.contacts);
    const allowedContactPersonIds = new Set(
      await this.contactCandidatePersonIds(access.organizationId, scoped.owningBranchId),
    );
    return this.prisma.$transaction(async (transaction) => {
      await this.validateContactPeople(
        transaction,
        access.organizationId,
        contacts,
        allowedContactPersonIds,
      );
      const updated = await transaction.businessAccount.updateMany({
        where: { id, organizationId: access.organizationId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw this.versionConflict();
      await transaction.businessAccountContact.deleteMany({
        where: { organizationId: access.organizationId, businessAccountId: id },
      });
      await this.writeContacts(transaction, access.organizationId, id, contacts);
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'business_account.contacts.replace',
        entityType: 'BusinessAccount',
        entityId: id,
        correlationId,
        after: contacts,
      });
      return { id, version: expectedVersion + 1, contacts };
    });
  }
  private async findScoped(
    access: AccessContext,
    id: string,
    permission: 'business_accounts.read' | 'business_accounts.manage',
  ) {
    const account = await this.prisma.businessAccount.findFirst({
      where: { organizationId: access.organizationId, id },
    });
    if (!account) throw this.notFound();
    this.assertBranchScope(access, account.owningBranchId, permission);
    return account;
  }
  private assertBranchScope(
    access: AccessContext,
    branchId: string,
    permission: 'business_accounts.read' | 'business_accounts.manage',
  ) {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O') || (scopes?.has('B') && access.branchIds.has(branchId))) return;
    throw this.notFound();
  }
  private prepareContacts(contacts: BusinessAccountContactDto[]) {
    const personIds = contacts.map(({ personId }) => personId);
    if (new Set(personIds).size !== personIds.length)
      throw new ConflictException({
        code: 'BUSINESS_CONTACT_DUPLICATE',
        messageKey: 'businessAccounts.contactDuplicate',
      });
    const primaryCount = contacts.filter(({ isPrimary }) => isPrimary).length;
    if (primaryCount > 1)
      throw new ConflictException({
        code: 'BUSINESS_PRIMARY_CONTACT_DUPLICATE',
        messageKey: 'businessAccounts.primaryContactDuplicate',
      });
    return contacts.map((contact, index) => ({
      personId: contact.personId,
      role: contact.role?.trim() ?? null,
      isPrimary: primaryCount === 0 ? index === 0 : (contact.isPrimary ?? false),
    }));
  }
  private async validateContactPeople(
    transaction: Transaction,
    organizationId: string,
    contacts: Array<{
      personId: string;
    }>,
    allowedPersonIds: Set<string>,
  ) {
    if (contacts.some(({ personId }) => !allowedPersonIds.has(personId))) {
      throw new ConflictException({
        code: 'BUSINESS_CONTACT_INVALID',
        messageKey: 'businessAccounts.contactInvalid',
      });
    }
    const count = await transaction.person.count({
      where: { organizationId, id: { in: contacts.map(({ personId }) => personId) } },
    });
    if (count !== contacts.length)
      throw new ConflictException({
        code: 'BUSINESS_CONTACT_INVALID',
        messageKey: 'businessAccounts.contactInvalid',
      });
  }
  private async writeContacts(
    transaction: Transaction,
    organizationId: string,
    businessAccountId: string,
    contacts: Array<{
      personId: string;
      role: string | null;
      isPrimary: boolean;
    }>,
  ) {
    if (!contacts.length) return;
    await transaction.businessAccountContact.createMany({
      data: contacts.map((contact) => ({ organizationId, businessAccountId, ...contact })),
    });
  }
  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'BUSINESS_ACCOUNT_NOT_FOUND',
      messageKey: 'businessAccounts.notFound',
    });
  }
  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      messageKey: 'errors.versionConflict',
    });
  }
}
