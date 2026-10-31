'use client';

import { StatePanel } from '@academyops/ui';
import { Lock } from 'iconsax-react';
import { getDashboardOverviewCopy } from '@/i18n/dashboard-overview-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';

export function OverviewUnavailable() {
  const locale = useDocumentLocale();
  const copy = getDashboardOverviewCopy(locale);
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
      <StatePanel
        className="mt-5 min-h-72 rounded-2xl border-border-button-default bg-background-secondary-default"
        description={copy.unavailable.description}
        icon={<Lock aria-hidden color="currentColor" size={20} variant="Bulk" />}
        title={copy.unavailable.title}
      />
    </div>
  );
}
