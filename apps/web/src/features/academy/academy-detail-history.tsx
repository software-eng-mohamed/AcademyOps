'use client';

import Link from 'next/link';
import { record, records, textValue } from '@/api/academy/models';
import { academyLabel } from '@/i18n/academy-copy';
import type { AcademyDetailModel } from './academy-detail-model';
import styles from './academy-detail-styles';
import { formatAcademyDateTime, StatusPill } from './academy-ui';

export function AcademyDetailHistory({ model }: { model: AcademyDetailModel }) {
  const { detail, resource, locale, copy, allEvents } = model;
  return (
    <>
      {resource === 'leads' ? (
        <section className={styles.detailSection}>
          <h3>{copy.activity}</h3>
          <div className={styles.timeline}>
            {records(detail.data.activities).length ? (
              records(detail.data.activities).map((item) => (
                <div className={styles.timelineItem} key={textValue(item.id)}>
                  <strong>{academyLabel(copy, textValue(item.type))}</strong>
                  <small>{formatAcademyDateTime(item.occurredAt, locale, copy.none)}</small>
                  <p>{textValue(record(item.data).note)}</p>
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
      {allEvents.length ? (
        <section className={styles.detailSection}>
          <h3>{copy.history}</h3>
          <div className={styles.timeline}>
            {allEvents.map((item) => (
              <div className={styles.timelineItem} key={textValue(item.id)}>
                <StatusPill status={textValue(item.toState || item.type)} copy={copy} />
                <small>{formatAcademyDateTime(item.occurredAt, locale, copy.none)}</small>
                {item.reason ? (
                  <p>
                    {item.reason === 'LEAD_CONVERSION'
                      ? copy.leadConversion
                      : textValue(item.reason)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {records(detail.data.possibleDuplicates).length ? (
        <section className={styles.detailSection}>
          <h3>{copy.duplicates}</h3>
          <p className={styles.muted}>{copy.duplicateNotice}</p>
          {records(detail.data.possibleDuplicates).map((item) => (
            <Link
              key={textValue(item.personId)}
              className="mt-2 block text-sm text-blue-500 underline"
              href={`/${locale}/students?record=${encodeURIComponent(textValue(item.personId))}`}
            >
              {textValue(item.name)} Â· {textValue(item.publicId)}
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}
