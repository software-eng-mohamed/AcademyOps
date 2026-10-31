import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
export class RegisterStudentDto {
  @ApiProperty({ example: 'ACADEMYOPS' })
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;
  @ApiProperty({ example: 'Ahmed Ali' })
  @IsString()
  @Length(2, 200)
  @Matches(/^[^\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]+$/u)
  name!: string;
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  email!: string;
  @ApiProperty({ example: '01012345678' })
  @IsString()
  @Length(5, 40)
  phone!: string;
  @ApiProperty({ example: 'password12345' })
  @IsString()
  @Length(12, 100)
  password!: string;
  @ApiProperty({ example: 'ar', required: false, enum: ['ar', 'en'], default: 'ar' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLocale?: 'ar' | 'en';
}
export class RegistrationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';
}
export class ListStudentRegistrationsQueryDto {
  @ApiProperty({ required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
export class StudentRegistrationDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;
  @ApiProperty({ format: 'uuid' })
  personId!: string;
  @ApiProperty({ format: 'uuid' })
  userId!: string;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ format: 'date-time' })
  submittedAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true })
  reviewedAt!: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  reviewedByUserId!: string | null;
  @ApiProperty({ nullable: true })
  rejectionReason!: string | null;
  @ApiProperty()
  version!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
  @ApiProperty({ nullable: true })
  name!: string | null;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  phone!: string;
  @ApiProperty({ nullable: true })
  preferredLocale!: string | null;
}
export class StudentRegistrationsPageDto {
  @ApiProperty({ type: [StudentRegistrationDetailDto] })
  items!: StudentRegistrationDetailDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  pages!: number;
}
export class ApproveStudentRegistrationDto {
  @ApiProperty({ enum: ['IN_PERSON_EMAIL_OWNERSHIP'] })
  @IsIn(['IN_PERSON_EMAIL_OWNERSHIP'])
  verificationMethod!: 'IN_PERSON_EMAIL_OWNERSHIP';
  @ApiProperty({
    description: 'Opaque reference to the offline proof record; never include identity numbers.',
    example: 'AO-PROOF-2026-000123',
  })
  @IsString()
  @Length(10, 80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/#-]{9,79}$/)
  verificationReference!: string;
}
export class RejectStudentRegistrationDto {
  @ApiProperty({ example: 'Incomplete contact details or invalid name.' })
  @IsString()
  @Length(5, 500)
  reason!: string;
}
