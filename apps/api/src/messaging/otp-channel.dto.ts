import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { otpChannelStates, type OtpChannelState } from './otp-channel.types';

export class OtpChannelCommandDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class OtpChannelStatusDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({ enum: ['BAILEYS'] })
  provider!: 'BAILEYS';

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ enum: otpChannelStates })
  state!: OtpChannelState;

  @ApiProperty()
  otpAvailable!: boolean;

  @ApiProperty()
  needsQr!: boolean;

  @ApiPropertyOptional({ nullable: true })
  phoneMasked!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastErrorCode!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastConnectedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastDisconnectedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  lastHeartbeatAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  qrExpiresAt!: string | null;

  @ApiProperty({ minimum: 0 })
  version!: number;
}

export class OtpChannelPairingCodeDto {
  @ApiProperty({ description: 'Short-lived raw QR payload. Never cache or log this value.' })
  qr!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
