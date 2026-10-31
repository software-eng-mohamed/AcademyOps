import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess, RequirePermission } from '../../iam/authorization/decorators';
import { ListAuditEventsDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller({ path: 'audit-events', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermission('audit.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListAuditEventsDto) {
    return this.audit.list(access, query);
  }

  @RequirePermission('audit.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.audit.read(access, id);
  }
}
