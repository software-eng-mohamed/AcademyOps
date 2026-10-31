import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { RateLimit } from '../../platform/rate-limit/rate-limit.decorator';
import { CurrentAccess, type AuthenticatedRequest } from '../authorization/decorators';
import {
  EnrollMfaResponseDto,
  RegenerateRecoveryCodesResponseDto,
  StepUpMfaResponseDto,
  VerifyMfaResponseDto,
} from './auth-response.dto';
import { EnrollTotpDto, VerifyTotpDto } from './mfa.dto';
import { MfaService } from './mfa.service';

@ApiTags('identity')
@Controller({ path: 'auth/mfa', version: '1' })
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Post('totp/enroll')
  @ApiCreatedResponse({ type: EnrollMfaResponseDto })
  enroll(@CurrentAccess() access: AccessContext, @Body() input: EnrollTotpDto) {
    return this.mfa.beginEnrollment(access, input.label);
  }

  @Post('totp/:factorId/verify')
  @RateLimit({ name: 'auth.mfa.verify', limit: 10, windowSeconds: 300 })
  @ApiCreatedResponse({ type: VerifyMfaResponseDto })
  verify(
    @CurrentAccess() access: AccessContext,
    @Req() request: AuthenticatedRequest,
    @Param('factorId') factorId: string,
    @Body() input: VerifyTotpDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.mfa.verifyEnrollment(
      access,
      request.sessionId!,
      factorId,
      input.code,
      correlationId,
    );
  }

  @Post('step-up')
  @RateLimit({ name: 'auth.mfa.step_up', limit: 10, windowSeconds: 300 })
  @ApiCreatedResponse({ type: StepUpMfaResponseDto })
  stepUp(
    @CurrentAccess() access: AccessContext,
    @Req() request: AuthenticatedRequest,
    @Body() input: VerifyTotpDto,
  ) {
    return this.mfa.stepUp(access, request.sessionId!, input.code);
  }

  @Post('recovery-codes/regenerate')
  @ApiCreatedResponse({ type: RegenerateRecoveryCodesResponseDto })
  regenerateRecoveryCodes(
    @CurrentAccess() access: AccessContext,
    @Req() request: AuthenticatedRequest,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.mfa.regenerateRecoveryCodes(access, request.sessionId!, correlationId);
  }
}
