'use client';

import { textValue } from '@/api/academy/models';

import styles from '@/features/academy/academy-detail-styles';
import { AcademyTable } from '@/features/academy/academy-table';

import { ManagementValue } from './presentation';
import type { useManagementDetailState } from './use-management-detail-state';
export function ManagementRelatedRecords({
  model,
}: {
  model: ReturnType<typeof useManagementDetailState>;
}) {
  const { locale, t, related, relatedItems, relatedFields } = model;
  return (
    <>
      {relatedItems.length ? (
        <section className={styles.detailSection}>
          <h3>{t(related)}</h3>
          <AcademyTable
            rows={relatedItems.map((item, index) => ({
              ...item,
              id: textValue(item.id) || String(index),
            }))}
            columns={relatedFields.map((name) => ({
              id: name,
              header: t(name),
              cell: (item) => <ManagementValue data={item} name={name} locale={locale} />,
            }))}
            label={t(related)}
            busy={false}
          />
        </section>
      ) : null}
    </>
  );
}
