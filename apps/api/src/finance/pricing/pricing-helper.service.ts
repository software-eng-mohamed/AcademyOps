import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PermissionCode } from '@academyops/contracts';
import type { InstallmentDto, PricingAgreementLineDto } from './pricing.dto';

export type PricingResult = {
  id: string;
  status: string;
  version: number;
  lockVersion: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  requiredApprovalTier: 1 | 2;
};

export type ScheduleResult = {
  id: string;
  status: string;
  version: number;
  lockVersion: number;
  totalAmount: string;
};

@Injectable()
export class PricingHelperService {
  readonly tier1MaximumDiscountPercent = new Prisma.Decimal(10);

  prepareLines(lines: PricingAgreementLineDto[], discountInput?: string) {
    const prepared = lines.map((line) => {
      const quantity = new Prisma.Decimal(line.quantity);
      const unitAmount = new Prisma.Decimal(line.unitAmount);
      if (quantity.lte(0) || unitAmount.lt(0)) {
        throw new ConflictException({
          code: 'PRICING_LINE_AMOUNT_INVALID',
          messageKey: 'finance.pricingLineAmountInvalid',
        });
      }
      return {
        type: line.type,
        descriptionAr: (line.descriptionAr ?? line.descriptionEn).trim(),
        descriptionEn: (line.descriptionEn ?? line.descriptionAr ?? '').trim(),
        quantity,
        unitAmount,
        lineAmount: quantity.mul(unitAmount).toDecimalPlaces(2),
      };
    });
    const subtotal = prepared.reduce(
      (sum, line) => sum.add(line.lineAmount),
      new Prisma.Decimal(0),
    );
    const discount = new Prisma.Decimal(discountInput ?? '0');
    if (subtotal.lte(0) || discount.lt(0) || discount.gt(subtotal)) {
      throw new ConflictException({
        code: 'PRICING_TOTAL_INVALID',
        messageKey: 'finance.pricingTotalInvalid',
      });
    }
    return { lines: prepared, subtotal, discount, total: subtotal.sub(discount) };
  }

  prepareInstallments(installments: InstallmentDto[], expectedTotal: Prisma.Decimal) {
    let lastDueDate = '';
    const prepared = installments.map((installment, index) => {
      const amount = new Prisma.Decimal(installment.amount);
      const dueDate = installment.dueDate.slice(0, 10);
      if (amount.lte(0) || (lastDueDate && dueDate < lastDueDate)) {
        throw new ConflictException({
          code: 'INSTALLMENT_SCHEDULE_INVALID',
          messageKey: 'finance.installmentScheduleInvalid',
        });
      }
      lastDueDate = dueDate;
      return { ordinal: index + 1, dueDate: new Date(`${dueDate}T00:00:00.000Z`), amount };
    });
    const total = prepared.reduce(
      (sum, installment) => sum.add(installment.amount),
      new Prisma.Decimal(0),
    );
    if (!total.equals(expectedTotal)) {
      throw new ConflictException({
        code: 'INSTALLMENT_TOTAL_MISMATCH',
        messageKey: 'finance.installmentTotalMismatch',
      });
    }
    return prepared;
  }

  async writeLines(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    pricingAgreementId: string,
    lines: ReturnType<PricingHelperService['prepareLines']>['lines'],
  ) {
    await transaction.pricingAgreementLine.createMany({
      data: lines.map((line) => ({ organizationId, pricingAgreementId, ...line })),
    });
  }

  async writeInstallments(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    scheduleId: string,
    installments: ReturnType<PricingHelperService['prepareInstallments']>,
  ) {
    await transaction.installment.createMany({
      data: installments.map((installment) => ({ organizationId, scheduleId, ...installment })),
    });
  }

  pricingResult(agreement: {
    id: string;
    status: string;
    version: number;
    lockVersion: number;
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  }): PricingResult {
    return {
      id: agreement.id,
      status: agreement.status,
      version: agreement.version,
      lockVersion: agreement.lockVersion,
      subtotal: agreement.subtotal.toFixed(2),
      discountAmount: agreement.discountAmount.toFixed(2),
      totalAmount: agreement.totalAmount.toFixed(2),
      requiredApprovalTier: this.requiredApprovalTier(agreement),
    };
  }

  scheduleResult(
    schedule: { id: string; status: string; version: number; lockVersion: number },
    total: Prisma.Decimal,
  ): ScheduleResult {
    return {
      id: schedule.id,
      status: schedule.status,
      version: schedule.version,
      lockVersion: schedule.lockVersion,
      totalAmount: total.toFixed(2),
    };
  }

  requiredApprovalTier(agreement: {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
  }): 1 | 2 {
    if (agreement.subtotal.lte(0)) return 2;
    const percent = agreement.discountAmount.mul(100).div(agreement.subtotal);
    return percent.gt(this.tier1MaximumDiscountPercent) ? 2 : 1;
  }

  requiredApprovalPermission(agreement: {
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
  }): PermissionCode {
    return this.requiredApprovalTier(agreement) === 2
      ? 'discounts.approve_tier2'
      : 'discounts.approve_tier1';
  }

  assertEnrollmentCanBePriced(state: string) {
    if (state === 'DRAFT' || state === 'PENDING_APPROVAL') return;
    throw new ConflictException({
      code: 'ENROLLMENT_PRICING_LOCKED',
      messageKey: 'finance.enrollmentPricingLocked',
    });
  }

  async findAgreement(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    agreementId: string,
  ) {
    const agreement = await transaction.pricingAgreement.findFirst({
      where: { organizationId, id: agreementId },
    });
    if (!agreement) throw this.notFound();
    return agreement;
  }

  async findSchedule(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    scheduleId: string,
  ) {
    const schedule = await transaction.installmentSchedule.findFirst({
      where: { organizationId, id: scheduleId },
    });
    if (!schedule) {
      throw new NotFoundException({
        code: 'INSTALLMENT_SCHEDULE_NOT_FOUND',
        messageKey: 'finance.installmentScheduleNotFound',
      });
    }
    return schedule;
  }

  async lockAgreement(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    agreementId: string,
  ) {
    // Activation takes the enrollment lock first. Use the same order for all pricing writes.
    await transaction.$queryRaw`SELECT e.id FROM enrollments e JOIN pricing_agreements p ON p.enrollment_id = e.id AND p.organization_id = e.organization_id WHERE p.id = ${agreementId}::uuid AND p.organization_id = ${organizationId}::uuid FOR UPDATE OF e`;
    await transaction.$queryRaw`SELECT id FROM pricing_agreements WHERE id = ${agreementId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  }

  async lockSchedule(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    scheduleId: string,
  ) {
    const schedule = await this.findSchedule(transaction, organizationId, scheduleId);
    await this.lockAgreement(transaction, organizationId, schedule.pricingAgreementId);
    await transaction.$queryRaw`SELECT id FROM installment_schedules WHERE id = ${scheduleId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  }

  pricingConflict() {
    return new ConflictException({
      code: 'PRICING_STATE_OR_VERSION_CONFLICT',
      messageKey: 'finance.pricingStateOrVersionConflict',
    });
  }

  scheduleConflict() {
    return new ConflictException({
      code: 'INSTALLMENT_SCHEDULE_STATE_OR_VERSION_CONFLICT',
      messageKey: 'finance.installmentScheduleStateOrVersionConflict',
    });
  }

  notFound() {
    return new NotFoundException({
      code: 'PRICING_AGREEMENT_NOT_FOUND',
      messageKey: 'finance.pricingAgreementNotFound',
    });
  }
}
