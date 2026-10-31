import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { readCurrentUser } from '@/api/server/current-user';
import { canUseStaffPage, hasPermission } from '@/features/dashboard/navigation';
import { OverviewUnavailable } from '@/features/dashboard/overview/overview-unavailable';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { isLocale } from '@/lib/locales';
import { type SystemSection, systemPermissions, systemResources } from './config';
import { SystemPage } from './system-page';
import { WhatsappPage } from './whatsapp-page';

export async function SystemRoute({
  section,
  params,
}: {
  section: SystemSection;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const user = await readCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (
    !canUseStaffPage(user, section) ||
    !(section === 'whatsapp'
      ? hasPermission(user, systemPermissions.whatsapp, ['O'])
      : systemResources(section, user).length > 0)
  )
    return <OverviewUnavailable />;
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8 text-sm text-text-secondary">
          {getAcademyCopy(locale).loading}
        </p>
      }
    >
      {section === 'whatsapp' ? (
        <WhatsappPage user={user} />
      ) : (
        <SystemPage section={section} user={user} />
      )}
    </Suspense>
  );
}
