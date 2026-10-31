import { Module } from '@nestjs/common';
import { MessagingCoreModule } from './messaging-core.module';
import { OtpChannelController } from './otp-channel.controller';
import { OtpChannelControlService } from './otp-channel-control.service';
import { OtpConnectorController } from './otp-connector.controller';
import { OtpConnectorStatusService } from './otp-connector-status.service';

@Module({
  imports: [MessagingCoreModule],
  controllers: [OtpChannelController, OtpConnectorController],
  providers: [OtpChannelControlService, OtpConnectorStatusService],
})
export class MessagingModule {}
