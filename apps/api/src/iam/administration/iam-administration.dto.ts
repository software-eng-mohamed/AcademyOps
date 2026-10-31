import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
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
import { accessScopes, permissions } from '@academyops/contracts';
export class ListAdministrationDto {
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
  limit = 25;
}
export class ListUsersDto extends ListAdministrationDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}
export class CreateBranchDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
}
export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class PermissionGrantDto {
  @IsIn(permissions)
  permissionCode!: (typeof permissions)[number];
  @IsIn(accessScopes)
  scope!: (typeof accessScopes)[number];
}
export class CreateRoleDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{1,49}$/)
  code!: string;
  @IsString()
  @Length(2, 200)
  name!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionGrantDto)
  grants!: PermissionGrantDto[];
}
export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
}
export class ReplaceRoleGrantsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionGrantDto)
  grants!: PermissionGrantDto[];
}
export class CreateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;
  @IsEmail()
  email!: string;
  @IsOptional()
  @IsString()
  @Length(2, 50)
  employeeCode?: string;
  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLocale?: 'ar' | 'en';
  @IsOptional()
  @IsString()
  @Length(12, 128)
  temporaryPassword?: string;
  @IsOptional()
  @IsBoolean()
  activateNow?: boolean;
  @IsOptional()
  @IsString()
  @Length(10, 1000)
  activationReason?: string;
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  roleIds!: string[];
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  branchIds!: string[];
}
export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
export class ReplaceAssignmentsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids!: string[];
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
