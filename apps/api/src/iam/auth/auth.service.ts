import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import type {
  ChangePasswordDto,
  CompletePasswordResetDto,
  LoginDto,
  RequestPasswordResetDto,
  UpdatePreferencesDto,
} from './auth.dto';
import { AuthLoginService } from './auth-login.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthProfileService, type CurrentUserSummary } from './auth-profile.service';
import type { IssuedSession } from './session-cookie.helper';

export type { CurrentUserSummary };

@Injectable()
export class AuthService {
  constructor(
    private readonly loginService: AuthLoginService,
    private readonly profileService: AuthProfileService,
    private readonly passwordService: AuthPasswordService,
  ) {}

  async login(input: LoginDto): Promise<
    IssuedSession & {
      mfaSetupRequired: boolean;
      passwordChangeRequired: boolean;
    }
  > {
    return this.loginService.login(input);
  }

  async logout(sessionId: string): Promise<void> {
    return this.loginService.logout(sessionId);
  }

  async me(access: AccessContext): Promise<CurrentUserSummary> {
    return this.profileService.me(access);
  }

  async updatePreferences(
    access: AccessContext,
    input: UpdatePreferencesDto,
    expectedVersion: number,
    correlationId: string,
  ): Promise<CurrentUserSummary> {
    return this.profileService.updatePreferences(access, input, expectedVersion, correlationId);
  }

  async completeOnboarding(
    access: AccessContext,
    expectedVersion: number,
    correlationId: string,
  ): Promise<CurrentUserSummary> {
    return this.profileService.completeOnboarding(access, expectedVersion, correlationId);
  }

  async changePassword(
    access: AccessContext,
    sessionId: string,
    input: ChangePasswordDto,
    correlationId: string,
  ): Promise<void> {
    return this.passwordService.changePassword(access, sessionId, input, correlationId);
  }

  async requestPasswordReset(input: RequestPasswordResetDto, correlationId: string): Promise<void> {
    return this.passwordService.requestPasswordReset(input, correlationId);
  }

  async completePasswordReset(
    input: CompletePasswordResetDto,
    correlationId: string,
  ): Promise<void> {
    return this.passwordService.completePasswordReset(input, correlationId);
  }
}
