import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { StudentCommandService } from './student-command.service';
import { StudentContactsService } from './student-contacts.service';
import { StudentLearningViewService } from './student-learning-view.service';
import { StudentQueryService } from './student-query.service';
import { StudentRegistrationController } from './student-registration.controller';
import { StudentRegistrationReviewService } from './student-registration-review.service';
import { StudentRegistrationService } from './student-registration.service';
import { StudentScopePolicyService } from './student-scope-policy.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentMergeService } from './student-merge.service';

@Module({
  imports: [PlatformModule],
  controllers: [StudentsController, StudentRegistrationController],
  providers: [
    StudentsService,
    StudentScopePolicyService,
    StudentContactsService,
    StudentLearningViewService,
    StudentQueryService,
    StudentCommandService,
    StudentRegistrationService,
    StudentRegistrationReviewService,
    StudentMergeService,
  ],
})
export class StudentsModule {}
