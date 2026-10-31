import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class EnrollTotpDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;
}

export class VerifyTotpDto {
  @Matches(/^\d{6}$/)
  code!: string;
}
