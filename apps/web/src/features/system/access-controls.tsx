'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getSystemPage, systemKey } from '@/api/system/queries';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';

export function AssignmentPicker({
  resource,
  selected,
  names,
  onChange,
  locale,
  userId,
}: {
  resource: 'roles' | 'branches';
  selected: string[];
  names: Record<string, string>;
  onChange: (ids: string[]) => void;
  locale: Locale;
  userId: string;
}) {
  const [search, setSearch] = useState('');
  const copy = getAcademyCopy(locale);
  const query = useInfiniteQuery({
    queryKey: [...systemKey(userId), 'assignments', resource, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getSystemPage(
        resource,
        {
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const availableNames = Object.fromEntries(rows.map((row) => [row.id, String(row.name)]));
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{systemText(locale, resource)}</legend>
      <Input
        type="search"
        aria-label={`${copy.search}: ${systemText(locale, resource)}`}
        placeholder={copy.searchPlaceholder}
        value={search}
        onChange={setSearch}
      />
      <div className="flex flex-wrap gap-2">
        {selected.map((id) => (
          <Button
            key={id}
            size="small"
            variant="secondary"
            onClick={() => onChange(selected.filter((item) => item !== id))}
            aria-label={`${systemText(locale, 'remove')}: ${availableNames[id] ?? names[id] ?? id}`}
          >
            {availableNames[id] ?? names[id] ?? id.slice(0, 8)} ×
          </Button>
        ))}
      </div>
      {query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : (
        <div className="grid max-h-52 gap-3 overflow-y-auto p-1">
          {rows.length ? (
            rows.map((row) => (
              <Checkbox
                key={row.id}
                isSelected={selected.includes(row.id)}
                isDisabled={
                  resource === 'branches' && row.isActive === false && !selected.includes(row.id)
                }
                onChange={(checked) =>
                  onChange(checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                }
              >
                {String(row.name)}{' '}
                <span className="text-xs text-ink-muted">({String(row.code)})</span>
              </Checkbox>
            ))
          ) : (
            <p className="text-sm text-ink-muted">{copy.noResults}</p>
          )}
        </div>
      )}
      {query.hasNextPage ? (
        <Button
          variant="ghost"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {systemText(locale, 'loadMore')}
        </Button>
      ) : null}
    </fieldset>
  );
}

export { GrantEditor, RoleGrantsEditor } from './role-grants-editor';
