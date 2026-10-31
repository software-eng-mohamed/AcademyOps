export const channelStates = [
  'DISABLED',
  'STARTING',
  'QR_REQUIRED',
  'CONNECTED',
  'DISCONNECTED',
  'FAULTED',
  'STALE',
] as const;

export type ChannelState = (typeof channelStates)[number];

export type ConnectorChannel = {
  organizationId: string;
  enabled: boolean;
  desiredState: string;
  state: ChannelState;
  commandVersion: number;
  handledCommandVersion: number;
};

export type StatusReport = {
  organizationId: string;
  commandVersion: number;
  state: ChannelState;
  phoneMasked?: string | null;
  errorCode?: string | null;
  qr?: string;
  qrExpiresAt?: string;
};

export type SendRequest = {
  organizationId: string;
  to: string;
  body: string;
  idempotencyKey: string;
};
