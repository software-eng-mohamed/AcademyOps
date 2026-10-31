import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export class LeadReasonDto {
  @IsString()
  @Length(2, 1000)
  reason!: string;
}
export class NewLeadPersonDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;
  @IsOptional()
  @IsString()
  @Length(3, 320)
  email?: string;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  confirmDistinctFromPersonIds?: string[];
}
export class ListLeadsDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
  @IsOptional()
  @IsUUID()
  stageId?: string;
  @IsOptional()
  @IsIn(['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'])
  state?: string;
  @IsOptional()
  @IsUUID()
  cursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
export class ListLeadAssigneesDto {
  @IsUUID()
  branchId!: string;
  @IsOptional()
  @IsString()
  @Length(2, 200)
  search?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
export class CreateLeadDto {
  @IsUUID()
  branchId!: string;
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
  @IsOptional()
  @IsUUID()
  personId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => NewLeadPersonDto)
  newPerson?: NewLeadPersonDto;
  @IsOptional()
  @IsUUID()
  stageId?: string;
  @IsOptional()
  @IsString()
  @Length(2, 80)
  source?: string;
  @IsOptional()
  @IsDateString()
  nextActionAt?: string;
}
export class UpdateLeadDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;
  @IsOptional()
  @IsString()
  @Length(2, 80)
  source?: string;
  @IsOptional()
  @IsDateString()
  nextActionAt?: string;
}
export class AssignLeadDto {
  @IsUUID()
  userId!: string;
}
export class CreateLeadActivityDto {
  @IsIn(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'])
  type!: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'NOTE';
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
export class WinLeadDto {
  @IsOptional()
  @IsUUID()
  personId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => NewLeadPersonDto)
  newPerson?: NewLeadPersonDto;
  @IsUUID()
  programVersionId!: string;
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;
  @IsUUID()
  homeBranchId!: string;
  @IsUUID()
  cohortId!: string;
  @IsIn(['INDIVIDUAL', 'CORPORATE'])
  kind!: 'INDIVIDUAL' | 'CORPORATE';
}
export class ListLeadStagesDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInactive: boolean = false;
}
export class CreateLeadStageDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
  @IsInt()
  @Min(1)
  ordinal!: number;
}
export class UpdateLeadStageDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  ordinal?: number;
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
