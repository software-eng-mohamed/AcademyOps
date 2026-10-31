import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext, EnrollmentState } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import {
  ActivateEnrollmentDto,
  CreateEnrollmentDto,
  CreateModuleRetakeDto,
  EnrollmentReasonDto,
  ListEnrollmentsDto,
  TransferEnrollmentDto,
} from './enrollment.dto';
import { EnrollmentService } from './enrollment.service';

@ApiTags('enrollment')
@Controller({ path: 'enrollments', version: '1' })
export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @RequirePermission('enrollments.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListEnrollmentsDto) {
    return this.enrollments.list(access, query);
  }

  @RequirePermission('enrollments.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.enrollments.read(access, id);
  }

  @RequirePermission('enrollments.create')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateEnrollmentDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.create(access, input, correlationId);
  }

  @RequirePermission('enrollments.submit')
  @Post(':id/submit')
  submit(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.transition(access, id, 'submit', {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
    });
  }

  @RequirePermission('enrollments.activate')
  @Post(':id/activate')
  activate(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ActivateEnrollmentDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.activate(access, id, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      ...(input.note ? { reason: input.note } : {}),
    });
  }

  @RequirePermission('enrollments.activate')
  @Post(':id/reject')
  reject(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.transition(access, id, 'reject', {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.transfer')
  @Post(':id/transfer')
  transfer(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: TransferEnrollmentDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.transfer(access, id, input.targetCohortId, {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.postpone')
  @Post(':id/postpone')
  postpone(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ id: string; state: EnrollmentState; version: number }> {
    return this.enrollments.transition(access, id, 'postpone', {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.resume')
  @Post(':id/resume')
  resume(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.transition(access, id, 'resume', {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.complete')
  @Post(':id/complete')
  complete(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.transition(access, id, 'complete', {
      expectedVersion: requireVersion(ifMatch),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.cancel.request')
  @Post(':id/cancellation-requests')
  requestCancellation(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.requestCancellation(access, id, {
      expectedVersion: requireVersion(ifMatch),
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
      reason: input.reason,
    });
  }

  @RequirePermission('enrollments.retake')
  @Post(':id/retakes')
  requestRetake(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateModuleRetakeDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.requestRetake(access, id, input, correlationId);
  }
}

@ApiTags('enrollment')
@Controller({ path: 'enrollment-cancellation-requests', version: '1' })
export class EnrollmentCancellationController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @RequirePermission('enrollments.cancel.approve')
  @Post(':id/approve')
  approve(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.decideCancellation(access, id, 'APPROVED', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }

  @RequirePermission('enrollments.cancel.approve')
  @Post(':id/reject')
  reject(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.decideCancellation(access, id, 'REJECTED', input.reason, {
      idempotencyKey: requireIdempotencyKey(key),
      correlationId,
    });
  }
}

@ApiTags('enrollment')
@Controller({ path: 'module-retakes', version: '1' })
export class ModuleRetakesController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @RequirePermission('enrollments.retake')
  @Post(':id/approve')
  approve(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.decideRetake(
      access,
      id,
      'APPROVED',
      input.reason,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('enrollments.retake')
  @Post(':id/reject')
  reject(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: EnrollmentReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.enrollments.decideRetake(
      access,
      id,
      'REJECTED',
      input.reason,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}
