import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDecimal,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsInt,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MonthRangeDto } from '../common/http/month-range.dto';

export class ListPaymentsDto extends MonthRangeDto {
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED'])
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

export class PaymentMethodMixDto extends MonthRangeDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class ListInstallmentsDto {
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

export class ListInvoicesDto {
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ISSUED', 'CANCELLED', 'VOIDED'])
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

export class ListEligibleInvoiceEntriesDto {
  @IsUUID()
  billingAccountId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ListReceiptsDto {
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

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

export class AgingReportDto {
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CreatePaymentDto {
  @IsUUID()
  billingAccountId!: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsUUID()
  methodId!: string;

  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  amount!: string;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  externalReference?: string;
}

export class FinancialReasonDto {
  @IsString()
  @Length(3, 1000)
  reason!: string;
}

export class CreateRefundRequestDto extends FinancialReasonDto {
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  amount!: string;
}

export class CreateInvoiceLineDto {
  @IsUUID()
  ledgerEntryId!: string;

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

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  taxAmount?: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  billingAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}

export class CreateCreditNoteDto extends FinancialReasonDto {
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  amount!: string;
}
