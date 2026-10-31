'use client';

import { Field } from '@academyops/ui';
import { useId } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Select, SelectItem } from '@/components/base/select/select';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import { ManagementLookup } from './lookup-select';
import { type SessionTrainer, sessionTrainers } from './session-trainer-values';
export function SessionTrainersEditor({
  value,
  onChange,
  locale,
  userId,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  userId: string;
  error?: string;
}) {
  const id = useId();
  const t = (key: string) => managementText(locale, key);
  const items = sessionTrainers(value);
  const update = (index: number, changes: Partial<SessionTrainer>) =>
    onChange(
      JSON.stringify(items.map((item, i) => (i === index ? { ...item, ...changes } : item))),
    );
  return (
    <div className="grid min-w-0 gap-4">
      <h3 className="font-semibold">{t('sessionTrainers')}</h3>
      <p className="text-sm text-ink-muted">{t('sessionTrainersHint')}</p>
      {items.map((item, index) => (
        <div
          key={item.uiKey ?? item.trainerId}
          className="grid min-w-0 gap-3 rounded-xl border border-border p-4"
        >
          <ManagementLookup
            controlId={`${id}-trainer-${index}`}
            name="trainerId"
            kind="trainers"
            values={{ trainerId: item.trainerId }}
            onChange={(trainerId) => update(index, { trainerId })}
            userId={userId}
            locale={locale}
            required
            {...(item.label ? { initialLabel: item.label } : {})}
          />
          <Field htmlFor={`${id}-role-${index}`} label={t('trainerRole')}>
            <Select
              triggerId={`${id}-role-${index}`}
              aria-label={t('trainerRole')}
              selectedKey={item.role}
              renderValue={t(item.role)}
              onSelectionChange={(role) =>
                update(index, { role: role === 'ASSISTANT' ? 'ASSISTANT' : 'PRIMARY' })
              }
            >
              <SelectItem id="PRIMARY" textValue={t('PRIMARY')}>
                {t('PRIMARY')}
              </SelectItem>
              <SelectItem id="ASSISTANT" textValue={t('ASSISTANT')}>
                {t('ASSISTANT')}
              </SelectItem>
            </Select>
          </Field>
          <Button
            variant="secondary"
            onClick={() => onChange(JSON.stringify(items.filter((_, i) => i !== index)))}
          >
            {t('removeTrainer')}
          </Button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={items.length >= 25}
        onClick={() =>
          onChange(
            JSON.stringify([
              ...items,
              {
                trainerId: '',
                uiKey: crypto.randomUUID(),
                role: items.some((item) => item.role === 'PRIMARY') ? 'ASSISTANT' : 'PRIMARY',
              },
            ]),
          )
        }
      >
        {t('addTrainer')}
      </Button>
    </div>
  );
}
