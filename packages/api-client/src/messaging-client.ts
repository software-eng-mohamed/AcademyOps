import { PlgIamAdminClient } from './iam-admin-client.js';
import type {
  OtpChannelCommand,
  OtpChannelPairingCode,
  OtpChannelStatus,
} from './messaging-models.js';
import { validateOtpChannelPairingCode, validateOtpChannelStatus } from './messaging-validators.js';

export class PlgMessagingClient extends PlgIamAdminClient {
  async getOtpChannelStatus(): Promise<OtpChannelStatus> {
    return validateOtpChannelStatus(await this.request('GET', '/messaging/otp-channel'));
  }

  async getOtpChannelPairingCode(): Promise<OtpChannelPairingCode> {
    return validateOtpChannelPairingCode(
      await this.request('GET', '/messaging/otp-channel/pairing-code'),
    );
  }

  async commandOtpChannel(
    command: OtpChannelCommand,
    reason: string,
    version: number,
    idempotencyKey: string,
  ): Promise<OtpChannelStatus> {
    return validateOtpChannelStatus(
      await this.request(
        'POST',
        `/messaging/otp-channel/${command}`,
        { reason },
        {
          'If-Match': String(version),
          'idempotency-key': idempotencyKey,
        },
      ),
    );
  }
}
