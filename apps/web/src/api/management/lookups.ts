import { getLookupPage } from '@/api/academy/lookups';
import { field, record, records, textValue } from '@/api/academy/models';
import { cohortsControllerReadV1 } from '@/api/generated/academic-cohorts/academic-cohorts';
import { businessAccountsControllerReadV1 } from '@/api/generated/business-accounts/business-accounts';
import {
  enrollmentControllerListV1,
  enrollmentControllerReadV1,
} from '@/api/generated/enrollment/enrollment';
import {
  financeControllerEligibleInvoiceEntriesV1,
  financeControllerPaymentMethodsV1,
} from '@/api/generated/finance/finance';
import type { FormValues, LookupType } from '@/features/management/actions';
import { getManagementPage } from './queries';

export async function resolveBillingAccount(
  values: FormValues,
  signal?: AbortSignal,
): Promise<string> {
  const options = { signal: signal ?? null };
  if (values.accountType === 'BUSINESS' && values.businessAccountId) {
    const data = (await businessAccountsControllerReadV1(values.businessAccountId, options)).data;
    const id = textValue(field(record(data), 'billingAccount.id'));
    if (id) return id;
  } else if (values.enrollmentId) {
    const data = (await enrollmentControllerReadV1(values.enrollmentId, options)).data;
    if (data.billingAccountId) return data.billingAccountId;
  }
  throw new Error('Billing account is unavailable');
}
export async function getManagementLookup(
  kind: LookupType,
  search: string,
  cursor: string | undefined,
  values: FormValues,
  signal?: AbortSignal,
) {
  const options = { signal: signal ?? null };
  const common = { ...(cursor ? { cursor } : {}) };
  if (kind === 'sessions') {
    const page = await getManagementPage('sessions', common, signal);
    return {
      items: page.items
        .filter((item) => item.status !== 'CANCELLED' && item.status !== 'DRAFT')
        .map((item) => ({
          value: item.id,
          startsAt: textValue(item.data.startsAt),
          label: [item.name, textValue(field(item.data, 'cohort.name'))]
            .filter(Boolean)
            .join(' · '),
        })),
      nextCursor: page.nextCursor,
    };
  }
  if (kind === 'enrollments') {
    if (!values.studentId) return { items: [], nextCursor: null };
    const data = (
      await enrollmentControllerListV1({ ...common, studentPersonId: values.studentId }, options)
    ).data;
    return {
      items: records(record(data).items).map((item) => ({
        value: textValue(item.id),
        label: [
          field(item, 'program.name'),
          field(item, 'cohort.name'),
          field(item, 'state'),
          textValue(item.id).slice(0, 8),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      nextCursor: data.nextCursor,
    };
  }
  if (kind === 'cohortModules') {
    if (!values.cohortId) return { items: [], nextCursor: null };
    const data = (await cohortsControllerReadV1(values.cohortId, options)).data;
    return {
      items: data.modules.map((item) => ({
        value: item.id,
        label: textValue(field(item, 'module.name')) || item.id.slice(0, 8),
      })),
      nextCursor: null,
    };
  }
  if (kind === 'paymentMethods') {
    const data = (await financeControllerPaymentMethodsV1(options)).data;
    return {
      items: records(data)
        .filter((item) => item.isActive !== false && item.code !== 'PAYMOB')
        .map((item) => ({
          value: textValue(item.id),
          label: textValue(item.name || item.code),
          code: textValue(item.code),
        })),
      nextCursor: null,
    };
  }
  if (kind === 'ledgerEntries') {
    const billingAccountId = await resolveBillingAccount(values, signal);
    const data = (
      await financeControllerEligibleInvoiceEntriesV1({ ...common, billingAccountId }, options)
    ).data;
    return {
      items: data.items.map((item) => ({
        value: item.id,
        label: `${item.description || item.entryType} · ${item.amount} ${item.currencyCode}`,
        amount: item.amount,
      })),
      nextCursor: data.nextCursor,
    };
  }
  return getLookupPage(kind, search, cursor, {}, signal);
}
