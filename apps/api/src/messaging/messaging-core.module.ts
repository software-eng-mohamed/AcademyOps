import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { OtpChannelAvailabilityService } from './otp-channel-availability.service';
import { OtpChannelQrService } from './otp-channel-qr.service';

@Module({
  imports: [PlatformModule],
  providers: [OtpChannelAvailabilityService, OtpChannelQrService],
  exports: [OtpChannelAvailabilityService, OtpChannelQrService, PlatformModule],
})
export class MessagingCoreModule {}
