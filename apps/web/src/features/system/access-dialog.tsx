'use client';

import { Field, Textarea } from '@academyops/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { record, textValue } from '@/api/academy/models';
import { getAcademyContext } from '@/api/academy/queries';
import type { PermissionGrantDto } from '@/api/generated/models/permissionGrantDto';
import {
  type AccessAction,
  type AccessValues,
  accessErrors,
  executeAccessAction,
} from '@/api/system/commands';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import { AssignmentPicker, GrantEditor } from './access-controls';
import { SystemCommandDialog } from './command-dialog';
import type { SystemRecord } from './config';
import { SystemSelect } from './system-ui';

export function initialAccessValues(item?: SystemRecord): AccessValues {
  const ids = (name: string) =>
    Array.isArray(item?.[name])
      ? item[name].map((entry) => textValue(record(entry).id)).filter(Boolean)
      : [];
  return {
    name: textValue(item?.name),
    code: textValue(item?.code),
    email: '',
    employeeCode: textValue(item?.employeeCode),
    preferredLocale: item?.preferredLocale === 'en' ? 'en' : 'ar',
    status: item?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    isActive: item?.isActive !== false,
    reason: '',
    roleIds: ids('roles'),
    branchIds: ids('branches'),
    grants: Array.isArray(item?.grants) ? (item.grants as PermissionGrantDto[]) : [],
  };
}
export function AccessDialog({
  action,
  item,
  user,
  locale,
  onClose,
}: {
  action: AccessAction;
  item?: SystemRecord;
  user: DashboardUser;
  locale: Locale;
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => initialAccessValues(item));
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const id = useId();
  const t = (key: string) => systemText(locale, key);
  function change<K extends keyof AccessValues>(name: K, value: AccessValues[K]) {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => previous.filter((entry) => entry !== name));
  }
  const names = (resource: 'roles' | 'branches') =>
    Object.fromEntries(
      (Array.isArray(item?.[resource]) ? item[resource] : []).map((value) => {
        const row = record(value);
        return [String(row.id), String(row.name)];
      }),
    );
  return (
    <SystemCommandDialog
      title={t(action)}
      description={t(action === 'createUser' ? 'inviteHint' : 'accessWarning')}
      locale={locale}
      userId={user.id}
      fingerprint={JSON.stringify({ action, item, values })}
      submit={async () => {
        if (action !== 'createUser') return executeAccessAction(action, values, item);
        const context = await getAcademyContext();
        return executeAccessAction(
          action,
          {
            ...values,
            branchIds: context.branches.slice(0, 1).map((branch) => branch.id),
          },
          item,
        );
      }}
      validate={() => {
        const next = accessErrors(action, values);
        setErrors(next);
        return !next.length;
      }}
      onClose={onClose}
      onSaved={() => router.refresh()}
    >
      {['createUser', 'createRole', 'createBranch', 'editRole', 'editBranch'].includes(action) ? (
        <Input
          label={t('name')}
          value={values.name}
          onChange={(value) => change('name', value)}
          isRequired
          isInvalid={errors.includes('name')}
          minLength={2}
          maxLength={200}
        />
      ) : null}
      {['createRole', 'createBranch'].includes(action) ? (
        <Input
          label={t('code')}
          value={values.code}
          onChange={(value) => change('code', value)}
          isRequired
          isInvalid={errors.includes('code')}
          minLength={2}
          maxLength={50}
        />
      ) : null}
      {action === 'createUser' ? (
        <>
          <Input
            label={t('email')}
            type="email"
            value={values.email}
            onChange={(value) => change('email', value)}
            isRequired
            isInvalid={errors.includes('email')}
            autoComplete="off"
          />
          <Input
            label={t('employeeCode')}
            value={values.employeeCode}
            onChange={(value) => change('employeeCode', value)}
            isInvalid={errors.includes('employeeCode')}
            maxLength={50}
          />
          <SystemSelect
            label={t('preferredLocale')}
            value={values.preferredLocale}
            options={['ar', 'en']}
            onChange={(value) => change('preferredLocale', value === 'en' ? 'en' : 'ar')}
            locale={locale}
          />
        </>
      ) : null}
      {['createUser', 'replaceRoles'].includes(action) ? (
        <AssignmentPicker
          resource="roles"
          selected={values.roleIds}
          names={names('roles')}
          onChange={(value) => change('roleIds', value)}
          userId={user.id}
          locale={locale}
        />
      ) : null}
      {['createRole', 'replaceGrants'].includes(action) ? (
        <GrantEditor
          grants={values.grants}
          onChange={(value) => change('grants', value)}
          user={user}
          locale={locale}
        />
      ) : null}
      {action === 'editUser' ? (
        <SystemSelect
          label={t('status')}
          value={values.status}
          options={item?.id === user.id ? ['ACTIVE'] : ['ACTIVE', 'SUSPENDED']}
          onChange={(value) => change('status', value === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE')}
          locale={locale}
        />
      ) : null}
      {action === 'editBranch' ? (
        <Checkbox isSelected={values.isActive} onChange={(value) => change('isActive', value)}>
          {t('isActive')}
        </Checkbox>
      ) : null}
      {['editUser', 'replaceRoles', 'replaceBranches'].includes(action) ? (
        <Field
          htmlFor={`${id}-reason`}
          label={t('reason')}
          error={errors.includes('reason') ? t('invalid') : undefined}
        >
          <Textarea
            id={`${id}-reason`}
            value={values.reason}
            onChange={(event) => change('reason', event.target.value)}
            minLength={5}
            maxLength={1000}
            required
          />
        </Field>
      ) : null}
    </SystemCommandDialog>
  );
}
