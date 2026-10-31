import { redirect } from 'next/navigation';
import { readCurrentUser } from '@/api/server/current-user';
import { readDashboardOverview } from '@/api/server/dashboard';
import { readSalesOverview } from '@/api/server/sales-overview';
import { readWorkspaceOverview } from '@/api/server/workspace-overview';
import {
  getPrimaryRoleCode,
  getWorkspaceOverviewRole,
  hasPermission,
} from '@/features/dashboard/navigation';
import { DashboardOverview } from '@/features/dashboard/overview/dashboard-overview';
import { OverviewUnavailable } from '@/features/dashboard/overview/overview-unavailable';
import { SalesOverview } from '@/features/dashboard/overview/sales-overview';
import { WorkspaceOverviewPage } from '@/features/dashboard/overview/workspace-overview';
import { isLocale } from '@/lib/locales';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const user = await readCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (getPrimaryRoleCode(user) === 'SALES' && hasPermission(user, 'leads.read', ['A', 'B', 'O'])) {
    return (
      <SalesOverview
        initialOverview={await readSalesOverview()}
        userId={user.id}
        userName={user.name}
      />
    );
  }
  const workspaceRole = getWorkspaceOverviewRole(user);
  if (workspaceRole) {
    return (
      <WorkspaceOverviewPage
        initialOverview={await readWorkspaceOverview(workspaceRole)}
        role={workspaceRole}
        userId={user.id}
        userName={user.name}
      />
    );
  }
  if (getPrimaryRoleCode(user) !== 'OWNER' || !hasPermission(user, 'reports.operations.read')) {
    return <OverviewUnavailable />;
  }

  const overview = await readDashboardOverview();
  return <DashboardOverview initialOverview={overview} userName={user.name} />;
}
