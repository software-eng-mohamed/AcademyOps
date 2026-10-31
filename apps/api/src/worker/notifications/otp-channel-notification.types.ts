import type { NotificationLocale } from './session-notification.types';

export type OtpChannelAlertType = 'QR_REQUIRED' | 'UNAVAILABLE' | 'RECOVERED';

export type OtpChannelAlertPayload = {
  v: 1;
  channelId: string;
  type: OtpChannelAlertType;
  state: string;
  errorCode: string | null;
};

export type OtpChannelAlertRecipient = {
  userId: string;
  personId: string;
  locale: NotificationLocale;
  email: string | null;
};

export type OtpChannelAlertBatch = {
  eventId: string;
  organizationId: string;
  payload: OtpChannelAlertPayload;
  recipients: OtpChannelAlertRecipient[];
};
