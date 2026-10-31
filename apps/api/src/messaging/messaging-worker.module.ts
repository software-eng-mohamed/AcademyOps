import { Module } from '@nestjs/common';
import { OTP_MESSAGE_PROVIDER } from './otp-message-provider';
import { WhatsappWebOtpMessageProvider } from './whatsapp-web-otp-message-provider';

@Module({
  providers: [
    WhatsappWebOtpMessageProvider,
    { provide: OTP_MESSAGE_PROVIDER, useExisting: WhatsappWebOtpMessageProvider },
  ],
  exports: [OTP_MESSAGE_PROVIDER],
})
export class MessagingWorkerModule {}
