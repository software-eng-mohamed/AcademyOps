'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { field, records, textValue } from '@/api/academy/models';
import type { BusinessAccountContactDto } from '@/api/generated/models/businessAccountContactDto';
import { findBusinessContacts, replaceBusinessContacts } from '@/api/management/contacts';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { SystemCommandDialog } from '@/features/system/command-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import type { ManagementRow } from './config';

export function ContactsDialog({
  row,
  locale,
  userId,
  onClose,
}: {
  row: ManagementRow;
  locale: Locale;
  userId: string;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Array<BusinessAccountContactDto & { name: string }>>(
    () =>
      records(row.data.contacts).map((entry) => ({
        personId: textValue(entry.personId),
        name: textValue(field(entry, 'person.name')),
        role: textValue(entry.role),
        isPrimary: entry.isPrimary === true,
      })),
  );
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const client = useQueryClient();
  const copy = getAcademyCopy(locale);
  const t = (key: string) => managementText(locale, key);
  const branchId = textValue(row.data.owningBranchId);
  const query = useQuery({
    queryKey: [...managementKey(userId), 'contactCandidates', branchId, search],
    queryFn: ({ signal }) => findBusinessContacts(branchId, search, signal),
    enabled: search.length >= 2 && Boolean(branchId),
  });
  return (
    <SystemCommandDialog
      title={t('editContacts')}
      description={t('contactsHint')}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({ id: row.id, version: row.version, contacts })}
      submit={(key) =>
        replaceBusinessContacts(
          row.id,
          row.version,
          contacts.map(({ personId, role, isPrimary }) => ({
            personId,
            ...(role?.trim() ? { role: role.trim() } : {}),
            isPrimary: isPrimary ?? false,
          })),
          key,
        )
      }
      validate={() =>
        contacts.every(
          (contact) =>
            !contact.role || (contact.role.trim().length >= 2 && contact.role.trim().length <= 80),
        )
      }
      onClose={onClose}
      onSaved={async () => {
        await client.invalidateQueries({ queryKey: managementKey(userId) });
      }}
    >
      <div className="flex items-end gap-2">
        <Input label={t('findContact')} value={input} onChange={setInput} maxLength={200} />
        <Button
          variant="secondary"
          disabled={input.trim().length < 2}
          onClick={() => setSearch(input.trim())}
        >
          {copy.search}
        </Button>
      </div>
      {query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : query.isFetching ? (
        <p role="status">{copy.loading}</p>
      ) : query.data ? (
        <div className="grid max-h-40 gap-2 overflow-y-auto">
          {query.data.items.map((candidate) => (
            <Button
              key={candidate.personId}
              variant="secondary"
              disabled={contacts.some((contact) => contact.personId === candidate.personId)}
              onClick={() =>
                setContacts((old) => [
                  ...old,
                  {
                    personId: candidate.personId,
                    name: candidate.name ?? candidate.publicId,
                    role: '',
                    isPrimary: old.length === 0,
                  },
                ])
              }
            >
              {candidate.name ?? candidate.publicId}
            </Button>
          ))}
          {!query.data.items.length ? (
            <p className="text-sm text-ink-muted">{copy.noResults}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4">
        {contacts.map((contact, index) => (
          <div key={contact.personId} className="grid gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{contact.name}</h3>
              <Button
                variant="ghost"
                size="small"
                onClick={() => setContacts((old) => old.filter((_, i) => i !== index))}
              >
                {t('removeContact')}
              </Button>
            </div>
            <Input
              label={t('contactRole')}
              value={contact.role ?? ''}
              maxLength={80}
              onChange={(role) =>
                setContacts((old) =>
                  old.map((entry, i) => (i === index ? { ...entry, role } : entry)),
                )
              }
            />
            <Checkbox
              isSelected={contact.isPrimary ?? false}
              onChange={(selected) =>
                setContacts((old) =>
                  old.map((entry, i) => ({ ...entry, isPrimary: selected && i === index })),
                )
              }
            >
              {t('isPrimary')}
            </Checkbox>
          </div>
        ))}
      </div>
    </SystemCommandDialog>
  );
}
