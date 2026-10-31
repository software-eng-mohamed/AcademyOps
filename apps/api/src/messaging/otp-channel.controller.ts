import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { OtpChannelAvailabilityService } from './otp-channel-availability.service';
import { OtpChannelControlService } from './otp-channel-control.service';
import {
  OtpChannelCommandDto,
  OtpChannelPairingCodeDto,
  OtpChannelStatusDto,
} from './otp-channel.dto';
import { OtpChannelQrService } from './otp-channel-qr.service';
import type { OtpChannelCommand } from './otp-channel.types';

@ApiTags('messaging')
@Controller({ path: 'messaging/otp-channel', version: '1' })
export class OtpChannelController {
  constructor(
    private readonly availability: OtpChannelAvailabilityService,
    private readonly control: OtpChannelControlService,
    private readonly qr: OtpChannelQrService,
  ) {}

  @RequirePermission('messaging.otp.read')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: OtpChannelStatusDto })
  read(@CurrentAccess() access: AccessContext): Promise<OtpChannelStatusDto> {
    requireOrganizationScope(access, 'messaging.otp.read');
    return this.availability.read(access.organizationId);
  }

  @RequirePermission('messaging.otp.manage')
  @Get('pairing-code')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: OtpChannelPairingCodeDto })
  async pairingCode(@CurrentAccess() access: AccessContext): Promise<OtpChannelPairingCodeDto> {
    requireOrganizationScope(access, 'messaging.otp.manage');
    const status = await this.availability.read(access.organizationId);
    if (!status.needsQr || !status.qrExpiresAt) throw qrNotReady();
    const value = await this.qr.read(access.organizationId);
    if (!value || value.expiresAt !== status.qrExpiresAt) throw qrNotReady();
    return value;
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('messaging.otp.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({ type: OtpChannelStatusDto })
  connect(
    @CurrentAccess() access: AccessContext,
    @Body() input: OtpChannelCommandDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.run(access, 'CONNECT', input, ifMatch, key, correlationId);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('messaging.otp.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({ type: OtpChannelStatusDto })
  disable(
    @CurrentAccess() access: AccessContext,
    @Body() input: OtpChannelCommandDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.run(access, 'DISABLE', input, ifMatch, key, correlationId);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('messaging.otp.manage')
  @ApiHeader({ name: 'if-match', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({ type: OtpChannelStatusDto })
  reset(
    @CurrentAccess() access: AccessContext,
    @Body() input: OtpChannelCommandDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.run(access, 'RESET', input, ifMatch, key, correlationId);
  }

  private run(
    access: AccessContext,
    command: OtpChannelCommand,
    input: OtpChannelCommandDto,
    ifMatch: string | undefined,
    key: string | undefined,
    correlationId: string,
  ) {
    requireOrganizationScope(access, 'messaging.otp.manage');
    return this.control.command(
      access,
      command,
      input.reason.trim(),
      requireChannelVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }
}

function qrNotReady(): ConflictException {
  return new ConflictException({
    code: 'OTP_CHANNEL_QR_NOT_READY',
    messageKey: 'messaging.qrNotReady',
  });
}

function requireOrganizationScope(
  access: AccessContext,
  permission: 'messaging.otp.read' | 'messaging.otp.manage',
): void {
  if (access.grants.get(permission)?.has('O')) return;
  throw new ForbiddenException({ code: 'PERMISSION_DENIED', messageKey: 'auth.permissionDenied' });
}

function requireChannelVersion(value: string | undefined): number {
  if (!value)
    throw new BadRequestException({
      code: 'VERSION_REQUIRED',
      messageKey: 'errors.ifMatchRequired',
    });
  const normalized = value.replace(/^W\//, '').replaceAll('"', '');
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 0) {
    throw new BadRequestException({ code: 'VERSION_INVALID', messageKey: 'errors.ifMatchInvalid' });
  }
  return version;
}
