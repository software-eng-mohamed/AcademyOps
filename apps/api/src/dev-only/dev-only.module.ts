import { Module } from '@nestjs/common';
import { DevOnlyTotpController } from './dev-only-totp.controller';
import { DevOnlyTotpService } from './dev-only-totp.service';

@Module({
  controllers: [DevOnlyTotpController],
  providers: [DevOnlyTotpService],
})
export class DevOnlyModule {}
