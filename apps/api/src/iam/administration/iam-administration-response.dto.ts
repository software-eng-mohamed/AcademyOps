import { ApiProperty } from '@nestjs/swagger';
import {
  type AccessScope,
  type PermissionCode,
  accessScopes,
  permissions,
} from '@academyops/contracts';
export class BranchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty()
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
export class BranchesPageDto {
  @ApiProperty({ type: [BranchDto] })
  items!: BranchDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
export class RoleGrantDto {
  @ApiProperty({ enum: permissions })
  permissionCode!: PermissionCode;
  @ApiProperty({ enum: accessScopes })
  scope!: AccessScope;
}
export class RoleWithGrantsDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  isSystem!: boolean;
  @ApiProperty()
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
  @ApiProperty({ type: [RoleGrantDto] })
  grants!: RoleGrantDto[];
}
export class RoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  isSystem!: boolean;
  @ApiProperty()
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
export class RolesPageDto {
  @ApiProperty({ type: [RoleWithGrantsDto] })
  items!: RoleWithGrantsDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
export class ReplaceGrantsResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  version!: number;
  @ApiProperty({ type: [RoleGrantDto] })
  grants!: RoleGrantDto[];
}
export class UserIdentifierDto {
  @ApiProperty({ enum: ['EMAIL', 'PHONE'] })
  type!: 'EMAIL' | 'PHONE';
  @ApiProperty()
  normalizedValue!: string;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time' })
  verifiedAt!: Date | null;
}
export class UserSummaryRoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
}
export class UserSummaryBranchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  isActive!: boolean;
}
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  publicId!: string;
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED'] })
  status!: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  @ApiProperty({ enum: ['ar', 'en'], nullable: true })
  preferredLocale!: 'ar' | 'en' | null;
  @ApiProperty()
  mustChangePassword!: boolean;
  @ApiProperty()
  version!: number;
  @ApiProperty({ type: String, nullable: true })
  employeeCode!: string | null;
  @ApiProperty({ type: [UserIdentifierDto] })
  identifiers!: UserIdentifierDto[];
  @ApiProperty({ type: [UserSummaryRoleDto] })
  roles!: UserSummaryRoleDto[];
  @ApiProperty({ type: [UserSummaryBranchDto] })
  branches!: UserSummaryBranchDto[];
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
export class UsersPageDto {
  @ApiProperty({ type: [UserSummaryDto] })
  items!: UserSummaryDto[];
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
