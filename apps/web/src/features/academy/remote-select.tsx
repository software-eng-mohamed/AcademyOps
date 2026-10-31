'use client';

import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  Field,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@academyops/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown2, TickCircle } from 'iconsax-react';
import { useEffect, useState } from 'react';
import { getLookupPage, type LookupContext } from '@/api/academy/lookups';
import { academyKey, getAcademyDetail } from '@/api/academy/queries';
import { Button } from '@/components/base/buttons/button';
import { type AcademyCopy, academyLabel } from '@/i18n/academy-copy';
import styles from './academy-form-styles';
import type { LookupKind } from './actions';

function SelectChevron({ className }: { className?: string }) {
  return <ArrowDown2 aria-hidden color="currentColor" className={className} />;
}

export function RemoteSelect({
  id,
  label,
  kind,
  value,
  onChange,
  copy,
  userId,
  context = {},
  error,
  initialLabel,
  disabled = false,
}: {
  id: string;
  label: string;
  kind: LookupKind;
  value: string;
  onChange: (value: string) => void;
  copy: AcademyCopy;
  userId: string;
  context?: LookupContext;
  error?: string | undefined;
  initialLabel?: string | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<{ value: string; label: string }>();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: [...academyKey(userId), 'lookup', kind, debounced, context],
    queryFn: ({ pageParam, signal }) => getLookupPage(kind, debounced, pageParam, context, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open && !disabled,
  });
  const options = query.data?.pages.flatMap((page) => page.items) ?? [];
  const current = options.find((item) => item.value === value);
  const selectedStudent = useQuery({
    queryKey: [...academyKey(userId), 'lookup-selected-student', value],
    queryFn: ({ signal }) =>
      getAcademyDetail(
        'students',
        { id: value, name: '', code: '', status: '', version: 0, data: {} },
        signal,
      ),
    enabled:
      kind === 'students' &&
      Boolean(value) &&
      !current &&
      selected?.value !== value &&
      !initialLabel,
    staleTime: 60_000,
  });
  const currentLabel =
    (current
      ? `${current.label}${current.version ? ` · ${copy.versionLabel.replace('{version}', current.version)}` : ''}`
      : undefined) ||
    (selected?.value === value ? selected.label : undefined) ||
    initialLabel ||
    selectedStudent.data?.name;
  return (
    <Field htmlFor={id} label={label} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            disabled={disabled}
            className={styles.selectTrigger}
            trailingIcon={SelectChevron}
          >
            <span className="truncate">{value ? currentLabel || copy.choose : copy.choose}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={styles.lookup}>
          <Command shouldFilter={false}>
            <CommandInput
              aria-label={copy.search}
              placeholder={copy.lookupSearch}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandItem
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
                value="__clear"
              >
                {copy.none}
              </CommandItem>
              {options.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => {
                    setSelected({
                      value: item.value,
                      label: `${item.label}${item.version ? ` · ${copy.versionLabel.replace('{version}', item.version)}` : ''}`,
                    });
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.label}
                    {item.version
                      ? ` · ${copy.versionLabel.replace('{version}', item.version)}`
                      : ''}
                  </span>
                  {item.status ? (
                    <span className="text-xs text-text-tertiary">
                      {academyLabel(copy, item.status)}
                    </span>
                  ) : null}
                  {value === item.value ? (
                    <TickCircle aria-hidden color="currentColor" size={16} variant="Bulk" />
                  ) : null}
                </CommandItem>
              ))}
              {query.isFetching ? (
                <p className="p-3 text-xs" role="status">
                  {copy.loadingOptions}
                </p>
              ) : null}
              {!query.isFetching && !query.isError && !options.length ? (
                <p className="p-3 text-xs">{copy.noResults}</p>
              ) : null}
            </CommandList>
          </Command>
          {query.isError ? (
            <Button variant="ghost" type="button" onClick={() => void query.refetch()}>
              {copy.retry}
            </Button>
          ) : null}
          {query.hasNextPage ? (
            <Button
              variant="ghost"
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {copy.more}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </Field>
  );
}
