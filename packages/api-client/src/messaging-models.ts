export type OtpChannelState =
  | 'DISABLED'
  | 'STARTING'
  | 'QR_REQUIRED'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAULTED'
  | 'STALE';

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

export type OtpChannelPairingCode = { qr: string; expiresAt: string };
export type OtpChannelCommand = 'connect' | 'disable' | 'reset';
