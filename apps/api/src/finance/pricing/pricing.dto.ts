import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDecimal,
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

export class ListPricingAgreementsDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED'])
  status?: string;

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

export class PricingAgreementLineDto {
  @IsIn(['TUITION', 'REGISTRATION', 'MATERIALS', 'OTHER'])
  type!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  descriptionAr?: string;

  @IsString()
  @Length(1, 500)
  descriptionEn!: string;

  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  quantity!: string;

  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  unitAmount!: string;
}

export class CreatePricingAgreementDto {
  @IsUUID()
  enrollmentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PricingAgreementLineDto)
  lines!: PricingAgreementLineDto[];

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  discountAmount?: string;
}

export class UpdatePricingAgreementDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PricingAgreementLineDto)
  lines!: PricingAgreementLineDto[];

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  discountAmount?: string;
}

export class PricingDecisionDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class InstallmentDto {
  @IsDateString()
  dueDate!: string;

  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  amount!: string;
}

export class CreateInstallmentScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  installments!: InstallmentDto[];
}

export class UpdateInstallmentScheduleDto extends CreateInstallmentScheduleDto {}
