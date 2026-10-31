import { IsOptional, Matches } from 'class-validator';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MonthRangeDto {
  @IsOptional()
  @Matches(MONTH_KEY)
  fromMonth?: string;

  @IsOptional()
  @Matches(MONTH_KEY)
  toMonth?: string;
}
