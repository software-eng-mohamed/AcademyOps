import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { otpChannelStates, type OtpChannelState } from './otp-channel.types';

export class OtpConnectorChannelDto {
  @IsUUID()
  organizationId!: string;

  enabled!: boolean;

  @IsString()
  desiredState!: string;

  @IsIn(otpChannelStates)
  state!: OtpChannelState;

  @IsInt()
  @Min(0)
  commandVersion!: number;

  @IsInt()
  @Min(0)
  handledCommandVersion!: number;
}

export class OtpConnectorChannelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtpConnectorChannelDto)
  channels!: OtpConnectorChannelDto[];
}

export class OtpConnectorStatusDto {
  @IsUUID()
  organizationId!: string;

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  commandVersion!: number;

  @IsIn(otpChannelStates)
  state!: OtpChannelState;

  @IsOptional()
  @Matches(/^\*{3}\d{4}$/)
  phoneMasked?: string | null;

  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,80}$/)
  errorCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8_192)
  qr?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  qrExpiresAt?: string;
}
