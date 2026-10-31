'use client';
import { Field, Textarea } from '@academyops/ui';
import { field, textValue } from '@/api/academy/models';

import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

import { ManagementLookup } from './lookup-select';

import type { useManagementActionState } from './use-management-action-state';
export function ManagementActionFields({
  model,
}: {
  model: ReturnType<typeof useManagementActionState>;
}) {
  const { target, userId, locale, copy, t, values, errors, id, mutation, change, fields } = model;
  return (
    <>
      {fields.map((item) => (
        <div key={item.name} className="min-w-0">
          {item.type === 'lookup' && item.lookup ? (
            <ManagementLookup
              name={item.name}
              kind={item.lookup}
              values={values}
              onChange={(value, code) => change(item.name, value, code)}
              userId={userId}
              locale={locale}
              required={item.required ?? false}
              error={errors[item.name]}
              isDisabled={mutation.isPending}
              {...(item.name === 'roomId' && target.row
                ? { initialLabel: textValue(field(target.row.data, 'room.name')) }
                : {})}
            />
          ) : item.type === 'select' ? (
            <Field
              htmlFor={`${id}-${item.name}`}
              label={`${t(item.name)}${item.required ? ' *' : ''}`}
              error={errors[item.name]}
            >
              <Select
                aria-label={`${t(item.name)}${item.required ? ' *' : ''}`}
                triggerId={`${id}-${item.name}`}
                selectedKey={values[item.name] || '__none'}
                onSelectionChange={(key) =>
                  change(item.name, key === '__none' || key === null ? '' : String(key))
                }
                className="w-full"
                isDisabled={mutation.isPending}
                isInvalid={Boolean(errors[item.name])}
                {...(errors[item.name] ? { 'aria-describedby': `${id}-${item.name}-error` } : {})}
                placeholder={copy.choose}
              >
                <SelectItem id="__none" textValue={copy.choose}>
                  {copy.choose}
                </SelectItem>
                {item.options?.map((value) => (
                  <SelectItem key={value} id={value} textValue={t(value)}>
                    {t(value)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          ) : ['reason', 'note'].includes(item.name) ? (
            <Field
              htmlFor={`${id}-${item.name}`}
              label={`${t(item.name)}${item.required ? ' *' : ''}`}
              error={errors[item.name]}
            >
              <Textarea
                id={`${id}-${item.name}`}
                value={values[item.name] ?? ''}
                onChange={(event) => change(item.name, event.target.value)}
                disabled={mutation.isPending}
                placeholder={t(item.name)}
              />
            </Field>
          ) : (
            <Input
              id={`${id}-${item.name}`}
              label={`${t(item.name)}${item.type === 'datetime-local' ? ` · ${t('cairoTime')}` : ''}${item.required ? ' *' : ''}`}
              type={item.type === 'datetime-local' ? 'datetime-local' : 'text'}
              inputMode={
                ['amount', 'quantity', 'unitAmount', 'taxAmount', 'ordinal'].includes(item.name)
                  ? 'decimal'
                  : 'text'
              }
              value={values[item.name] ?? ''}
              onChange={(value) => change(item.name, value)}
              isDisabled={mutation.isPending}
              isInvalid={Boolean(errors[item.name])}
              hint={errors[item.name]}
              placeholder={t(item.name)}
            />
          )}
        </div>
      ))}
    </>
  );
}
