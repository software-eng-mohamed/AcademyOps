import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { AttendanceAccessService } from './attendance-access.service';
import { AttendanceController } from './attendance.controller';
import { AttendancePolicyService } from './attendance-policy.service';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceService } from './attendance.service';
import { StableQrScanService } from './stable-qr-scan.service';
import { AttendanceFinalizeService } from './attendance-finalize.service';
import { AttendanceMakeupService } from './attendance-makeup.service';
import { AttendanceQrCheckInService } from './attendance-qr-check-in.service';
import { AttendanceRecordCommandService } from './attendance-record-command.service';
import { AttendanceRecordMutationService } from './attendance-record-mutation.service';
import { AttendanceWindowCommandService } from './attendance-window-command.service';
import { AttendanceWindowPolicyService } from './attendance-window-policy.service';

@Module({
  imports: [PlatformModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceAccessService,
    AttendancePolicyService,
    AttendanceReadService,
    AttendanceService,
    StableQrScanService,
    AttendanceFinalizeService,
    AttendanceMakeupService,
    AttendanceQrCheckInService,
    AttendanceRecordCommandService,
    AttendanceRecordMutationService,
    AttendanceWindowCommandService,
    AttendanceWindowPolicyService,
  ],
  exports: [AttendancePolicyService],
})
export class AttendanceModule {}
