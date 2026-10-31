import { PlgApiError } from './errors.js';
import type {
  OtpChannelPairingCode,
  OtpChannelState,
  OtpChannelStatus,
} from './messaging-models.js';

const states = new Set<OtpChannelState>([
  'DISABLED',
  'STARTING',
  'QR_REQUIRED',
  'CONNECTED',
  'DISCONNECTED',
  'FAULTED',
  'STALE',
]);

export function validateOtpChannelStatus(value: unknown): OtpChannelStatus {
  const record = object(value);
  const state = record.state;
  const version = record.version;
  if (record.id !== null && typeof record.id !== 'string') throw invalid('id');
  if (record.provider !== 'BAILEYS') throw invalid('provider');
  if (typeof record.enabled !== 'boolean') throw invalid('enabled');
  if (typeof state !== 'string' || !states.has(state as OtpChannelState)) {
    throw invalid('state');
  }
  if (typeof record.otpAvailable !== 'boolean') throw invalid('otpAvailable');
  if (typeof record.needsQr !== 'boolean') throw invalid('needsQr');
  if (!nullableString(record.phoneMasked)) throw invalid('phoneMasked');
  if (!nullableString(record.lastErrorCode)) throw invalid('lastErrorCode');
  if (!nullableDate(record.lastConnectedAt)) throw invalid('lastConnectedAt');
  if (!nullableDate(record.lastDisconnectedAt)) throw invalid('lastDisconnectedAt');
  if (!nullableDate(record.lastHeartbeatAt)) throw invalid('lastHeartbeatAt');
  if (!nullableDate(record.qrExpiresAt)) throw invalid('qrExpiresAt');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw invalid('version');
  }
  if (record.id === null && version !== 0) throw invalid('version');
  if (typeof record.id === 'string' && version < 1) throw invalid('version');
  if (record.otpAvailable === true && (record.enabled !== true || state !== 'CONNECTED')) {
    throw invalid('otpAvailable');
  }
  if (record.needsQr === true && (record.enabled !== true || state !== 'QR_REQUIRED')) {
    throw invalid('needsQr');
  }
  if (typeof record.phoneMasked === 'string' && !isMaskedPhone(record.phoneMasked)) {
    throw invalid('phoneMasked');
  }
  if (typeof record.lastErrorCode === 'string' && !/^[A-Z0-9_]{2,80}$/.test(record.lastErrorCode)) {
    throw invalid('lastErrorCode');
  }
  return record as OtpChannelStatus;
}

export function validateOtpChannelPairingCode(value: unknown): OtpChannelPairingCode {
  const record = object(value);
  if (
    typeof record.qr !== 'string' ||
    record.qr.length < 20 ||
    typeof record.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(record.expiresAt))
  ) {
    throw invalid();
  }
  return { qr: record.qr, expiresAt: record.expiresAt };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function nullableDate(value: unknown): boolean {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function isMaskedPhone(value: string): boolean {
  // The connector intentionally exposes only the final four digits. Keep the
  // older country-code display valid while rejecting unmasked phone numbers.
  return /^\*{3}\d{4}$/.test(value) || /^\+\d{1,4}•{3,8}\d{4}$/.test(value);
}

function invalid(field?: string): PlgApiError {
  return new PlgApiError(502, {
    code: 'RESPONSE_INVALID',
    messageKey: 'errors.responseInvalid',
    ...(field ? { fieldErrors: [{ field, messageKey: 'errors.responseInvalid' }] } : {}),
  });
}
