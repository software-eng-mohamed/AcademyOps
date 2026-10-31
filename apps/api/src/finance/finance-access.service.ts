import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext, PermissionCode } from '@academyops/contracts';

@Injectable()
export class FinanceAccessService {
  async assertEnrollment(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    enrollmentId: string,
  ) {
    const visibleIds = await this.visibleEnrollmentIds(transaction, access, permission);
    const enrollment = await transaction.enrollment.findFirst({
      where: {
        organizationId: access.organizationId,
        AND: [
          { id: enrollmentId },
          ...(visibleIds === undefined ? [] : [{ id: { in: visibleIds } }]),
        ],
      },
    });
    if (!enrollment) throw this.notFound();
    return enrollment;
  }

  async assertBillingAccount(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
    billingAccountId: string,
    enrollmentId?: string | null,
  ) {
    const billing = await transaction.billingAccount.findFirst({
      where: { organizationId: access.organizationId, id: billingAccountId },
    });
    if (!billing) throw this.notFound();

    if (enrollmentId) {
      const enrollment = await this.assertEnrollment(transaction, access, permission, enrollmentId);
      if (enrollment.billingAccountId !== billing.id) throw this.notFound();
      return billing;
    }

    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return billing;
    if (scopes?.has('S') && billing.personId === access.studentPersonId) return billing;
    if (scopes?.has('B') && billing.businessAccountId) {
      const business = await transaction.businessAccount.findFirst({
        where: {
          organizationId: access.organizationId,
          id: billing.businessAccountId,
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      if (business) return billing;
    }

    const visibleEnrollmentIds = await this.visibleEnrollmentIds(transaction, access, permission);
    if (visibleEnrollmentIds?.length) {
      const linked = await transaction.enrollment.findFirst({
        where: {
          organizationId: access.organizationId,
          billingAccountId: billing.id,
          id: { in: visibleEnrollmentIds },
        },
        select: { id: true },
      });
      if (linked) return billing;
    }
    throw this.notFound();
  }

  async visibleEnrollmentIds(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
  ): Promise<string[] | undefined> {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return undefined;
    const ids = new Set<string>();

    if (scopes?.has('S') && access.studentPersonId) {
      const self = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          studentPersonId: access.studentPersonId,
        },
        select: { id: true },
      });
      for (const { id } of self) ids.add(id);
    }

    if (scopes?.has('B') && access.branchIds.size) {
      const branchEnrollments = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          homeBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      for (const { id } of branchEnrollments) ids.add(id);
    }

    if (scopes?.has('A')) {
      const [created, assignedLeads] = await Promise.all([
        transaction.enrollmentEvent.findMany({
          where: {
            organizationId: access.organizationId,
            actorUserId: access.actorUserId,
            type: 'CREATE',
          },
          select: { enrollmentId: true },
        }),
        transaction.lead.findMany({
          where: {
            organizationId: access.organizationId,
            assignedUserId: access.actorUserId,
          },
          select: { id: true },
        }),
      ]);
      for (const { enrollmentId } of created) ids.add(enrollmentId);
      const conversions = await transaction.leadConversion.findMany({
        where: {
          organizationId: access.organizationId,
          leadId: { in: assignedLeads.map(({ id }) => id) },
        },
        select: { enrollmentId: true },
      });
      for (const { enrollmentId } of conversions) ids.add(enrollmentId);
    }

    return [...ids];
  }

  async visibleBillingAccountIds(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    permission: PermissionCode,
  ): Promise<string[] | undefined> {
    const scopes = access.grants.get(permission);
    if (scopes?.has('O')) return undefined;
    const ids = new Set<string>();
    const visibleEnrollments = await this.visibleEnrollmentIds(transaction, access, permission);
    if (visibleEnrollments?.length) {
      const enrollments = await transaction.enrollment.findMany({
        where: {
          organizationId: access.organizationId,
          id: { in: visibleEnrollments },
        },
        select: { billingAccountId: true },
      });
      for (const { billingAccountId } of enrollments) ids.add(billingAccountId);
    }
    if (scopes?.has('S') && access.studentPersonId) {
      const self = await transaction.billingAccount.findMany({
        where: {
          organizationId: access.organizationId,
          kind: 'INDIVIDUAL',
          personId: access.studentPersonId,
        },
        select: { id: true },
      });
      for (const { id } of self) ids.add(id);
    }
    if (scopes?.has('B') && access.branchIds.size) {
      const businesses = await transaction.businessAccount.findMany({
        where: {
          organizationId: access.organizationId,
          owningBranchId: { in: [...access.branchIds] },
        },
        select: { id: true },
      });
      const corporate = await transaction.billingAccount.findMany({
        where: {
          organizationId: access.organizationId,
          businessAccountId: { in: businesses.map(({ id }) => id) },
        },
        select: { id: true },
      });
      for (const { id } of corporate) ids.add(id);
    }
    return [...ids];
  }

  private notFound() {
    return new NotFoundException({
      code: 'FINANCE_RESOURCE_NOT_FOUND',
      messageKey: 'finance.resourceNotFound',
    });
  }
}
