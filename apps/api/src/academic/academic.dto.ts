import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SessionTrainerDto {
  @IsUUID()
  trainerId!: string;

  @IsOptional()
  @IsIn(['PRIMARY', 'ASSISTANT'])
  role?: 'PRIMARY' | 'ASSISTANT';
}

export class CreateSessionDto {
  @IsUUID()
  cohortModuleId!: string;

  @IsUUID()
  cohortId!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsInt()
  @Min(1)
  ordinal!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsIn(['IN_PERSON', 'ONLINE', 'HYBRID'])
  deliveryMode!: 'IN_PERSON' | 'ONLINE' | 'HYBRID';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique((trainer: SessionTrainerDto) => trainer.trainerId)
  @ValidateNested({ each: true })
  @Type(() => SessionTrainerDto)
  trainers?: SessionTrainerDto[];
}

export class RescheduleSessionDto {
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ArrayUnique((trainer: SessionTrainerDto) => trainer.trainerId)
  @ValidateNested({ each: true })
  @Type(() => SessionTrainerDto)
  trainers?: SessionTrainerDto[];
}

export class CancelSessionDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class CompleteSessionDto {
  @IsOptional()
  @IsString()
  @Length(3, 1000)
  note?: string;
}

export class ListSessionsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}
