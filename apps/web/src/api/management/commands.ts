import type { PlgRequestInit } from '@academyops/api-client/http';
import { field, textValue } from '@/api/academy/models';
import * as sessions from '@/api/generated/academic/academic';
import * as attendance from '@/api/generated/attendance/attendance';
import * as accounts from '@/api/generated/business-accounts/business-accounts';
import * as certificates from '@/api/generated/certificates/certificates';
import * as finance from '@/api/generated/finance/finance';
import * as reports from '@/api/generated/reports/reports';
import {
  type FormValues,
  type ManagementTarget,
  validateManagementAction,
} from '@/features/management/actions';
import { invoiceLines } from '@/features/management/invoice-values';
import { sessionTrainers } from '@/features/management/session-trainer-values';
import { cairoWallTimeToIso } from '@/lib/cairo-time';
import { resolveBillingAccount } from './lookups';

export async function uploadManagementCertificate(
  id: string,
  version: number,
  file: File,
  idempotencyKey: string,
) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('versionRequired');
  if (
    file.size > 10 * 1024 * 1024 ||
    file.size === 0 ||
    !/\.pdf$/i.test(file.name) ||
    (file.type && file.type !== 'application/pdf')
  )
    throw new Error('invalidPdf');
  return certificates.certificatesControllerUploadV1(
    id,
    { file },
    { idempotencyKey, headers: { 'If-Match': String(version) } },
  );
}

export async function executeManagementAction(
  target: ManagementTarget,
  values: FormValues,
  idempotencyKey: string,
  branchId?: string,
): Promise<unknown> {
  const validation = validateManagementAction(target.action, values);
  if (validation) throw new Error(validation);
  const { action, row } = target;
  const id = row?.id ?? '';
  const keyed: PlgRequestInit = { idempotencyKey };
  const versioned = (): PlgRequestInit => {
    const version =
      action === 'correctAttendance' ? field(row?.data ?? {}, 'attendance.version') : row?.version;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
      throw new Error('Record version is required');
    return { ...keyed, headers: { 'If-Match': String(version) } };
  };
  const v = (key: string) => values[key]?.trim() ?? '';
  const reason = { reason: v('reason') };
  const optional = (keys: string[]) =>
    Object.fromEntries(keys.filter((key) => v(key)).map((key) => [key, v(key)]));
  const date = (key: string) => cairoWallTimeToIso(v(key));
  switch (action) {
    case 'createSession':
      return (
        await sessions.academicControllerCreateV1(
          {
            cohortId: v('cohortId'),
            cohortModuleId: v('cohortModuleId'),
            ordinal: Number(v('ordinal')),
            deliveryMode:
              v('deliveryMode') === 'ONLINE'
                ? 'ONLINE'
                : v('deliveryMode') === 'HYBRID'
                  ? 'HYBRID'
                  : 'IN_PERSON',
            startsAt: date('startsAt'),
            endsAt: date('endsAt'),
            ...optional(['roomId']),
            ...(values.trainers !== undefined
              ? {
                  trainers: sessionTrainers(values.trainers).map(({ trainerId, role }) => ({
                    trainerId,
                    role,
                  })),
                }
              : v('trainerId')
                ? { trainers: [{ trainerId: v('trainerId'), role: 'PRIMARY' }] }
                : {}),
          },
          keyed,
        )
      ).data;
    case 'reschedule':
      return (
        await sessions.academicControllerRescheduleV1(
          id,
          {
            startsAt: date('startsAt'),
            endsAt: date('endsAt'),
            ...optional(['roomId']),
            ...(values.trainers !== undefined
              ? {
                  trainers: sessionTrainers(values.trainers).map(({ trainerId, role }) => ({
                    trainerId,
                    role,
                  })),
                }
              : {}),
            ...reason,
          },
          versioned(),
        )
      ).data;
    case 'cancelSession':
      return (await sessions.academicControllerCancelV1(id, reason, versioned())).data;
    case 'completeSession':
      return (await sessions.academicControllerCompleteV1(id, optional(['note']), versioned()))
        .data;
    case 'openWindow':
      return (await attendance.attendanceControllerOpenWindowV1(id, versioned())).data;
    case 'closeWindow':
      return (await attendance.attendanceControllerCloseWindowV1(id, versioned())).data;
    case 'recordAttendance': {
      if (!target.sessionId) throw new Error('Session is required');
      const status = v('status') as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      return (
        await attendance.attendanceControllerRecordManualV1(
          target.sessionId,
          { enrollmentId: textValue(row?.data.enrollmentId), status, ...reason },
          keyed,
        )
      ).data;
    }
    case 'correctAttendance':
      return (
        await attendance.attendanceControllerCorrectV1(
          textValue(field(row?.data ?? {}, 'attendance.id')),
          { status: v('status') as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED', ...reason },
          versioned(),
        )
      ).data;
    case 'createAccount': {
      if (!branchId) throw new Error('Branch is required');
      return (
        await accounts.businessAccountsControllerCreateV1(
          {
            owningBranchId: branchId,
            legalName: v('legalName'),
            displayName: v('displayName'),
            ...optional(['taxId', 'registrationNo']),
          },
          keyed,
        )
      ).data;
    }
    case 'editAccount':
      return (
        await accounts.businessAccountsControllerUpdateV1(
          id,
          {
            legalName: v('legalName'),
            displayName: v('displayName'),
            status: v('status') === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
            ...optional(['taxId', 'registrationNo']),
          },
          versioned(),
        )
      ).data;
    case 'createCheckout':
      return (await finance.financeControllerCreatePaymobCheckoutV1(id, keyed)).data;
    case 'recordPayment':
      return (
        await finance.financeControllerCreatePaymentV1(
          {
            billingAccountId: await resolveBillingAccount(values),
            ...(v('accountType') === 'STUDENT' ? { enrollmentId: v('enrollmentId') } : {}),
            methodId: v('methodId'),
            amount: v('amount'),
            receivedAt: date('receivedAt'),
            ...optional(['externalReference']),
          },
          keyed,
        )
      ).data;
    case 'postPayment':
      return (await finance.financeControllerPostPaymentV1(id, versioned())).data;
    case 'rejectPayment':
      return (await finance.financeControllerRejectPaymentV1(id, reason, versioned())).data;
    case 'issueReceipt':
      return (await finance.financeControllerIssueReceiptV1(id, keyed)).data;
    case 'requestRefund':
      return (
        await finance.financeControllerRequestRefundV1(
          id,
          { amount: v('amount'), ...reason },
          keyed,
        )
      ).data;
    case 'requestReversal':
      return (await finance.financeControllerRequestReversalV1(id, reason, keyed)).data;
    case 'approveRefund':
      return (await finance.financeControllerApproveRefundV1(id, keyed)).data;
    case 'approveReversal':
      return (await finance.financeControllerApproveReversalV1(id, keyed)).data;
    case 'rejectRefund':
      return (await finance.financeRequestDecisionControllerRejectRefundV1(id, reason, keyed)).data;
    case 'withdrawRefund':
      return (await finance.financeRequestDecisionControllerWithdrawRefundV1(id, reason, keyed))
        .data;
    case 'rejectReversal':
      return (await finance.financeRequestDecisionControllerRejectReversalV1(id, reason, keyed))
        .data;
    case 'withdrawReversal':
      return (await finance.financeRequestDecisionControllerWithdrawReversalV1(id, reason, keyed))
        .data;
    case 'reissueCertificate':
      return (await certificates.certificatesControllerReissueV1(id, reason, keyed)).data;
    case 'createInvoice':
      return (
        await finance.financeControllerCreateInvoiceV1(
          {
            billingAccountId: await resolveBillingAccount(values),
            lines:
              values.invoiceLines !== undefined
                ? invoiceLines(values.invoiceLines).map((line) => {
                    const desc = (line.descriptionEn || line.descriptionAr || '').trim();
                    return {
                      ledgerEntryId: line.ledgerEntryId,
                      descriptionAr: (line.descriptionAr || desc).trim(),
                      descriptionEn: (line.descriptionEn || desc).trim(),
                      quantity: line.quantity,
                      unitAmount: line.unitAmount,
                      ...(line.taxAmount ? { taxAmount: line.taxAmount } : {}),
                    };
                  })
                : [
                    {
                      ledgerEntryId: v('ledgerEntryId'),
                      descriptionAr: v('descriptionAr') || v('description') || v('descriptionEn'),
                      descriptionEn: v('descriptionEn') || v('description') || v('descriptionAr'),
                      quantity: v('quantity'),
                      unitAmount: v('unitAmount'),
                      ...optional(['taxAmount']),
                    },
                  ],
          },
          keyed,
        )
      ).data;
    case 'issueInvoice':
      return (await finance.financeControllerIssueInvoiceV1(id, versioned())).data;
    case 'cancelInvoice':
      return (await finance.financeControllerCancelInvoiceV1(id, reason, versioned())).data;
    case 'voidInvoice':
      return (await finance.financeControllerVoidInvoiceV1(id, reason, versioned())).data;
    case 'creditNote':
      return (
        await finance.financeControllerCreateCreditNoteV1(
          id,
          { amount: v('amount'), ...reason },
          keyed,
        )
      ).data;
    case 'evaluateCertificate':
      return (
        await certificates.certificatesControllerEvaluateV1(
          { enrollmentId: v('enrollmentId') },
          keyed,
        )
      ).data;
    case 'issueCertificate':
      return (
        await certificates.certificatesControllerIssueV1({ enrollmentId: v('enrollmentId') }, keyed)
      ).data;
    case 'revokeCertificate':
      return (await certificates.certificatesControllerRevokeV1(id, reason, versioned())).data;
    case 'printCertificate':
      return (await certificates.certificatesControllerPrintV1(id, versioned())).data;
    case 'readyCertificate':
      return (await certificates.certificatesControllerReadyV1(id, versioned())).data;
    case 'collectCertificate':
      return (await certificates.certificatesControllerCollectV1(id, versioned())).data;
    case 'createExport':
      return (await reports.reportingControllerCreateFinanceReceivablesExportV1(undefined, keyed))
        .data;
  }
}
