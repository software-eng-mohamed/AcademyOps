import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export { CalendarQueryDto } from './catalog-calendar.dto';
export class ListCatalogDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
  @IsOptional()
  @IsUUID()
  cursor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
  @IsOptional()
  @IsString()
  @Length(2, 30)
  status?: string;
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
export class CreateProgramDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
}
export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';
}
export class CurriculumModuleDto {
  @IsUUID()
  moduleId!: string;
  @IsInt()
  @Min(1)
  ordinal!: number;
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
export class CreateProgramVersionDto {
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumModuleDto)
  modules!: CurriculumModuleDto[];
}
export class ReplaceCurriculumDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurriculumModuleDto)
  modules!: CurriculumModuleDto[];
}
export class PublishProgramVersionDto {
  @IsDateString()
  effectiveFrom!: string;
}
export class ReasonDto {
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
export class CreateAcademicModuleDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
}
export class UpdateAcademicModuleDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class CreateCohortDto {
  @IsUUID()
  programVersionId!: string;
  @IsUUID()
  owningBranchId!: string;
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_/-]{1,79}$/)
  code!: string;
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsDateString()
  startsOn?: string;
  @IsOptional()
  @IsDateString()
  endsOn?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
export class UpdateCohortDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsDateString()
  startsOn?: string;
  @IsOptional()
  @IsDateString()
  endsOn?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
export class CreateRoomDto {
  @IsUUID()
  branchId!: string;
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class CreateTrainerDto {
  @IsOptional()
  @IsUUID()
  personId?: string;
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsString()
  @Length(2, 2000)
  biographyAr?: string;
  @IsOptional()
  @IsString()
  @Length(2, 2000)
  biographyEn?: string;
}
export class UpdateTrainerDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional()
  @IsString()
  @Length(2, 2000)
  biographyAr?: string;
  @IsOptional()
  @IsString()
  @Length(2, 2000)
  biographyEn?: string;
}
