'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { field, records, textValue } from '@/api/academy/models';
import { financeControllerBillingSummaryV1 } from '@/api/generated/finance/finance';
import { uploadManagementCertificate } from '@/api/management/commands';
import {
  getManagementDetail,
  getManagementDownload,
  managementKey,
} from '@/api/management/queries';

import { isStepUpRequired } from '@/features/academy/step-up-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import {
  getPrimaryRoleCode,
  hasStaffPermission as hasPermission,
  hasPermission as hasScopedPermission,
} from '@/features/dashboard/navigation';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import type { Locale } from '@/lib/locales';
import { canRunManagementAction } from './action-access';
import { type ManagementTarget, rowActions } from './actions';

import type { ManagementResource, ManagementRow } from './config';

export function useManagementDetailState({
  resource,
  row,
  user,
  locale,
  onClose,
  onAction,
}: {
  resource: ManagementResource;
  row: ManagementRow;
  user: DashboardUser;
  locale: Locale;
  onClose: () => void;
  onAction: (target: ManagementTarget) => void;
}) {
  const copy = getAcademyCopy(locale);
  const t = (key: string) => managementText(locale, key);
  const personal = getPrimaryRoleCode(user) === 'STUDENT';
  const [stepUp, setStepUp] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const uploadAttempt = useRef<{ file: File; version: number; key: string } | undefined>(undefined);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [
      ...managementKey(user.id),
      'detail',
      resource,
      row.id,
      ...(resource === 'roster' ? [textValue(field(row.data, 'session.id'))] : []),
    ],
    queryFn: ({ signal }) => getManagementDetail(resource, row, signal),
    staleTime: 0,
    enabled: resource !== 'exports',
  });
  const detail = resource === 'exports' ? row : query.data;
  const billingId = textValue(field(detail?.data ?? {}, 'billingAccount.id'));
  const balance = useQuery({
    queryKey: [...managementKey(user.id), 'balance', billingId],
    queryFn: ({ signal }) => financeControllerBillingSummaryV1(billingId, { signal }),
    // Company-wide totals require company/branch scope. Assigned Sales fees and
    // balances remain available in the specific enrollment's detail drawer.
    enabled: Boolean(billingId) && hasPermission(user, 'finance.balance.read', ['O', 'B']),
  });
  const download = useMutation({
    mutationFn: () =>
      getManagementDownload(resource === 'certificates' ? 'certificates' : 'exports', row.id),
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('File is required');
      const version = detail?.version ?? 0;
      if (uploadAttempt.current?.file !== file || uploadAttempt.current.version !== version)
        uploadAttempt.current = { file, version, key: crypto.randomUUID() };
      return uploadManagementCertificate(row.id, version, file, uploadAttempt.current.key);
    },
    retry: false,
    onSuccess: async () => {
      setFile(undefined);
      await client.invalidateQueries({ queryKey: managementKey(user.id) });
    },
  });
  useEffect(() => {
    if ([query.error, balance.error, download.error, upload.error].some(isStepUpRequired))
      setStepUp(true);
  }, [query.error, balance.error, download.error, upload.error]);
  const related =
    resource === 'invoices'
      ? 'lines'
      : resource === 'payments'
        ? 'refunds'
        : resource === 'businessAccounts'
          ? 'contacts'
          : 'events';
  const relatedItems = records(detail?.data[related]);
  const relatedFields =
    related === 'lines'
      ? [locale === 'ar' ? 'descriptionAr' : 'descriptionEn', 'quantity', 'unitAmount', 'taxAmount']
      : related === 'refunds'
        ? ['amount', 'processedAt']
        : related === 'contacts'
          ? ['person.name', 'role', 'isPrimary']
          : ['type', 'reason', 'occurredAt'];
  const downloadable =
    (resource === 'certificates' && detail?.data.pdfStatus === 'AVAILABLE') ||
    (resource === 'exports' &&
      detail?.status === 'AVAILABLE' &&
      Date.parse(textValue(detail.data.expiresAt)) > Date.now());
  const actions = detail
    ? rowActions(resource, detail).filter((action) => canRunManagementAction(user, action, detail))
    : [];
  const canOpenRoster = resource === 'sessions' && hasPermission(user, 'attendance.read');
  const canOpenPayment =
    resource === 'receipts' &&
    Boolean(detail?.data.paymentId) &&
    (hasPermission(user, 'payments.read') ||
      (personal && hasScopedPermission(user, 'payments.read', ['S'])));
  const showActions =
    actions.length > 0 ||
    canOpenRoster ||
    canOpenPayment ||
    downloadable ||
    Boolean(download.data) ||
    download.isError;
  return {
    resource,
    row,
    user,
    locale,
    onClose,
    onAction,
    copy,
    t,
    personal,
    stepUp,
    setStepUp,
    contactsOpen,
    setContactsOpen,
    file,
    setFile,
    client,
    query,
    detail,
    balance,
    download,
    upload,
    related,
    relatedItems,
    relatedFields,
    downloadable,
    actions,
    canOpenRoster,
    canOpenPayment,
    showActions,
  };
}
