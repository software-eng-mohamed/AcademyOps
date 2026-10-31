import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export const searchEntityTypes = [
  'STUDENT',
  'LEAD',
  'PAYMENT',
  'INVOICE',
  'RECEIPT',
  'COHORT',
  'SESSION',
  'CERTIFICATE',
  'BUSINESS_ACCOUNT',
] as const;

export type SearchEntityType = (typeof searchEntityTypes)[number];

export class GlobalSearchDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  q?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  types?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 20;
}

export class RecordRecentEntityDto {
  @IsIn(searchEntityTypes)
  entityType!: SearchEntityType;

  @IsUUID()
  entityId!: string;
}

export class ListNotificationsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 15;
}
