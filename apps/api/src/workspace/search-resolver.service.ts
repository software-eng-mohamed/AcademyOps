import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { directorySearchTypes, type SearchResult } from './search-contract';
import { SearchDirectoryResolverService } from './search-directory-resolver.service';
import { SearchFinanceResolverService } from './search-finance-resolver.service';
import { SearchScopeService } from './search-scope.service';
import type { SearchEntityType } from './workspace.dto';

@Injectable()
export class SearchResolverService {
  constructor(
    private readonly scope: SearchScopeService,
    private readonly directory: SearchDirectoryResolverService,
    private readonly finance: SearchFinanceResolverService,
  ) {}

  async resolve(
    access: AccessContext,
    type: SearchEntityType,
    id: string,
  ): Promise<SearchResult | null> {
    const permission = this.scope.permission(type);
    if (!access.grants.has(permission)) return null;
    const branchIds = this.scope.branchIds(access, permission);
    if (directorySearchTypes.includes(type as (typeof directorySearchTypes)[number])) {
      return this.directory.resolve(access, type, id, permission, branchIds);
    }
    return this.finance.resolve(access, type, id, permission);
  }
}
