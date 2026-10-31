import { describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { AuthService } from '../src/iam/auth/auth.service';
import type { AuthLoginService } from '../src/iam/auth/auth-login.service';
import type { AuthProfileService, CurrentUserSummary } from '../src/iam/auth/auth-profile.service';
import type { AuthPasswordService } from '../src/iam/auth/auth-password.service';
import type {
  ChangePasswordDto,
  CompletePasswordResetDto,
  LoginDto,
  RequestPasswordResetDto,
  UpdatePreferencesDto,
} from '../src/iam/auth/auth.dto';

describe('AuthService Facade Delegation', () => {
  const dummyAccess: AccessContext = {
    organizationId: 'org-123',
    actorUserId: 'user-456',
    grants: new Map(),
    branchIds: new Set(),
    assignedResourceIds: new Set(),
  };

  const dummyUserSummary: CurrentUserSummary = {
    id: 'user-456',
    version: 1,
    organization: { id: 'org-123', code: 'ORG', name: 'Org Name' },
    name: 'Test User',
    preferredLocale: 'en',
    localePreferenceSet: true,
    onboardingCompleted: true,
    branches: [],
    roles: [],
    permissions: [],
    mfaRequired: false,
    mfaVerified: false,
    mfaSetupRequired: false,
    passwordChangeRequired: false,
  };

  it('delegates login and logout to AuthLoginService', async () => {
    const loginResult = {
      sessionToken: 'token-123',
      csrfToken: 'csrf-123',
      expiresAt: new Date(),
      mfaSetupRequired: false,
      passwordChangeRequired: false,
    };

    const loginFn = vi.fn().mockResolvedValue(loginResult);
    const logoutFn = vi.fn().mockResolvedValue(undefined);

    const loginServiceMock = {
      login: loginFn,
      logout: logoutFn,
    } as unknown as AuthLoginService;

    const auth = new AuthService(
      loginServiceMock,
      {} as AuthProfileService,
      {} as AuthPasswordService,
    );

    const loginDto: LoginDto = {
      organizationCode: 'ORG',
      identifierType: 'EMAIL',
      identifier: 'user@example.com',
      password: 'password123',
    };

    const res = await auth.login(loginDto);
    expect(loginFn).toHaveBeenCalledWith(loginDto);
    expect(res).toBe(loginResult);

    await auth.logout('session-789');
    expect(logoutFn).toHaveBeenCalledWith('session-789');
  });

  it('delegates me, updatePreferences, and completeOnboarding to AuthProfileService', async () => {
    const meFn = vi.fn().mockResolvedValue(dummyUserSummary);
    const updatePreferencesFn = vi.fn().mockResolvedValue(dummyUserSummary);
    const completeOnboardingFn = vi.fn().mockResolvedValue(dummyUserSummary);

    const profileServiceMock = {
      me: meFn,
      updatePreferences: updatePreferencesFn,
      completeOnboarding: completeOnboardingFn,
    } as unknown as AuthProfileService;

    const auth = new AuthService(
      {} as AuthLoginService,
      profileServiceMock,
      {} as AuthPasswordService,
    );

    const meRes = await auth.me(dummyAccess);
    expect(meFn).toHaveBeenCalledWith(dummyAccess);
    expect(meRes).toBe(dummyUserSummary);

    const prefDto: UpdatePreferencesDto = { preferredLocale: 'ar' };
    const prefRes = await auth.updatePreferences(dummyAccess, prefDto, 1, 'corr-1');
    expect(updatePreferencesFn).toHaveBeenCalledWith(dummyAccess, prefDto, 1, 'corr-1');
    expect(prefRes).toBe(dummyUserSummary);

    const onbRes = await auth.completeOnboarding(dummyAccess, 1, 'corr-2');
    expect(completeOnboardingFn).toHaveBeenCalledWith(dummyAccess, 1, 'corr-2');
    expect(onbRes).toBe(dummyUserSummary);
  });

  it('delegates changePassword, requestPasswordReset, and completePasswordReset to AuthPasswordService', async () => {
    const changePasswordFn = vi.fn().mockResolvedValue(undefined);
    const requestPasswordResetFn = vi.fn().mockResolvedValue(undefined);
    const completePasswordResetFn = vi.fn().mockResolvedValue(undefined);

    const passwordServiceMock = {
      changePassword: changePasswordFn,
      requestPasswordReset: requestPasswordResetFn,
      completePasswordReset: completePasswordResetFn,
    } as unknown as AuthPasswordService;

    const auth = new AuthService(
      {} as AuthLoginService,
      {} as AuthProfileService,
      passwordServiceMock,
    );

    const changeDto: ChangePasswordDto = {
      currentPassword: 'oldPass123!',
      newPassword: 'newPass456!',
    };
    await auth.changePassword(dummyAccess, 'sess-1', changeDto, 'corr-3');
    expect(changePasswordFn).toHaveBeenCalledWith(dummyAccess, 'sess-1', changeDto, 'corr-3');

    const reqResetDto: RequestPasswordResetDto = {
      organizationCode: 'ORG',
      identifierType: 'EMAIL',
      identifier: 'user@example.com',
      locale: 'en',
    };
    await auth.requestPasswordReset(reqResetDto, 'corr-4');
    expect(requestPasswordResetFn).toHaveBeenCalledWith(reqResetDto, 'corr-4');

    const compResetDto: CompletePasswordResetDto = {
      organizationCode: 'ORG',
      token: 'reset-token',
      newPassword: 'newPass789!',
    };
    await auth.completePasswordReset(compResetDto, 'corr-5');
    expect(completePasswordResetFn).toHaveBeenCalledWith(compResetDto, 'corr-5');
  });
});
