import { Injectable } from '@nestjs/common';
import {
  type OtpMessage,
  type OtpMessageProvider,
  PermanentOtpDeliveryError,
} from './otp-message-provider';

export const OTP_CONNECTOR_UNAVAILABLE_CODE = 'OTP_CONNECTOR_NOT_CONFIGURED';

/**
 * Fail-closed placeholder used until an approved OTP transport is installed.
 * It deliberately performs no network I/O and never logs message contents.
 */
@Injectable()
export class UnavailableOtpMessageProvider implements OtpMessageProvider {
  send(message: OtpMessage): Promise<void> {
    void message;
    return Promise.reject(new PermanentOtpDeliveryError(OTP_CONNECTOR_UNAVAILABLE_CODE));
  }
}
