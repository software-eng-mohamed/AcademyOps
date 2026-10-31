export type OtpMessage = {
  organizationId: string;
  to: string;
  body: string;
  idempotencyKey: string;
};

export interface OtpMessageProvider {
  send(message: OtpMessage): Promise<void>;
}

export const OTP_MESSAGE_PROVIDER = Symbol('OTP_MESSAGE_PROVIDER');

export class RetryableOtpDeliveryError extends Error {}
export class PermanentOtpDeliveryError extends Error {}
