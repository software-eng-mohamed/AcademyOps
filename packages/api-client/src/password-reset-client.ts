import { BaseApiClient } from './base.js';

export class PlgPasswordResetClient extends BaseApiClient {
  async requestPasswordReset(
    input: string | { identifierType: 'EMAIL' | 'PHONE'; identifier: string },
    organizationCode = 'PLG',
    locale: 'ar' | 'en' = 'en',
  ): Promise<{ accepted: true }> {
    const identifier =
      typeof input === 'string' ? { identifierType: 'EMAIL' as const, identifier: input } : input;
    const response = await this.request<unknown>('POST', '/auth/password/reset/request', {
      organizationCode,
      locale,
      ...identifier,
    });
    if (
      !response ||
      typeof response !== 'object' ||
      !('accepted' in response) ||
      response.accepted !== true
    ) {
      throw new Error('PASSWORD_RESET_RESPONSE_INVALID');
    }
    return { accepted: true };
  }

  completePasswordReset(
    token: string,
    newPassword: string,
    organizationCode = 'PLG',
  ): Promise<void> {
    return this.request('POST', '/auth/password/reset/complete', {
      organizationCode,
      token,
      newPassword,
    });
  }
}
