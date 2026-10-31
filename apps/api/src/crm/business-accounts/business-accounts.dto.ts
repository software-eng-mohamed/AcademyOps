import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

export class ListBusinessAccountsDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

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

export class ListBusinessContactCandidatesDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @Length(2, 200)
  search!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit = 20;
}

export class BusinessAccountContactDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  role?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateBusinessAccountDto {
  @IsUUID()
  owningBranchId!: string;

  @IsString()
  @Length(2, 300)
  legalName!: string;

  @IsString()
  @Length(2, 300)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  registrationNo?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  taxId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessAccountContactDto)
  contacts?: BusinessAccountContactDto[];
}

export class UpdateBusinessAccountDto {
  @IsOptional()
  @IsString()
  @Length(2, 300)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 300)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  registrationNo?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  taxId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';
}

export class ReplaceBusinessAccountContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessAccountContactDto)
  contacts!: BusinessAccountContactDto[];
}
