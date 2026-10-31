import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiHeader, ApiOkResponse } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { AttendanceService } from './attendance.service';
import { AttendancePolicyService } from './attendance-policy.service';
import { AttendanceReadService } from './attendance-read.service';
import { StableQrScanService } from './stable-qr-scan.service';
import { AttendanceFinalizeService } from './attendance-finalize.service';
import {
  CheckInDto,
  CorrectAttendanceDto,
  CreateAttendancePolicyDto,
  CreateMakeupDto,
  ListAttendanceAnomaliesDto,
  ListAttendancePoliciesDto,
  ListAttendanceRosterDto,
  RecordAttendanceDto,
  ScanAttendanceDto,
  ScanAttendanceResponseDto,
  FinalizeAttendanceResponseDto,
  SelfStableQrTokenResponseDto,
} from './attendance.dto';

@ApiTags('attendance')
@Controller({ path: '', version: '1' })
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly reads: AttendanceReadService,
    private readonly policies: AttendancePolicyService,
    private readonly stableQrScan: StableQrScanService,
    private readonly finalizeService: AttendanceFinalizeService,
  ) {}

  @RequirePermission('attendance.read')
  @Get('sessions/:id/attendance')
  roster(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Query() input: ListAttendanceRosterDto,
  ) {
    return this.reads.sessionRoster(access, id, input);
  }

  @RequirePermission('attendance.check_in_self')
  @ApiOkResponse({ type: SelfStableQrTokenResponseDto })
  @Get('attendance/self-token')
  getSelfToken(@CurrentAccess() access: AccessContext) {
    if (!access.studentPersonId) {
      throw new ForbiddenException({
        code: 'STUDENT_CONTEXT_REQUIRED',
        messageKey: 'attendance.studentContextRequired',
      });
    }
    const token = this.stableQrScan.generateToken(access.organizationId, access.studentPersonId);
    return { token };
  }

  @RequirePermission('attendance.read')
  @Get('attendance/:id')
  readRecord(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.record(access, id);
  }

  @RequirePermission('attendance.read')
  @Get('enrollments/:id/attendance-summary')
  summary(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.enrollmentSummary(access, id);
  }

  @RequirePermission('reports.operations.read')
  @Get('sessions/:id/attendance-anomalies')
  anomalies(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Query() input: ListAttendanceAnomaliesDto,
  ) {
    return this.reads.anomalies(access, id, input);
  }

  @RequirePermission('academic.programs.manage')
  @Get('attendance-policies')
  listPolicies(@CurrentAccess() access: AccessContext, @Query() input: ListAttendancePoliciesDto) {
    return this.policies.list(access, input);
  }

  @RequirePermission('academic.programs.manage')
  @Post('attendance-policies')
  createPolicy(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateAttendancePolicyDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.policies.create(access, input, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('attendance.qr.open')
  @Post('sessions/:id/attendance-window/open')
  openWindow(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.attendance.transitionWindow(
      access,
      id,
      'open',
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('attendance.qr.open')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'if-match', required: true, description: 'Current session version' })
  @ApiHeader({ name: 'idempotency-key', required: true, description: 'Idempotency key' })
  @ApiOkResponse({ type: FinalizeAttendanceResponseDto })
  @Post('sessions/:id/attendance-window/close')
  closeWindow(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.finalizeService.finalize(
      access,
      id,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('attendance.qr.open')
  @Post('sessions/:id/qr-challenges')
  openChallenge(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.attendance.openQrChallenge(access, id);
  }

  @RequirePermission('attendance.check_in_self')
  @RateLimit({ name: 'attendance.check_in', limit: 30, windowSeconds: 60 })
  @Post('attendance/check-in')
  checkIn(
    @CurrentAccess() access: AccessContext,
    @Body() input: CheckInDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.attendance.checkIn(access, input.token, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('attendance.record_manual')
  @RateLimit({ name: 'attendance.scan', limit: 120, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'idempotency-key', required: true, description: 'Idempotency key' })
  @ApiOkResponse({ type: ScanAttendanceResponseDto })
  @Post('sessions/:id/attendance/scan')
  scan(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ScanAttendanceDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.stableQrScan.scan(access, id, input, requireIdempotencyKey(key), correlationId);
  }

  @RequirePermission('attendance.record_manual')
  @Post('sessions/:id/attendance/manual')
  recordManual(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: RecordAttendanceDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.attendance.recordManual(
      access,
      id,
      input.enrollmentId,
      input.status,
      input.reason,
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('attendance.correct')
  @Post('attendance/:id/corrections')
  correct(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CorrectAttendanceDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.attendance.correct(
      access,
      id,
      input.status,
      input.reason,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('attendance.correct_after_lock')
  @Post('attendance/makeup-credits')
  makeup(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateMakeupDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.attendance.createMakeup(
      access,
      input.missedRecordId,
      input.makeupRecordId,
      requireIdempotencyKey(key),
      correlationId,
    );
  }
}
