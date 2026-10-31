import { BaseApiClient, type RequestOptions } from './base.js';
import type * as M from './models.js';

/** Lightweight identity and shell client. Feature routes use the full client lazily. */
export class PlgAuthClient extends BaseApiClient {
  me(options?: RequestOptions): Promise<M.CurrentUser | null> {
    return this.request<M.CurrentUser>('GET', '/auth/me', undefined, true, options);
  }

  login(input: {
    identifier: string;
    password: string;
    rememberMe?: boolean;
    totpCode?: string;
    recoveryCode?: string;
  }) {
    return this.request<{
      expiresAt: string;
      mfaSetupRequired: boolean;
      passwordChangeRequired: boolean;
    }>('POST', '/auth/login', {
      organizationCode: 'ACADEMYOPS',
      identifierType: 'EMAIL',
      ...input,
    });
  }

  logout(): Promise<void> {
    return this.request('POST', '/auth/logout');
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.request('POST', '/auth/password/change', { currentPassword, newPassword });
  }

  beginTotpEnrollment(label = 'AcademyOps') {
    return this.request<{ factorId: string; secret: string; otpauthUri: string }>(
      'POST',
      '/auth/mfa/totp/enroll',
      { label },
    );
  }

  verifyTotpEnrollment(factorId: string, code: string) {
    return this.request<{ recoveryCodes: string[] }>(
      'POST',
      `/auth/mfa/totp/${encodeURIComponent(factorId)}/verify`,
      { code },
    );
  }

  completeOnboarding(version: number): Promise<M.CurrentUser> {
    return this.request('POST', '/auth/me/onboarding/complete', undefined, {
      'If-Match': String(version),
    });
  }

  updateLocale(locale: 'ar' | 'en', version: number): Promise<M.CurrentUser> {
    return this.request(
      'PATCH',
      '/auth/me/preferences',
      { preferredLocale: locale },
      { 'If-Match': String(version) },
    );
  }

  search(q?: string, types?: M.SearchEntityType[], limit = 20, options?: RequestOptions) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (q) params.set('q', q);
    if (types?.length) params.set('types', types.join(','));
    return this.request<{
      query: string | null;
      items: M.SearchResult[];
      recent: M.SearchResult[];
    }>('GET', `/search?${params.toString()}`, undefined, undefined, options);
  }

  recordRecent(entityType: M.SearchEntityType, entityId: string): Promise<void> {
    return this.request('POST', '/search/recent', { entityType, entityId });
  }

  notifications(cursor?: string, options?: RequestOptions): Promise<M.NotificationList> {
    return this.request(
      'GET',
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      undefined,
      undefined,
      options,
    );
  }

  markNotificationRead(id: string): Promise<void> {
    return this.request('POST', `/notifications/${encodeURIComponent(id)}/read`);
  }

  markAllNotificationsRead(): Promise<void> {
    return this.request('POST', '/notifications/read-all');
  }
}
