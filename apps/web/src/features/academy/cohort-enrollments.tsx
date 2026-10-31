'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { academyKey, getAcademyPage } from '@/api/academy/queries';
import { Button } from '@/components/base/buttons/button';
import type { AcademyCopy } from '@/i18n/academy-copy';
import styles from './academy-detail-styles';
import { ErrorNotice, StatusPill } from './academy-ui';
import type { DetailSelection } from './detail-drawer';
export function CohortEnrollments({
  id,
  userId,
  copy,
  onInspect,
}: {
  id: string;
  userId: string;
  copy: AcademyCopy;
  onInspect: (selection: DetailSelection) => void;
}) {
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: [...academyKey(userId), 'cohort-enrollments', id, cursor],
    queryFn: ({ signal }) =>
      getAcademyPage('enrollments', { cohortId: id, ...(cursor ? { cursor } : {}) }, signal),
  });
  return (
    <section className={styles.detailSection}>
      <h3>{copy.groupStudents}</h3>
      {query.isError ? (
        <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <>
          <div className={styles.related}>
            {query.data.items.map((item) => (
              <div className={styles.relatedItem} key={item.id}>
                <strong>{item.name}</strong>
                <StatusPill status={item.status} copy={copy} />
                <Button
                  variant="ghost"
                  type="button"
                  size="small"
                  onClick={() => onInspect({ resource: 'enrollments', row: item })}
                >
                  {copy.view}
                </Button>
              </div>
            ))}
          </div>
          {!query.data.items.length ? <p className={styles.muted}>{copy.empty}</p> : null}
          <div className={`${styles.inlineActions} mt-3`}>
            {cursor ? (
              <Button variant="ghost" onClick={() => setCursor(undefined)}>
                {copy.reset}
              </Button>
            ) : null}
            {query.data.nextCursor ? (
              <Button
                variant="secondary"
                onClick={() => setCursor(query.data.nextCursor ?? undefined)}
              >
                {copy.next}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
