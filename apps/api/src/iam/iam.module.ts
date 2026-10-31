import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformModule } from '../platform/platform.module';
import { MessagingCoreModule } from '../messaging/messaging-core.module';
import { RateLimitGuard } from '../platform/rate-limit/rate-limit.guard';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthLoginService } from './auth/auth-login.service';
import { AuthProfileService } from './auth/auth-profile.service';
import { AuthPasswordService } from './auth/auth-password.service';
import { MfaController } from './auth/mfa.controller';
import { MfaService } from './auth/mfa.service';
import { MfaTotpConsumerService } from './auth/mfa-totp-consumer.service';
import { PermissionGuard } from './authorization/permission.guard';
import { SessionGuard } from './authorization/session.guard';
import { SessionAccessService } from './authorization/session-access.service';
import { SessionAccessCacheService } from './authorization/session-access-cache.service';
import {
  BranchesController,
  RolesController,
  UsersController,
} from './administration/iam-administration.controller';
import { IamAdministrationService } from './administration/iam-administration.service';
import { IamBranchAdministrationService } from './administration/iam-branch-administration.service';
import { IamRoleAdministrationService } from './administration/iam-role-administration.service';
import { IamUserReadService } from './administration/iam-user-read.service';
import { IamUserLifecycleService } from './administration/iam-user-lifecycle.service';
import { IamUserAssignmentService } from './administration/iam-user-assignment.service';

import { PhoneOtpController } from './auth/phone-otp.controller';
import { PhoneOtpService } from './auth/phone-otp.service';

@Module({
  imports: [PlatformModule, MessagingCoreModule],
  controllers: [
    AuthController,
    MfaController,
    PhoneOtpController,
    BranchesController,
    RolesController,
    UsersController,
  ],
  providers: [
    AuthService,
    AuthLoginService,
    AuthProfileService,
    AuthPasswordService,
    MfaService,
    MfaTotpConsumerService,
    PhoneOtpService,
    IamBranchAdministrationService,
    IamRoleAdministrationService,
    IamUserReadService,
    IamUserLifecycleService,
    IamUserAssignmentService,
    IamAdministrationService,
    SessionAccessService,
    SessionAccessCacheService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [SessionAccessService, SessionAccessCacheService],
})
export class IamModule {}
