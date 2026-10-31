import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
export class MatchStudentDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;
  @IsOptional()
  @IsEmail()
  email?: string;
  @IsOptional()
  @IsString()
  @Length(1, 80)
  legacyCode?: string;
}
export class ListStudentsDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED'])
  enrollmentState?: string;
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
export class CreateStudentDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  legacyCode?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  confirmDistinctFromPersonIds?: string[];
}
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsDateString()
  birthDate?: string;
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';
}
export class StudentContactDto {
  @IsIn(['PHONE', 'EMAIL'])
  type!: 'PHONE' | 'EMAIL';
  @IsString()
  @Length(3, 320)
  value!: string;
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
export class ReplaceStudentContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentContactDto)
  contacts!: StudentContactDto[];
}
export class MergeStudentDto {
  @IsUUID()
  targetPersonId!: string;
  @IsInt()
  @Min(1)
  targetVersion!: number;
  @IsString()
  @Length(10, 1000)
  reason!: string;
}
