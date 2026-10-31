import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { directorySearchTypes, type SearchResult } from './search-contract';
import { SearchDirectoryQueryService } from './search-directory-query.service';
import { SearchFinanceQueryService } from './search-finance-query.service';
import { SearchScopeService } from './search-scope.service';
import type { SearchEntityType } from './workspace.dto';

@Injectable()
export class SearchQueryService {
  constructor(
    private readonly scope: SearchScopeService,
    private readonly directory: SearchDirectoryQueryService,
    private readonly finance: SearchFinanceQueryService,
  ) {}

  async searchType(
    access: AccessContext,
    type: SearchEntityType,
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const permission = this.scope.permission(type);
    if (!access.grants.has(permission)) return [];
    const branchIds = this.scope.branchIds(access, permission);
    if (directorySearchTypes.includes(type as (typeof directorySearchTypes)[number])) {
      return this.directory.search(access, type, query, limit, permission, branchIds);
    }
    return this.finance.search(access, type, query, limit, permission);
  }
}
