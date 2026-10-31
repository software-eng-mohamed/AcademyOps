'use client';
import { Field, Textarea } from '@academyops/ui';
import { record, textValue } from '@/api/academy/models';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { academyLabel } from '@/i18n/academy-copy';
import styles from './academy-form-styles';
import { RemoteSelect } from './remote-select';

import type { AcademyActionModel } from './use-academy-action';

export function AcademyActionFields({ model }: { model: AcademyActionModel }) {
  const { target, userId, branchId, copy, formId, values, errors, mutation, fields, setValue } =
    model;
  return (
    <>
      {fields.length ? (
        <div className={styles.formFields} data-columns={fields.length >= 4 ? 2 : 1}>
          {fields.map((item) => {
            const label = `${academyLabel(copy, item.label ?? item.key)}${item.kind === 'datetime-local' ? ` · ${copy.cairoTime}` : ''}${item.optional ? '' : ' *'}`;
            const id = `${formId}-${item.key}`;
            if (item.key === 'billingAccountId' && values.kind !== 'CORPORATE') return null;
            if (item.kind === 'lookup' && item.lookup)
              return (
                <RemoteSelect
                  key={item.key}
                  id={id}
                  label={label}
                  kind={item.lookup}
                  value={values[item.key] ?? ''}
                  onChange={(value) => setValue(item.key, value)}
                  copy={copy}
                  userId={userId}
                  disabled={
                    mutation.isPending ||
                    (item.lookup === 'publishedVersions' && !values.programId) ||
                    (item.lookup === 'cohortModules' &&
                      (!values.retakeCohortId || !values.programVersionModuleId))
                  }
                  error={errors[item.key]}
                  initialLabel={
                    textValue(target.row?.data[`${item.key}Label`]) ||
                    (item.key === 'stageId'
                      ? textValue(record(target.row?.data.stage).name)
                      : '') ||
                    undefined
                  }
                  context={{
                    ...(branchId ? { branchId } : {}),
                    ...(values.programId ? { programId: values.programId } : {}),
                    ...(values.retakeCohortId ? { cohortId: values.retakeCohortId } : {}),
                    ...(values.programVersionModuleId
                      ? { programVersionModuleId: values.programVersionModuleId }
                      : {}),
                    ...(target.row?.data.programVersionId
                      ? { programVersionId: textValue(target.row.data.programVersionId) }
                      : {}),
                    ...(item.key === 'targetPersonId' && target.row
                      ? { excludeId: target.row.id }
                      : {}),
                  }}
                />
              );
            if (item.kind === 'select')
              return (
                <Field key={item.key} htmlFor={id} label={label} error={errors[item.key]}>
                  <Select
                    triggerId={id}
                    selectedKey={values[item.key] || '__none'}
                    isDisabled={mutation.isPending}
                    isInvalid={Boolean(errors[item.key])}
                    aria-label={label}
                    {...(errors[item.key] ? { 'aria-describedby': `${id}-error` } : {})}
                    className="w-full"
                    placeholder={copy.choose}
                    onSelectionChange={(value) =>
                      setValue(item.key, value === '__none' || value === null ? '' : String(value))
                    }
                  >
                    <SelectItem id="__none" textValue={copy.choose}>
                      {copy.choose}
                    </SelectItem>
                    {(item.choices ?? []).map((value) => (
                      <SelectItem key={value} id={value} textValue={academyLabel(copy, value)}>
                        {academyLabel(copy, value)}
                      </SelectItem>
                    ))}
                  </Select>
                </Field>
              );
            if (item.kind === 'textarea')
              return (
                <Field key={item.key} htmlFor={id} label={label} error={errors[item.key]}>
                  <Textarea
                    id={id}
                    value={values[item.key] ?? ''}
                    onChange={(event) => setValue(item.key, event.target.value)}
                    disabled={mutation.isPending}
                    placeholder={academyLabel(copy, item.label ?? item.key)}
                    maxLength={item.max}
                  />
                </Field>
              );
            return (
              <Input
                key={item.key}
                id={id}
                label={label}
                name={item.key}
                type={item.kind === 'phone' ? 'tel' : (item.kind ?? 'text')}
                value={values[item.key] ?? ''}
                onChange={(value) => setValue(item.key, value)}
                isDisabled={mutation.isPending}
                isInvalid={Boolean(errors[item.key])}
                hint={errors[item.key]}
                placeholder={academyLabel(copy, item.label ?? item.key)}
                inputClassName={
                  ['email', 'phone', 'code'].includes(item.key)
                    ? 'text-left [direction:ltr]'
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}
