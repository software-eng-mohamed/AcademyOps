import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess } from '../iam/authorization/decorators';
import { NotificationsService } from './notifications.service';
import { SearchService } from './search.service';
import { GlobalSearchDto, ListNotificationsDto, RecordRecentEntityDto } from './workspace.dto';

@ApiTags('workspace')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: GlobalSearchDto) {
    return this.search.search(access, query);
  }

  @HttpCode(204)
  @Post('recent')
  recordRecent(@CurrentAccess() access: AccessContext, @Body() input: RecordRecentEntityDto) {
    return this.search.recordRecent(access, input);
  }
}

@ApiTags('workspace')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListNotificationsDto) {
    return this.notifications.list(access, query);
  }

  @HttpCode(204)
  @Post('read-all')
  markAllRead(@CurrentAccess() access: AccessContext) {
    return this.notifications.markAllRead(access);
  }

  @HttpCode(204)
  @Post(':id/read')
  markRead(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.notifications.markRead(access, id);
  }
}
