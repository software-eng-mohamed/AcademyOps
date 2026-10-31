import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { FinancialReasonDto } from './finance.dto';
import { FinanceRequestDecisionService } from './finance-request-decision.service';

@ApiTags('finance')
@Controller({ path: '', version: '1' })
export class FinanceRequestDecisionController {
  constructor(private readonly decisions: FinanceRequestDecisionService) {}

  @RequirePermission('refunds.approve')
  @Post('refund-requests/:id/reject')
  @HttpCode(200)
  rejectRefund(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.decisions.decide(access, 'REFUND', id, 'REJECTED', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('refunds.request')
  @Post('refund-requests/:id/withdraw')
  @HttpCode(200)
  withdrawRefund(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.decisions.decide(access, 'REFUND', id, 'WITHDRAWN', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.reverse.approve')
  @Post('payment-reversal-requests/:id/reject')
  @HttpCode(200)
  rejectReversal(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.decisions.decide(access, 'REVERSAL', id, 'REJECTED', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('payments.reverse.request')
  @Post('payment-reversal-requests/:id/withdraw')
  @HttpCode(200)
  withdrawReversal(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: FinancialReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.decisions.decide(access, 'REVERSAL', id, 'WITHDRAWN', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }
}
