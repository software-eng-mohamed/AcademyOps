'use client';

import type { StaffOverview, WorkspaceOverview } from '@academyops/api-client/workspace-overview';
import type { Locale } from '@/lib/locales';
import { AccountsOverview, OtpOverview, ReceptionOverview } from './staff-business-overviews';
import {
  AcademicOverview,
  AttendanceOverview,
  OperationsOverview,
  TrainerOverview,
} from './staff-learning-overviews';

export function StaffOverviewContent({
  data,
  overview,
  locale,
}: {
  data: StaffOverview;
  overview: WorkspaceOverview;
  locale: Locale;
}) {
  if (data.kind !== overview.role) return null;
  const props = { queue: overview.queue, locale };
  switch (data.kind) {
    case 'OPERATIONS':
      return <OperationsOverview data={data} {...props} />;
    case 'ACADEMIC':
      return <AcademicOverview data={data} {...props} />;
    case 'RECEPTION':
      return <ReceptionOverview data={data} {...props} />;
    case 'ACCOUNTS':
      return <AccountsOverview data={data} {...props} />;
    case 'ATTENDANCE':
      return <AttendanceOverview data={data} {...props} />;
    case 'TRAINER':
      return <TrainerOverview data={data} {...props} />;
    case 'OTP_OPERATOR':
      return <OtpOverview data={data} channel={overview.channel} locale={locale} />;
  }
}
