import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CheckInDto {
  @ApiProperty()
  @IsString()
  @Length(20, 500)
  token!: string;
}

export class RecordAttendanceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({ enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] })
  @IsIn(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'])
  status!: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

  @ApiProperty()
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class CorrectAttendanceDto {
  @ApiProperty({ enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] })
  @IsIn(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'])
  status!: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

  @ApiProperty()
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class CreateMakeupDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  missedRecordId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  makeupRecordId!: string;
}

export class ListAttendanceRosterDto {
  @ApiProperty({ required: false, format: 'uuid', description: 'Pagination cursor' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class ListAttendanceAnomaliesDto {
  @ApiProperty({ required: false, format: 'uuid', description: 'Pagination cursor' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class CreateAttendancePolicyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  programVersionId!: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @ApiProperty({ minimum: 0.8, maximum: 1, default: 0.8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.8)
  @Max(1)
  minimumRatio = 0.8;

  @ApiProperty({ minimum: 1, maximum: 10080, default: 1440 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  lockAfterMinutes = 1440;

  @ApiProperty({ required: false, minimum: 0, maximum: 1440, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  checkInOpensBeforeMinutes = 30;

  @ApiProperty({ required: false, minimum: 0, maximum: 1440, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  checkInClosesAfterMinutes = 30;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class ListAttendancePoliciesDto {
  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  programVersionId?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  activeAt?: string;
}

export class ScanAttendanceDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ enum: ['PRESENT', 'LATE'] })
  @IsIn(['PRESENT', 'LATE'])
  status!: 'PRESENT' | 'LATE';
}

export class ScanAttendanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] })
  status!: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

  @ApiProperty({ type: Number })
  version!: number;
}

export class FinalizeAttendanceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['LOCKED'] })
  state!: 'LOCKED';

  @ApiProperty({ type: Number })
  version!: number;

  @ApiProperty({ type: Number })
  rosterCount!: number;

  @ApiProperty({ type: Number })
  absentCount!: number;
}

export class SelfStableQrTokenResponseDto {
  @ApiProperty()
  token!: string;
}
