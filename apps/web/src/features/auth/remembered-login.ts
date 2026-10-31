import type { LoginFormValues } from './login-schema';

const REMEMBERED_LOGIN_KEY = 'plg:remembered-login:v1';

export type RememberedLogin = Pick<LoginFormValues, 'identifier' | 'identifierType'>;

export function readRememberedLogin(): RememberedLogin | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(REMEMBERED_LOGIN_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.identifier !== 'string' ||
      record.version !== 1 ||
      !['EMAIL', 'PHONE'].includes(String(record.identifierType))
    ) {
      return null;
    }
    return {
      identifier: record.identifier.slice(0, 320),
      identifierType: record.identifierType as RememberedLogin['identifierType'],
    };
  } catch {
    return null;
  }
}

export function writeRememberedLogin(value: RememberedLogin | null): void {
  try {
    if (!value) {
      window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      return;
    }
    window.localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ ...value, version: 1 }));
  } catch {
    // Login must continue if storage is blocked or unavailable.
  }
}
