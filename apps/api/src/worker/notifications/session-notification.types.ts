export type SessionNotificationEventType = 'session.rescheduled' | 'session.cancelled';
export type NotificationLocale = 'ar' | 'en';
export type SessionNotificationPayload = {
  v: 1;
  sessionId: string;
  type: 'RESCHEDULED' | 'CANCELLED';
  startsAt: string | null;
  endsAt: string | null;
  cohort: {
    id: string;
    code: string;
    name: string | null;
  };
  room: {
    id: string;
    code: string;
    name: string;
  } | null;
};
export type SessionNotificationRecipient = {
  userId: string;
  personId: string;
  locale: NotificationLocale;
  email: string | null;
};
export type SessionNotificationContext = {
  eventId: string;
  organizationId: string;
  payload: SessionNotificationPayload;
  recipients: SessionNotificationRecipient[];
  studentPersonIds: string[];
};
export type SessionNotificationBatch = SessionNotificationContext & {
  eventKeyByUser: Map<string, string>;
};
