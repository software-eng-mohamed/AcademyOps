export const otpChannelStates = [
  'DISABLED',
  'STARTING',
  'QR_REQUIRED',
  'CONNECTED',
  'DISCONNECTED',
  'FAULTED',
  'STALE',
] as const;

export type OtpChannelState = (typeof otpChannelStates)[number];
export type OtpChannelCommand = 'CONNECT' | 'DISABLE' | 'RESET';

export type OtpChannelStatus = {
  id: string | null;
  provider: 'BAILEYS';
  enabled: boolean;
  state: OtpChannelState;
  otpAvailable: boolean;
  needsQr: boolean;
  phoneMasked: string | null;
  lastErrorCode: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastHeartbeatAt: string | null;
  qrExpiresAt: string | null;
  version: number;
};
