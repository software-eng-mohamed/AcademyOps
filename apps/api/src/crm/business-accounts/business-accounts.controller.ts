import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireVersion } from '../../common/http/headers';
import { CurrentAccess, RequirePermission } from '../../iam/authorization/decorators';
import {
  CreateBusinessAccountDto,
  ListBusinessAccountsDto,
  ListBusinessContactCandidatesDto,
  ReplaceBusinessAccountContactsDto,
  UpdateBusinessAccountDto,
} from './business-accounts.dto';
import { BusinessAccountsService } from './business-accounts.service';

@ApiTags('business-accounts')
@Controller({ path: 'business-accounts', version: '1' })
export class BusinessAccountsController {
  constructor(private readonly accounts: BusinessAccountsService) {}

  @RequirePermission('business_accounts.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListBusinessAccountsDto) {
    return this.accounts.list(access, query);
  }

  @RequirePermission('business_accounts.manage')
  @Get('contact-candidates')
  contactCandidates(
    @CurrentAccess() access: AccessContext,
    @Query() query: ListBusinessContactCandidatesDto,
  ) {
    return this.accounts.listContactCandidates(access, query);
  }

  @RequirePermission('business_accounts.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.accounts.read(access, id);
  }

  @RequirePermission('business_accounts.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateBusinessAccountDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.accounts.create(access, input, correlationId);
  }

  @RequirePermission('business_accounts.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateBusinessAccountDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.accounts.update(access, id, input, requireVersion(ifMatch), correlationId);
  }

  @RequirePermission('business_accounts.manage')
  @Put(':id/contacts')
  replaceContacts(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceBusinessAccountContactsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.accounts.replaceContacts(access, id, input, requireVersion(ifMatch), correlationId);
  }
}
