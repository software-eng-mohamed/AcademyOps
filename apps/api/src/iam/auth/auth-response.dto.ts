import { ApiProperty } from '@nestjs/swagger';
import {
  type AccessScope,
  type PermissionCode,
  accessScopes,
  permissions,
} from '@academyops/contracts';

export class LoginResponseDto {
  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty()
  mfaSetupRequired!: boolean;

  @ApiProperty()
  passwordChangeRequired!: boolean;
}

export class UserOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class UserBranchSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class UserRoleSummaryDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class UserPermissionGrantDto {
  @ApiProperty({ enum: permissions })
  code!: PermissionCode;

  @ApiProperty({ type: [String], enum: accessScopes })
  scopes!: AccessScope[];
}

export class CurrentUserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: UserOrganizationDto })
  organization!: UserOrganizationDto;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['ar', 'en'], nullable: true })
  preferredLocale!: 'ar' | 'en' | null;

  @ApiProperty()
  localePreferenceSet!: boolean;

  @ApiProperty()
  onboardingCompleted!: boolean;

  @ApiProperty({ type: [UserBranchSummaryDto] })
  branches!: UserBranchSummaryDto[];

  @ApiProperty({ type: [UserRoleSummaryDto] })
  roles!: UserRoleSummaryDto[];

  @ApiProperty({ type: [UserPermissionGrantDto] })
  permissions!: UserPermissionGrantDto[];

  @ApiProperty()
  mfaRequired!: boolean;

  @ApiProperty()
  mfaVerified!: boolean;

  @ApiProperty()
  mfaSetupRequired!: boolean;

  @ApiProperty()
  passwordChangeRequired!: boolean;
}

export class RequestPasswordResetResponseDto {
  @ApiProperty({ example: true })
  accepted!: true;
}

export class EnrollMfaResponseDto {
  @ApiProperty({ format: 'uuid' })
  factorId!: string;

  @ApiProperty()
  secret!: string;

  @ApiProperty()
  otpauthUri!: string;
}

export class VerifyMfaResponseDto {
  @ApiProperty({ format: 'date-time' })
  verifiedAt!: string;

  @ApiProperty({ type: [String] })
  recoveryCodes!: string[];
}

export class StepUpMfaResponseDto {
  @ApiProperty({ format: 'date-time' })
  verifiedAt!: string;

  @ApiProperty()
  validForSeconds!: number;
}

export class RegenerateRecoveryCodesResponseDto {
  @ApiProperty({ type: [String] })
  recoveryCodes!: string[];
}
