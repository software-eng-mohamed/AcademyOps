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

export class EnrollmentCertificateDto {
  @IsUUID()
  enrollmentId!: string;
}

export class CertificateReasonDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class ListCertificatesDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsIn(['ISSUED', 'REVOKED'])
  validityStatus?: 'ISSUED' | 'REVOKED';

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ListCertificateRulesDto {
  @IsOptional()
  @IsUUID()
  programVersionId?: string;

  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @IsOptional()
  @IsDateString()
  activeAt?: string;
}

export class CreateCertificateRuleDto {
  @IsUUID()
  programVersionId!: string;

  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.8)
  @Max(1)
  minimumRatio = 0.8;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
