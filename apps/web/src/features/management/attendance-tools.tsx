'use client';

import { useState } from 'react';

import { Button } from '@/components/base/buttons/button';

import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { hasPermission, staffScopes } from '@/features/dashboard/navigation';

import { operationsText } from '@/i18n/operations-copy';
import type { Locale } from '@/lib/locales';
import { AttendanceAnomalies } from './attendance-anomalies-dialog';
import { AttendanceScan } from './attendance-scan-dialog';
import { SessionQr } from './session-qr-dialog';
export function AttendanceTools({
  session,
  user,
  locale,
}: {
  session: Record<string, unknown>;
  user: DashboardUser;
  locale: Locale;
}) {
  const [tool, setTool] = useState<'qr' | 'scan' | 'anomalies'>();
  const id = String(session.id);
  const open = session.attendanceWindowState === 'OPEN' && session.status === 'SCHEDULED';
  return (
    <section className="mb-5 flex flex-wrap gap-2" aria-label={operationsText(locale, 'tools')}>
      {open && hasPermission(user, 'attendance.qr.open', staffScopes(user)) ? (
        <Button variant="secondary" onClick={() => setTool('qr')}>
          {operationsText(locale, 'qr')}
        </Button>
      ) : null}
      {open && hasPermission(user, 'attendance.record_manual', staffScopes(user)) ? (
        <Button variant="secondary" onClick={() => setTool('scan')}>
          {operationsText(locale, 'scan')}
        </Button>
      ) : null}
      {hasPermission(user, 'reports.operations.read', staffScopes(user)) ? (
        <Button variant="secondary" onClick={() => setTool('anomalies')}>
          {operationsText(locale, 'anomalies')}
        </Button>
      ) : null}
      {tool === 'qr' && open ? (
        <SessionQr key={id} id={id} locale={locale} onClose={() => setTool(undefined)} />
      ) : null}
      {tool === 'scan' && open ? (
        <AttendanceScan
          key={id}
          id={id}
          locale={locale}
          userId={user.id}
          onClose={() => setTool(undefined)}
        />
      ) : null}
      {tool === 'anomalies' ? (
        <AttendanceAnomalies
          key={id}
          id={id}
          locale={locale}
          userId={user.id}
          onClose={() => setTool(undefined)}
        />
      ) : null}
    </section>
  );
}
