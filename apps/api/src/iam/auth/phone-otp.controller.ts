import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCreatedResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RateLimit } from '../../platform/rate-limit/rate-limit.decorator';
import { Public } from '../authorization/decorators';
import { LoginResponseDto } from './auth-response.dto';
import { RequestPhoneOtpDto, RequestPhoneOtpResponseDto, VerifyPhoneOtpDto } from './phone-otp.dto';
import { PhoneOtpService } from './phone-otp.service';
import { setSessionCookies } from './session-cookie.helper';

@ApiTags('identity')
@Controller({ path: 'auth/phone-otp', version: '1' })
export class PhoneOtpController {
  constructor(
    private readonly phoneOtpService: PhoneOtpService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @RateLimit({
    name: 'auth.phone_otp_request',
    limit: 5,
    ipLimit: 100,
    windowSeconds: 300,
    subject: 'PHONE',
  })
  @HttpCode(202)
  @Post('request')
  @ApiResponse({ status: 202, type: RequestPhoneOtpResponseDto })
  async request(
    @Body() input: RequestPhoneOtpDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<RequestPhoneOtpResponseDto> {
    await this.phoneOtpService.requestOtp(input, correlationId);
    return { accepted: true };
  }

  @Public()
  @RateLimit({
    name: 'auth.phone_otp_verify',
    limit: 10,
    ipLimit: 100,
    windowSeconds: 300,
    subject: 'PHONE',
  })
  @Post('verify')
  @ApiCreatedResponse({ type: LoginResponseDto })
  async verify(
    @Body() input: VerifyPhoneOtpDto,
    @Headers('x-correlation-id') correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.phoneOtpService.verifyOtp(input, correlationId);
    setSessionCookies(response, this.config, result);
    return {
      expiresAt: result.expiresAt.toISOString(),
      mfaSetupRequired: result.mfaSetupRequired,
      passwordChangeRequired: result.passwordChangeRequired,
    };
  }
}
