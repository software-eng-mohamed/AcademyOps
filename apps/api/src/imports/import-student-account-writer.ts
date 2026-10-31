import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { codeFrom } from './import-values';
@Injectable()
export class ImportStudentAccountWriter {
  async contact(
    db: Prisma.TransactionClient,
    organizationId: string,
    personId: string,
    type: string,
    value: string | null,
  ): Promise<void> {
    if (
      !value ||
      (await db.personContact.findFirst({
        where: { organizationId, personId, type, normalizedValue: value },
      }))
    )
      return;
    await db.personContact.create({
      data: {
        organizationId,
        personId,
        type,
        rawValue: value,
        normalizedValue: value,
        isPrimary: true,
      },
    });
  }
  async resolveBranch(
    db: Prisma.TransactionClient,
    organizationId: string,
    rawBranch: string,
    defaultBranch: {
      id: string;
      code: string;
      name: string;
    },
  ) {
    const name = rawBranch.trim();
    if (!name) return defaultBranch;
    const code = codeFrom(name, 'BRANCH');
    const existing = await db.branch.findFirst({
      where: {
        organizationId,
        OR: [
          { code: { equals: code, mode: 'insensitive' } },
          { name: { equals: name, mode: 'insensitive' } },
        ],
      },
    });
    return existing ?? db.branch.create({ data: { organizationId, code, name } });
  }
  async billingAccount(
    db: Prisma.TransactionClient,
    organizationId: string,
    personId: string,
    branchId: string,
    kind: 'INDIVIDUAL' | 'CORPORATE',
  ) {
    if (kind === 'INDIVIDUAL') {
      const existing = await db.billingAccount.findFirst({
        where: { organizationId, personId, kind },
      });
      return existing ?? db.billingAccount.create({ data: { organizationId, kind, personId } });
    }
    let business = await db.businessAccount.findFirst({
      where: { organizationId, registrationNo: 'LEGACY-UNSPECIFIED' },
    });
    business ??= await db.businessAccount.create({
      data: {
        organizationId,
        owningBranchId: branchId,
        legalName: 'Legacy corporate clients (unspecified)',
        displayName: 'Legacy corporate clients',
        registrationNo: 'LEGACY-UNSPECIFIED',
      },
    });
    const existing = await db.billingAccount.findFirst({
      where: { organizationId, businessAccountId: business.id, kind },
    });
    return (
      existing ??
      db.billingAccount.create({
        data: { organizationId, kind, businessAccountId: business.id },
      })
    );
  }
}
