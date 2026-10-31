import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @IsIn(['EMAIL', 'PHONE'])
  identifierType!: 'EMAIL' | 'PHONE';

  @IsString()
  @Length(3, 320)
  identifier!: string;

  @IsString()
  @Length(8, 256)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsOptional()
  @Matches(/^\d{6}$/)
  totpCode?: string;

  @IsOptional()
  @Matches(/^[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){4}$/)
  recoveryCode?: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(8, 256)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

export class RequestPasswordResetDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @IsIn(['EMAIL', 'PHONE'])
  identifierType!: 'EMAIL' | 'PHONE';

  @IsString()
  @Length(3, 320)
  identifier!: string;

  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';
}

export class CompletePasswordResetDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @IsString()
  @Length(32, 256)
  token!: string;

  @IsString()
  @Length(12, 128)
  newPassword!: string;
}

export class UpdatePreferencesDto {
  @IsIn(['ar', 'en'])
  preferredLocale!: 'ar' | 'en';
}
