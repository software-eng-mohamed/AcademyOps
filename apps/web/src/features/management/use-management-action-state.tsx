'use client';
import { isPlgApiError } from '@academyops/api-client/http';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { field, record, records, textValue } from '@/api/academy/models';
import { academyKey, getAcademyContext } from '@/api/academy/queries';
import { executeManagementAction } from '@/api/management/commands';
import { managementKey } from '@/api/management/queries';

import { isStepUpRequired } from '@/features/academy/step-up-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { instantToCairoDateTimeLocal } from '@/lib/cairo-time';
import type { Locale } from '@/lib/locales';
import { actionFields, type FormValues, type ManagementTarget } from './actions';

import { newInvoiceLine } from './invoice-values';

function initialValues(target: ManagementTarget): FormValues {
  const values: FormValues = {
    accountType: 'STUDENT',
    deliveryMode: 'IN_PERSON',
    ordinal: '1',
    quantity: '1',
  };
  if (target.action === 'createInvoice') values.invoiceLines = JSON.stringify([newInvoiceLine()]);
  if (['createSession', 'reschedule'].includes(target.action))
    values.trainers = JSON.stringify(
      records(target.row?.data.trainers)
        .filter((item) => item.bookingStatus === 'CONFIRMED')
        .map((item) => ({
          trainerId: item.trainerId,
          uiKey: textValue(item.id),
          role: item.role,
          label: textValue(field(item, 'trainer.person.name')),
        })),
    );
  for (const name of ['legalName', 'displayName', 'taxId', 'registrationNo', 'status', 'roomId'])
    if (target.row?.data[name] !== undefined) values[name] = textValue(target.row.data[name]);
  for (const name of ['startsAt', 'endsAt']) {
    const raw = target.row?.data[name];
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) {
      values[name] = instantToCairoDateTimeLocal(raw);
    }
  }
  if (['recordAttendance', 'correctAttendance'].includes(target.action))
    values.status = ['UNRECORDED', 'UNMARKED'].includes(target.row?.status ?? '')
      ? ''
      : (target.row?.status ?? '');
  return values;
}
export function useManagementActionState({
  target,
  userId,
  canReadBusinessAccount = true,
  locale,
  onClose,
}: {
  target: ManagementTarget;
  userId: string;
  canReadBusinessAccount?: boolean;
  locale: Locale;
  onClose: () => void;
}) {
  const copy = getAcademyCopy(locale);
  const t = (key: string) => managementText(locale, key);
  const [values, setValues] = useState(() => initialValues(target));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const focusValidation = useRef(false);
  useEffect(() => {
    if (!focusValidation.current) return;
    focusValidation.current = false;
    if (!Object.values(errors).some(Boolean)) return;
    const form = formRef.current;
    const invalid = form?.querySelector<HTMLElement>(
      'input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]',
    );
    (invalid ?? form?.querySelector<HTMLElement>('[data-validation-summary]'))?.focus();
  }, [errors]);
  const [stepUp, setStepUp] = useState(false);
  const id = useId();
  const client = useQueryClient();
  const attempt = useRef<{ payload: string; key: string } | undefined>(undefined);
  const context = useQuery({
    queryKey: [...academyKey(userId), 'context'],
    queryFn: ({ signal }) => getAcademyContext(signal),
    staleTime: 60_000,
    enabled: target.action === 'createAccount',
  });
  const mutation = useMutation({
    retry: false,
    gcTime: target.action === 'createCheckout' ? 0 : 5 * 60_000,
    mutationFn: async () => {
      const payload = JSON.stringify({ target, values });
      if (attempt.current?.payload !== payload)
        attempt.current = { payload, key: crypto.randomUUID() };
      return executeManagementAction(
        target,
        values,
        attempt.current.key,
        context.data?.branches[0]?.id,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: managementKey(userId) }),
        client.invalidateQueries({ queryKey: academyKey(userId) }),
        client.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some((part) => typeof part === 'string' && part.includes('/dashboard/')),
        }),
      ]);
      if (
        ![
          'evaluateCertificate',
          'requestRefund',
          'requestReversal',
          'createExport',
          'createCheckout',
        ].includes(target.action)
      )
        onClose();
    },
    onError: (error) => {
      if (isPlgApiError(error)) {
        focusValidation.current = true;
        setErrors(
          Object.fromEntries(
            (error.payload.fieldErrors ?? []).map((item) => [item.field, copy.invalid]),
          ),
        );
      }
    },
  });
  useEffect(() => {
    if (isStepUpRequired(mutation.error) || isStepUpRequired(context.error)) setStepUp(true);
  }, [mutation.error, context.error]);
  const change = (name: string, value: string, code?: string) => {
    setValues((previous) => ({
      ...previous,
      [name]: value,
      ...(name === 'methodId' ? { paymentMethodCode: code ?? '' } : {}),
      ...(['accountType', 'studentId', 'businessAccountId'].includes(name)
        ? {
            enrollmentId: '',
            ledgerEntryId: '',
            ...(target.action === 'createInvoice'
              ? { invoiceLines: JSON.stringify([newInvoiceLine()]) }
              : {}),
          }
        : {}),
      ...(name === 'enrollmentId'
        ? {
            ledgerEntryId: '',
            ...(target.action === 'createInvoice'
              ? { invoiceLines: JSON.stringify([newInvoiceLine()]) }
              : {}),
          }
        : {}),
      ...(name === 'cohortId' ? { cohortModuleId: '' } : {}),
    }));
    setErrors((previous) => ({
      ...previous,
      [name]: '',
      ...(name === 'methodId' ? { externalReference: '' } : {}),
      ...(name === 'deliveryMode' && value === 'ONLINE' ? { roomId: '' } : {}),
    }));
    mutation.reset();
  };
  const close = () => {
    if (!mutation.isPending) onClose();
  };
  const result = record(mutation.data);
  const fields = actionFields(target.action, values, target.row?.status).map((item) =>
    item.name === 'accountType' && !canReadBusinessAccount
      ? { ...item, options: ['STUDENT'] }
      : item,
  );
  return {
    target,
    userId,
    locale,
    onClose,
    copy,
    t,
    values,
    errors,
    setErrors,
    formRef,
    focusValidation,
    stepUp,
    setStepUp,
    id,
    context,
    mutation,
    change,
    close,
    result,
    fields,
  };
}
