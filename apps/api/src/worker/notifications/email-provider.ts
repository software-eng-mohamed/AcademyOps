export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type EmailDeliveryResult = 'sent' | 'disabled';

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export class RetryableEmailError extends Error {}
export class PermanentEmailError extends Error {}
