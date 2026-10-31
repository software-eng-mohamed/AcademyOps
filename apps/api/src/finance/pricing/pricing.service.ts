import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PricingReadService } from './pricing-read.service';
import { PricingAgreementService } from './pricing-agreement.service';
import { PricingApprovalService } from './pricing-approval.service';
import { PricingScheduleService } from './pricing-schedule.service';
import type {
  CreateInstallmentScheduleDto,
  CreatePricingAgreementDto,
  ListPricingAgreementsDto,
  UpdateInstallmentScheduleDto,
  UpdatePricingAgreementDto,
} from './pricing.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly readService: PricingReadService,
    private readonly agreementService: PricingAgreementService,
    private readonly approvalService: PricingApprovalService,
    private readonly scheduleService: PricingScheduleService,
  ) {}

  async list(access: AccessContext, input: ListPricingAgreementsDto) {
    return this.readService.list(access, input);
  }

  async read(access: AccessContext, agreementId: string) {
    return this.readService.read(access, agreementId);
  }

  async create(
    access: AccessContext,
    input: CreatePricingAgreementDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.agreementService.create(access, input, idempotencyKey, correlationId);
  }

  async update(
    access: AccessContext,
    agreementId: string,
    input: UpdatePricingAgreementDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.agreementService.update(
      access,
      agreementId,
      input,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  async submit(
    access: AccessContext,
    agreementId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.agreementService.submit(
      access,
      agreementId,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  async approve(
    access: AccessContext,
    agreementId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.approvalService.approve(
      access,
      agreementId,
      reason,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  async reject(
    access: AccessContext,
    agreementId: string,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.agreementService.reject(
      access,
      agreementId,
      reason,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  async createSchedule(
    access: AccessContext,
    agreementId: string,
    input: CreateInstallmentScheduleDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.scheduleService.createSchedule(
      access,
      agreementId,
      input,
      idempotencyKey,
      correlationId,
    );
  }

  async updateSchedule(
    access: AccessContext,
    scheduleId: string,
    input: UpdateInstallmentScheduleDto,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.scheduleService.updateSchedule(
      access,
      scheduleId,
      input,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }

  async approveSchedule(
    access: AccessContext,
    scheduleId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.scheduleService.approveSchedule(
      access,
      scheduleId,
      expectedVersion,
      idempotencyKey,
      correlationId,
    );
  }
}
