'use client';

import { Field } from '@academyops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { executeFeeAction, type FeeTarget, pricingKey } from '@/api/academy/pricing';
import { academyKey } from '@/api/academy/queries';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { SystemCommandDialog } from '@/features/system/command-dialog';
import { pricingText } from '@/i18n/pricing-copy';
import type { Locale } from '@/lib/locales';
import {
  type FeeInstallment,
  type FeeLine,
  feeTotal,
  feeTypes,
  newFeeInstallment,
  newFeeLine,
  validFeeSchedule,
} from './pricing-values';

export function PricingDialog({
  target,
  enrollmentId,
  userId,
  locale,
  onClose,
  onCreated,
}: {
  target: FeeTarget;
  enrollmentId: string;
  userId: string;
  locale: Locale;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = (key: string) => pricingText(locale, key);
  const client = useQueryClient();
  const prefix = useId();
  const { action, agreement, schedule } = target;
  const [lines, setLines] = useState<FeeLine[]>(
    () =>
      agreement?.lines.map((line) => ({
        ...line,
        key: line.id,
        type: line.type as FeeLine['type'],
      })) ?? [newFeeLine()],
  );
  const [discount, setDiscount] = useState(agreement?.discountAmount ?? '0');
  const [installments, setInstallments] = useState<FeeInstallment[]>(
    () =>
      schedule?.installments.map((item) => ({
        key: item.id,
        dueDate: item.dueDate.slice(0, 10),
        amount: item.amount,
      })) ?? [{ ...newFeeInstallment(), amount: agreement?.totalAmount ?? '' }],
  );
  const [reason, setReason] = useState('');
  const editingFees = action === 'create' || action === 'edit';
  const editingSchedule = action === 'createSchedule' || action === 'editSchedule';
  const decision = action === 'approve' || action === 'reject';
  const values = { lines, discount, installments, reason };
  const updateLine = (key: string, patch: Partial<FeeLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  return (
    <SystemCommandDialog
      title={t(action)}
      description={t(editingSchedule ? 'scheduleHint' : decision ? 'decisionHint' : 'confirm')}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({ target, enrollmentId, values })}
      validate={() =>
        editingFees
          ? feeTotal(lines, discount) !== null
          : editingSchedule
            ? validFeeSchedule(installments, agreement?.totalAmount ?? '')
            : !decision || (reason.trim().length >= 3 && reason.trim().length <= 1000)
      }
      submit={(key) => executeFeeAction(target, enrollmentId, values, key)}
      onClose={onClose}
      onSaved={async (result) => {
        await Promise.all([
          client.invalidateQueries({ queryKey: pricingKey(userId, enrollmentId) }),
          client.invalidateQueries({ queryKey: academyKey(userId) }),
          client.invalidateQueries({ queryKey: managementKey(userId) }),
        ]);
        if (
          action === 'create' &&
          result &&
          typeof result === 'object' &&
          'id' in result &&
          typeof result.id === 'string'
        )
          onCreated(result.id);
      }}
    >
      {editingFees ? (
        <>
          {lines.map((line, index) => (
            <fieldset
              key={line.key}
              className="grid min-w-0 gap-4 rounded-xl border border-border p-4"
            >
              <legend className="px-1 text-sm font-semibold">
                {t('lines')} {index + 1}
              </legend>
              <Field label={t('type')} htmlFor={`${prefix}-${line.key}`}>
                <Select
                  triggerId={`${prefix}-${line.key}`}
                  aria-label={t('type')}
                  selectedKey={line.type}
                  renderValue={t(line.type)}
                  onSelectionChange={(key) =>
                    updateLine(line.key, { type: String(key) as FeeLine['type'] })
                  }
                >
                  {feeTypes.map((type) => (
                    <SelectItem key={type} id={type} textValue={t(type)}>
                      {t(type)}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label={t('description')}
                    isRequired
                    value={line.descriptionEn || line.descriptionAr || ''}
                    maxLength={500}
                    inputMode="text"
                    onChange={(value) =>
                      updateLine(line.key, { descriptionEn: value, descriptionAr: value })
                    }
                  />
                </div>
                {(['quantity', 'unitAmount'] as const).map((name) => (
                  <Input
                    key={name}
                    label={t(name)}
                    isRequired
                    value={line[name]}
                    maxLength={13}
                    inputMode="decimal"
                    onChange={(value) => updateLine(line.key, { [name]: value })}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="small"
                disabled={lines.length === 1}
                aria-label={`${t('remove')} ${index + 1}`}
                onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
              >
                {t('remove')}
              </Button>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            disabled={lines.length >= 100}
            onClick={() => setLines([...lines, newFeeLine()])}
          >
            {t('addLine')}
          </Button>
          <Input
            label={t('discount')}
            value={discount}
            onChange={setDiscount}
            inputMode="decimal"
          />
        </>
      ) : null}
      {editingSchedule ? (
        <>
          <p className="font-semibold text-brand">
            {t('total')}: <bdi>{agreement?.totalAmount}</bdi>
          </p>
          {installments.map((item, index) => (
            <fieldset
              key={item.key}
              className="grid min-w-0 gap-4 rounded-xl border border-border p-4"
            >
              <legend className="px-1 text-sm font-semibold">
                {t('schedule')} {index + 1}
              </legend>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {(['dueDate', 'amount'] as const).map((name) => (
                  <Input
                    key={name}
                    label={t(name)}
                    isRequired
                    type={name === 'dueDate' ? 'date' : 'text'}
                    inputMode={name === 'amount' ? 'decimal' : 'text'}
                    value={item[name]}
                    onChange={(value) =>
                      setInstallments(
                        installments.map((entry) =>
                          entry.key === item.key ? { ...entry, [name]: value } : entry,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="small"
                disabled={installments.length === 1}
                aria-label={`${t('remove')} ${index + 1}`}
                onClick={() =>
                  setInstallments(installments.filter((entry) => entry.key !== item.key))
                }
              >
                {t('remove')}
              </Button>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            disabled={installments.length >= 100}
            onClick={() => setInstallments([...installments, newFeeInstallment()])}
          >
            {t('addInstallment')}
          </Button>
        </>
      ) : null}
      {decision ? (
        <Input
          label={t('reason')}
          isRequired
          maxLength={1000}
          value={reason}
          onChange={setReason}
        />
      ) : null}
      {!editingFees && !editingSchedule && agreement ? (
        <p className="text-sm">
          {t('total')}:{' '}
          <bdi>
            {agreement.totalAmount} {agreement.currencyCode}
          </bdi>
        </p>
      ) : null}
    </SystemCommandDialog>
  );
}
