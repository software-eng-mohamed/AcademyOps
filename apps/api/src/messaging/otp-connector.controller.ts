import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { requireConnectorToken } from './otp-connector-auth';
import { OtpConnectorChannelsDto, OtpConnectorStatusDto } from './otp-connector.dto';
import { OtpConnectorStatusService } from './otp-connector-status.service';

@Public()
@ApiExcludeController()
@Controller({ path: 'internal/otp-connector', version: '1' })
export class OtpConnectorController {
  constructor(
    private readonly service: OtpConnectorStatusService,
    private readonly config: ConfigService,
  ) {}

  @Get('channels')
  @RateLimit({ name: 'internal.otp.channels', limit: 120, windowSeconds: 60 })
  async channels(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<OtpConnectorChannelsDto> {
    this.authorize(authorization);
    return { channels: await this.service.channels() };
  }

  @Post('status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'internal.otp.status', limit: 600, windowSeconds: 60 })
  async status(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: OtpConnectorStatusDto,
  ): Promise<void> {
    this.authorize(authorization);
    await this.service.report(input);
  }

  private authorize(authorization: string | undefined): void {
    requireConnectorToken(authorization, this.config.get<string>('OTP_CONNECTOR_INTERNAL_TOKEN'));
  }
}
