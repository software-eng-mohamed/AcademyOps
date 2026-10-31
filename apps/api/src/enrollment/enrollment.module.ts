import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import {
  EnrollmentCancellationController,
  EnrollmentController,
  ModuleRetakesController,
} from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentQueryService } from './enrollment-query.service';
import { EnrollmentCreateService } from './enrollment-create.service';
import { EnrollmentTransitionService } from './enrollment-transition.service';
import { EnrollmentCohortService } from './enrollment-cohort.service';
import { EnrollmentCancellationService } from './enrollment-cancellation.service';
import { EnrollmentRetakeService } from './enrollment-retake.service';
import { EnrollmentEventService } from './enrollment-event.service';

@Module({
  imports: [PlatformModule],
  controllers: [EnrollmentController, EnrollmentCancellationController, ModuleRetakesController],
  providers: [
    EnrollmentService,
    EnrollmentQueryService,
    EnrollmentCreateService,
    EnrollmentTransitionService,
    EnrollmentCohortService,
    EnrollmentCancellationService,
    EnrollmentRetakeService,
    EnrollmentEventService,
  ],
  exports: [EnrollmentQueryService],
})
export class EnrollmentModule {}
