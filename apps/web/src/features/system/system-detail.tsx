'use client';

import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@academyops/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AccessAction } from '@/api/system/commands';
import { getSystemDetail, systemField, systemKey, systemName } from '@/api/system/queries';
import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { isStepUpRequired, StepUpDialog } from '@/features/academy/step-up-dialog';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import { AccessDialog } from './access-dialog';
import { type SystemResource, systemColumns } from './config';
import { ImportDetail } from './import-controls';
import { StructuredValues, SystemValue } from './system-ui';

export function SystemDetail({
  resource,
  id,
  locale,
  user,
  onClose,
}: {
  resource: SystemResource;
  id: string;
  locale: Locale;
  user: DashboardUser;
  onClose: () => void;
}) {
  const [action, setAction] = useState<AccessAction>();
  const [stepUp, setStepUp] = useState(false);
  const copy = getAcademyCopy(locale);
  const query = useQuery({
    queryKey: [...systemKey(user.id), 'detail', resource, id],
    queryFn: ({ signal }) => getSystemDetail(resource, id, signal),
    staleTime: 0,
  });
  useEffect(() => {
    if (isStepUpRequired(query.error)) setStepUp(true);
  }, [query.error]);
  const item = query.data;
  const t = (key: string) => systemText(locale, key);
  const actions: AccessAction[] =
    resource === 'users'
      ? ['editUser', 'replaceRoles']
      : resource === 'roles'
        ? ['editRole', 'replaceGrants']
        : resource === 'branches'
          ? ['editBranch']
          : [];
  const extra =
    resource === 'audit'
      ? ['entityId', 'correlationId', 'before', 'after', 'metadata']
      : resource === 'legacyArchive'
        ? ['dataHash', 'data']
        : resource === 'roles'
          ? ['grants']
          : [];
  return (
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !action && !stepUp) onClose();
        }}
      >
        <DrawerContent className={styles.drawer} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <DrawerHeader>
            <div className="min-w-0">
              <DrawerDescription>
                {t('system')} / {t(resource)}
              </DrawerDescription>
              <DrawerTitle className={`${styles.drawerTitle} mt-4`}>
                {item ? systemName(resource, item) : copy.loading}
              </DrawerTitle>
            </div>
            <DrawerCloseButton aria-label={copy.close} />
          </DrawerHeader>
          <DrawerBody>
            {query.isPending ? (
              <p role="status">{copy.loading}</p>
            ) : query.isError ? (
              <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
            ) : item ? (
              <>
                {actions.length ? (
                  <div className="mb-5 flex flex-wrap gap-2">
                    {actions.map((entry) => (
                      <Button key={entry} variant="secondary" onClick={() => setAction(entry)}>
                        {t(entry)}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <dl className={styles.facts}>
                  {systemColumns[resource].map((name) => (
                    <div key={name}>
                      <dt>{t(name)}</dt>
                      <dd>
                        <SystemValue name={name} value={systemField(item, name)} locale={locale} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {resource === 'imports' ? (
                  <ImportDetail item={item} user={user} locale={locale} />
                ) : (
                  extra.map((name) => (
                    <section key={name} className={styles.detailSection}>
                      <h3>{t(name)}</h3>
                      <StructuredValues
                        value={item[name]}
                        locale={locale}
                        literal={resource === 'legacyArchive'}
                      />
                    </section>
                  ))
                )}
              </>
            ) : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
      {item && action ? (
        <AccessDialog
          action={action}
          item={item}
          user={user}
          locale={locale}
          onClose={() => setAction(undefined)}
        />
      ) : null}
      <StepUpDialog
        open={stepUp}
        locale={locale}
        copy={copy}
        onClose={() => setStepUp(false)}
        onVerified={() => {
          setStepUp(false);
          void query.refetch();
        }}
      />
    </>
  );
}
