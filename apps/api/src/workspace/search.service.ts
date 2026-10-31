import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import type { SearchResult } from './search-contract';
import { SearchQueryService } from './search-query.service';
import { SearchRecentService } from './search-recent.service';
import {
  searchEntityTypes,
  type GlobalSearchDto,
  type RecordRecentEntityDto,
  type SearchEntityType,
} from './workspace.dto';

export type { SearchResult } from './search-contract';

@Injectable()
export class SearchService {
  constructor(
    private readonly queries: SearchQueryService,
    private readonly recents: SearchRecentService,
  ) {}

  async search(access: AccessContext, input: GlobalSearchDto) {
    const requested = input.types
      ? input.types
          .split(',')
          .map((value) => value.trim().toUpperCase())
          .filter((value): value is SearchEntityType =>
            searchEntityTypes.includes(value as SearchEntityType),
          )
      : [...searchEntityTypes];
    const recent = await this.recents.recent(access);
    if (!input.q) return { query: null, items: [] as SearchResult[], recent };
    const query = input.q.trim();
    const batches = await Promise.all(
      requested.map((type) => this.queries.searchType(access, type, query, input.limit)),
    );
    return { query, items: batches.flat().slice(0, input.limit), recent };
  }

  recordRecent(access: AccessContext, input: RecordRecentEntityDto): Promise<void> {
    return this.recents.record(access, input);
  }
}
