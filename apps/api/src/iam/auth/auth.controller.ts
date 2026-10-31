import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import type { Request, Response } from 'express';
import { requireVersion } from '../../common/http/headers';
import { RateLimit } from '../../platform/rate-limit/rate-limit.decorator';
import { CurrentAccess, Public, type AuthenticatedRequest } from '../authorization/decorators';
import {
  CurrentUserSummaryDto,
  LoginResponseDto,
  RequestPasswordResetResponseDto,
} from './auth-response.dto';
import {
  ChangePasswordDto,
  CompletePasswordResetDto,
  LoginDto,
  RequestPasswordResetDto,
  UpdatePreferencesDto,
} from './auth.dto';
import { AuthService, type CurrentUserSummary } from './auth.service';
import { clearSessionCookies, setSessionCookies } from './session-cookie.helper';

@ApiTags('identity')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @RateLimit({
    name: 'auth.login',
    limit: 10,
    ipLimit: 100,
    windowSeconds: 300,
    subject: 'LOGIN_IDENTIFIER',
  })
  @Post('login')
  @ApiCreatedResponse({ type: LoginResponseDto })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    expiresAt: string;
    mfaSetupRequired: boolean;
    passwordChangeRequired: boolean;
  }> {
    const result = await this.auth.login(input);
    setSessionCookies(response, this.config, result);
    return {
      expiresAt: result.expiresAt.toISOString(),
      mfaSetupRequired: result.mfaSetupRequired,
      passwordChangeRequired: result.passwordChangeRequired,
    };
  }

  @Get('me')
  @ApiOkResponse({ type: CurrentUserSummaryDto })
  async me(@CurrentAccess() access: AccessContext): Promise<CurrentUserSummary> {
    return this.auth.me(access);
  }

  @Patch('me/preferences')
  @ApiOkResponse({ type: CurrentUserSummaryDto })
  updatePreferences(
    @CurrentAccess() access: AccessContext,
    @Body() input: UpdatePreferencesDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<CurrentUserSummary> {
    return this.auth.updatePreferences(access, input, requireVersion(ifMatch), correlationId);
  }

  @Post('me/onboarding/complete')
  @ApiCreatedResponse({ type: CurrentUserSummaryDto })
  completeOnboarding(
    @CurrentAccess() access: AccessContext,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<CurrentUserSummary> {
    return this.auth.completeOnboarding(access, requireVersion(ifMatch), correlationId);
  }

  @HttpCode(204)
  @Post('password/change')
  @ApiResponse({ status: 204, description: 'Password changed successfully' })
  async changePassword(
    @CurrentAccess() access: AccessContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: ChangePasswordDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<void> {
    const authenticated = request as AuthenticatedRequest;
    await this.auth.changePassword(access, authenticated.sessionId!, input, correlationId);
    clearSessionCookies(response, this.config);
  }

  @Public()
  @RateLimit({
    name: 'auth.password_reset_request',
    limit: 5,
    ipLimit: 100,
    windowSeconds: 900,
    subject: 'LOGIN_IDENTIFIER',
  })
  @HttpCode(202)
  @Post('password/reset/request')
  @ApiResponse({ status: 202, type: RequestPasswordResetResponseDto })
  async requestPasswordReset(
    @Body() input: RequestPasswordResetDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<{ accepted: true }> {
    await this.auth.requestPasswordReset(input, correlationId);
    return { accepted: true };
  }

  @Public()
  @RateLimit({
    name: 'auth.password_reset_complete',
    limit: 10,
    ipLimit: 100,
    windowSeconds: 900,
    subject: 'RESET_TOKEN',
  })
  @HttpCode(204)
  @Post('password/reset/complete')
  @ApiResponse({ status: 204, description: 'Password reset completed successfully' })
  async completePasswordReset(
    @Body() input: CompletePasswordResetDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<void> {
    await this.auth.completePasswordReset(input, correlationId);
  }

  @Post('logout')
  @ApiCreatedResponse({ description: 'Logout successful' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const authenticated = request as AuthenticatedRequest;
    if (authenticated.sessionId) await this.auth.logout(authenticated.sessionId);
    clearSessionCookies(response, this.config);
  }
}
