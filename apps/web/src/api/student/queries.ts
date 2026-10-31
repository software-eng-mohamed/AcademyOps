import {
  type AcademyRecord,
  field,
  normalizeRecord,
  record,
  textValue,
} from '@/api/academy/models';
import { getAcademyPage } from '@/api/academy/queries';
import * as attendance from '@/api/generated/attendance/attendance';
import * as finance from '@/api/generated/finance/finance';
import { getManagementPage } from '@/api/management/queries';

export const studentKey = (userId: string) => ['student', userId] as const;
export type StudentSection = 'learning' | 'schedule' | 'attendance' | 'finance' | 'certificates';
export type StudentResource =
  | 'enrollments'
  | 'sessions'
  | 'certificates'
  | 'payments'
  | 'invoices'
  | 'receipts';
export function studentResource(section: StudentSection, tab: string | null): StudentResource {
  if (section === 'finance' && (tab === 'payments' || tab === 'invoices' || tab === 'receipts'))
    return tab;
  if (section === 'learning' || section === 'finance') return 'enrollments';
  return section === 'certificates' ? 'certificates' : 'sessions';
}
export async function getStudentPage(
  resource: StudentResource,
  filters: { cursor?: string; status?: string; from?: string; to?: string },
  signal?: AbortSignal,
) {
  const page =
    resource === 'enrollments'
      ? await getAcademyPage('enrollments', filters, signal)
      : await getManagementPage(resource, filters, signal);
  return {
    ...page,
    items: page.items.map(
      (row): AcademyRecord => ({
        ...row,
        name:
          resource === 'enrollments'
            ? textValue(field(row.data, 'program.name')) || row.name
            : resource === 'certificates'
              ? textValue(row.data.serial) || row.code || row.name
              : row.name,
      }),
    ),
  };
}
export async function getStudentRoster(id: string, signal?: AbortSignal, cursor?: string) {
  return (
    await attendance.attendanceControllerRosterV1(id, cursor ? { cursor } : {}, {
      signal: signal ?? null,
    })
  ).data;
}
export async function getStudentQr() {
  return (await attendance.attendanceControllerGetSelfTokenV1()).data;
}
export async function checkInStudent(token: string, key: string) {
  if (token.trim().length < 20 || token.trim().length > 500) throw new Error('invalidToken');
  return (
    await attendance.attendanceControllerCheckInV1({ token: token.trim() }, { idempotencyKey: key })
  ).data;
}
export async function getStudentInstallments(id: string, cursor?: string, signal?: AbortSignal) {
  return (
    await finance.financeInstallmentControllerListV1(
      id,
      { ...(cursor ? { cursor } : {}) },
      { signal: signal ?? null },
    )
  ).data;
}
export async function createStudentCheckout(id: string, key: string) {
  const data = (await finance.financeControllerCreatePaymobCheckoutV1(id, { idempotencyKey: key }))
    .data;
  if (data.checkoutUrl) {
    const url = new URL(data.checkoutUrl);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    )
      throw new Error('Invalid checkout URL');
  }
  return data;
}
export async function getStudentCheckout(id: string) {
  return (await finance.financeControllerPaymobCheckoutStatusV1(id)).data;
}
export function studentRow(id: string): AcademyRecord {
  return normalizeRecord('enrollments', record({ id }));
}
