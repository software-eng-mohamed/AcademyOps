import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { PlatformModule } from '../platform/platform.module';
import { NotificationsService } from './notifications.service';
import { SearchDirectoryQueryService } from './search-directory-query.service';
import { SearchDirectoryResolverService } from './search-directory-resolver.service';
import { SearchFinanceQueryService } from './search-finance-query.service';
import { SearchFinanceResolverService } from './search-finance-resolver.service';
import { SearchQueryService } from './search-query.service';
import { SearchRecentService } from './search-recent.service';
import { SearchResolverService } from './search-resolver.service';
import { SearchScopeService } from './search-scope.service';
import { SearchService } from './search.service';
import { NotificationsController, SearchController } from './workspace.controller';

@Module({
  imports: [PlatformModule, FinanceModule],
  controllers: [SearchController, NotificationsController],
  providers: [
    SearchService,
    SearchQueryService,
    SearchDirectoryQueryService,
    SearchFinanceQueryService,
    SearchRecentService,
    SearchResolverService,
    SearchDirectoryResolverService,
    SearchFinanceResolverService,
    SearchScopeService,
    NotificationsService,
  ],
})
export class WorkspaceModule {}
