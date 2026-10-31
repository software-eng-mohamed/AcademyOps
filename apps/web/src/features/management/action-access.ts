import { field, textValue } from '@/api/academy/models';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasStaffPermission } from '@/features/dashboard/navigation';
import { actionPermissions, type ManagementAction } from './actions';
import type { ManagementRow } from './config';

export function canRunManagementAction(
  user: DashboardUser,
  action: ManagementAction,
  row: ManagementRow,
) {
  if (!hasStaffPermission(user, actionPermissions[action])) return false;
  if (
    [
      'approveRefund',
      'approveReversal',
      'rejectRefund',
      'rejectReversal',
      'withdrawRefund',
      'withdrawReversal',
    ].includes(action)
  ) {
    if (row.status !== 'REQUESTED') return false;
    const own = row.data.requestedBy === user.id;
    return action.startsWith('withdraw') ? own : !own;
  }
  const window = textValue(field(row.data, 'session.attendanceWindowState'));
  if (action === 'recordAttendance' && window && !['OPEN', 'CLOSED'].includes(window)) return false;
  if (action === 'correctAttendance' && window === 'LOCKED')
    return hasStaffPermission(user, 'attendance.correct_after_lock');
  return true;
}

export function financialRequestActions(
  user: DashboardUser,
  request: ManagementRow,
  paymentStatus: string,
): ManagementAction[] {
  if (!['REFUND', 'REVERSAL'].includes(textValue(request.data.kind))) return [];
  const actions: ManagementAction[] =
    request.data.kind === 'REFUND'
      ? ['approveRefund', 'rejectRefund', 'withdrawRefund']
      : ['approveReversal', 'rejectReversal', 'withdrawReversal'];
  return actions.filter(
    (action) =>
      (!action.startsWith('approve') || paymentStatus === 'POSTED') &&
      canRunManagementAction(user, action, request),
  );
}
