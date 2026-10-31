import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { AcademicSessionLifecycleService } from './academic-session-lifecycle.service';
import { AcademicSessionMutationService } from './academic-session-mutation.service';
import { AcademicService } from './academic.service';
import {
  CancelSessionDto,
  CompleteSessionDto,
  CreateSessionDto,
  ListSessionsDto,
  RescheduleSessionDto,
} from './academic.dto';

@ApiTags('academic')
@Controller({ path: 'sessions', version: '1' })
export class AcademicController {
  constructor(
    private readonly academic: AcademicService,
    private readonly mutations: AcademicSessionMutationService,
    private readonly lifecycle: AcademicSessionLifecycleService,
  ) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListSessionsDto) {
    return this.academic.listSessions(access, query);
  }

  @RequirePermission('academic.catalog.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.academic.readSession(access, id);
  }

  @RequirePermission('academic.sessions.manage')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateSessionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.mutations.create(access, input, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('academic.sessions.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @Post(':id/reschedule')
  reschedule(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: RescheduleSessionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.mutations.reschedule(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('academic.sessions.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @Post(':id/cancel')
  cancel(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CancelSessionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.lifecycle.cancel(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('academic.sessions.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @Post(':id/complete')
  complete(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CompleteSessionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.lifecycle.complete(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }
}
