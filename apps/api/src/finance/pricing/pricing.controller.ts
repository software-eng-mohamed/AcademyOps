import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../../common/http/headers';
import { CurrentAccess, RequirePermission } from '../../iam/authorization/decorators';
import {
  CreateInstallmentScheduleDto,
  CreatePricingAgreementDto,
  ListPricingAgreementsDto,
  PricingDecisionDto,
  UpdateInstallmentScheduleDto,
  UpdatePricingAgreementDto,
} from './pricing.dto';
import { PricingService } from './pricing.service';

@ApiTags('pricing')
@Controller({ path: '', version: '1' })
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @RequirePermission('pricing.read')
  @Get('pricing-agreements')
  list(@CurrentAccess() access: AccessContext, @Query() query: ListPricingAgreementsDto) {
    return this.pricing.list(access, query);
  }

  @RequirePermission('pricing.read')
  @Get('pricing-agreements/:id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.pricing.read(access, id);
  }

  @RequirePermission('pricing.propose')
  @Post('pricing-agreements')
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreatePricingAgreementDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.create(access, input, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('pricing.propose')
  @Put('pricing-agreements/:id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdatePricingAgreementDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.update(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('pricing.propose')
  @Post('pricing-agreements/:id/submit')
  submit(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.submit(
      access,
      id,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('discounts.approve_tier1')
  @Post('pricing-agreements/:id/approve')
  approve(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: PricingDecisionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.approve(
      access,
      id,
      input.reason,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('discounts.approve_tier1')
  @Post('pricing-agreements/:id/reject')
  reject(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: PricingDecisionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.reject(
      access,
      id,
      input.reason,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('pricing.propose')
  @Post('pricing-agreements/:id/installment-schedules')
  createSchedule(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateInstallmentScheduleDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.createSchedule(
      access,
      id,
      input,
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('pricing.propose')
  @Put('installment-schedules/:id')
  updateSchedule(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateInstallmentScheduleDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.updateSchedule(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('discounts.approve_tier1')
  @Post('installment-schedules/:id/approve')
  approveSchedule(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.pricing.approveSchedule(
      access,
      id,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }
}
