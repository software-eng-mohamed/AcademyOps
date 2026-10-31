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
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowDown2, TickCircle } from 'iconsax-react';
import { useEffect, useRef, useState } from 'react';
import { getManagementLookup } from '@/api/management/lookups';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-form-styles';
import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import type { FormValues, LookupType } from './actions';

function Chevron({ className }: { className?: string }) {
  return <ArrowDown2 aria-hidden color="currentColor" className={className} />;
}
export function ManagementLookup({
  name,
  kind,
  values,
  onChange,
  userId,
  locale,
  required = false,
  initialLabel,
  error,
  isDisabled = false,
  controlId,
}: {
  name: string;
  kind: LookupType;
  values: FormValues;
  onChange: (value: string, code?: string) => void;
  userId: string;
  locale: Locale;
  required?: boolean;
  initialLabel?: string;
  error?: string | undefined;
  isDisabled?: boolean;
  controlId?: string;
}) {
  const copy = getAcademyCopy(locale);
  const id = controlId ?? `management-${name}`;
  const initialValue = useRef(values[name]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<{ value: string; label: string }>();
  const context = {
    studentId: values.studentId ?? '',
    enrollmentId: values.enrollmentId ?? '',
    accountType: values.accountType ?? '',
    businessAccountId: values.businessAccountId ?? '',
    cohortId: values.cohortId ?? '',
  };
  const disabled =
    kind === 'enrollments'
      ? !values.studentId
      : kind === 'cohortModules'
        ? !values.cohortId
        : kind === 'ledgerEntries'
          ? !(values.accountType === 'BUSINESS' ? values.businessAccountId : values.enrollmentId)
          : false;
  const canSearch = ['students', 'cohorts', 'rooms', 'trainers', 'businessAccounts'].includes(kind);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: [...managementKey(userId), 'lookup', kind, context, debounced],
    queryFn: ({ pageParam, signal }) =>
      getManagementLookup(kind, debounced, pageParam, context, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open && !disabled,
  });
  const options = (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) =>
    'startsAt' in item && typeof item.startsAt === 'string'
      ? {
          ...item,
          label: `${item.label} · ${formatAcademyDateTime(item.startsAt, locale, copy.none)}`,
        }
      : item,
  );
  const value = values[name] ?? '';
  const label =
    options.find((item) => item.value === value)?.label ||
    (selected?.value === value ? selected.label : undefined) ||
    (value === initialValue.current ? initialLabel : undefined) ||
    copy.choose;
  return (
    <Field
      htmlFor={id}
      label={`${managementText(locale, name)}${required ? ' *' : ''}`}
      error={error}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            className={styles.selectTrigger}
            trailingIcon={Chevron}
            role="combobox"
            aria-expanded={open}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            disabled={disabled || isDisabled}
          >
            <span className="truncate">{value ? label : copy.choose}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={styles.lookup}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <Command shouldFilter={false}>
            {canSearch ? (
              <CommandInput
                aria-label={copy.search}
                placeholder={copy.lookupSearch}
                value={search}
                onValueChange={setSearch}
              />
            ) : null}
            <CommandList>
              <CommandItem
                value="__clear"
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {copy.none}
              </CommandItem>
              {options.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => {
                    setSelected(item);
                    onChange(
                      item.value,
                      'code' in item && typeof item.code === 'string' ? item.code : undefined,
                    );
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {value === item.value ? (
                    <TickCircle aria-hidden color="currentColor" size={16} variant="Bulk" />
                  ) : null}
                </CommandItem>
              ))}
              {query.isFetching ? (
                <p role="status" className="p-3 text-xs">
                  {copy.loadingOptions}
                </p>
              ) : !options.length && !query.isError ? (
                <p className="p-3 text-xs">{copy.noResults}</p>
              ) : null}
            </CommandList>
          </Command>
          {query.isError ? (
            <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
          ) : null}
          {query.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {copy.more}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      {disabled ? (
        <p className="text-xs text-ink-muted">{managementText(locale, 'chooseParent')}</p>
      ) : null}
    </Field>
  );
}
