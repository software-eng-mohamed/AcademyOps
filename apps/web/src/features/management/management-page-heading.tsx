'use client';

import { Button } from '@/components/base/buttons/button';

import { DirectoryHeading } from '@/features/academy/academy-surfaces';

import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';

import { ManagementIcon } from './presentation';
import type { useManagementPageState } from './use-management-page-state';
export function ManagementPageHeading({
  model,
}: {
  model: ReturnType<typeof useManagementPageState>;
}) {
  const { section, user, t, create, canCreate, launch } = model;
  return (
    <DirectoryHeading
      title={t(section)}
      description={t(`${section}Description`)}
      icon={<ManagementIcon section={section} className="size-7" />}
      {...(canCreate && create
        ? { action: { label: t(create), onClick: () => launch(create) } }
        : {})}
    >
      {section === 'certificates' && hasPermission(user, 'certificates.issue') ? (
        <Button variant="secondary" onClick={() => launch('evaluateCertificate')}>
          {t('evaluateCertificate')}
        </Button>
      ) : null}
    </DirectoryHeading>
  );
}
