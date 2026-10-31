import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class ListEnrollmentsDto {
  @IsOptional()
  @IsUUID()
  studentPersonId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  programVersionId?: string;

  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED'])
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

export class CreateEnrollmentDto {
  @IsUUID()
  studentPersonId!: string;

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

export class EnrollmentReasonDto {
  @IsString()
  @Length(2, 1000)
  reason!: string;
}

export class TransferEnrollmentDto extends EnrollmentReasonDto {
  @IsUUID()
  targetCohortId!: string;
}

export class ActivateEnrollmentDto {
  @IsOptional()
  @IsString()
  @Length(2, 1000)
  note?: string;
}

export class CreateModuleRetakeDto extends EnrollmentReasonDto {
  @IsUUID()
  programVersionModuleId!: string;

  @IsOptional()
  @IsUUID()
  targetCohortModuleId?: string;
}
