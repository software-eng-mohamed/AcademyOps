import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Public } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { DevOnlyTotpService, type DevTotpResponse } from './dev-only-totp.service';

class DevTotpQueryDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  organizationCode!: string;

  @IsEmail()
  email!: string;
}

@ApiExcludeController()
@Public()
@Controller({ path: 'dev-only', version: '1' })
export class DevOnlyTotpController {
  constructor(private readonly totp: DevOnlyTotpService) {}

  @Get('totp')
  @RateLimit({ name: 'dev.totp', limit: 120, windowSeconds: 60 })
  currentCode(@Query() query: DevTotpQueryDto): Promise<DevTotpResponse> {
    return this.totp.currentCode(query.organizationCode, query.email);
  }
}
