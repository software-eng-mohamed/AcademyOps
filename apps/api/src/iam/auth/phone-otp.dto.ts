import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RequestPhoneOtpDto {
  @ApiProperty({ example: 'ACADEMY' })
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @ApiProperty({ example: '+201234567890' })
  @IsString()
  @Length(3, 50)
  phone!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 256 })
  @IsString()
  @Length(8, 256)
  password!: string;
}

export class RequestPhoneOtpResponseDto {
  @ApiProperty({ example: true })
  accepted!: true;
}

export class VerifyPhoneOtpDto {
  @ApiProperty({ example: 'ACADEMY' })
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @ApiProperty({ example: '+201234567890' })
  @IsString()
  @Length(3, 50)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  totpCode?: string;

  @ApiProperty({ required: false, example: 'abcd-efgh-ijkl-mnop-qrst' })
  @IsOptional()
  @Matches(/^[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){4}$/)
  recoveryCode?: string;
}
