'use client';
import { normalizeRecord, record, records, textValue } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import { hasStaffPermission as hasPermission } from '@/features/dashboard/navigation';
import { AttendancePolicies } from '@/features/management/attendance-policies';
import type { AcademyDetailModel } from './academy-detail-model';
import styles from './academy-detail-styles';
import { formatAcademyDate, StatusPill } from './academy-ui';
import { CohortEnrollments } from './cohort-enrollments';

export function AcademyDetailRelations({ model }: { model: AcademyDetailModel }) {
  const { detail, resource, user, locale, copy, onInspect } = model;
  return (
    <>
      {resource === 'programs' ? (
        <section className={styles.detailSection}>
          <h3>{copy.versions}</h3>
          <div className={styles.related}>
            {records(detail.data.versions).length ? (
              records(detail.data.versions).map((item) => (
                <div className={styles.relatedItem} key={textValue(item.id)}>
                  <div>
                    <strong>
                      {copy.versionLabel.replace('{version}', textValue(item.version))}
                    </strong>
                    <div>
                      <small>{formatAcademyDate(item.effectiveFrom, locale, copy.none)}</small>
                    </div>
                  </div>
                  <StatusPill status={textValue(item.status)} copy={copy} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() =>
                      onInspect({
                        resource: 'versions',
                        row: normalizeRecord('versions', item),
                      })
                    }
                  >
                    {copy.view}
                  </Button>
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
      {resource === 'versions' || resource === 'cohorts' ? (
        <section className={styles.detailSection}>
          <h3>{copy.curriculum}</h3>
          <div className={styles.related}>
            {records(detail.data.modules).length ? (
              records(detail.data.modules).map((item) => (
                <div key={textValue(item.id)} className={styles.relatedItem}>
                  <strong>
                    {textValue(item.ordinal)}. {textValue(record(item.module).name)}
                  </strong>
                  {item.required ? <small>{copy.requiredModule}</small> : null}
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
      {resource === 'students' ? (
        <section className={styles.detailSection}>
          <h3>{copy.enrollments}</h3>
          <div className={styles.related}>
            {records(detail.data.enrollments).length ? (
              records(detail.data.enrollments).map((item) => (
                <div className={styles.relatedItem} key={textValue(item.id)}>
                  <div>
                    <strong>{textValue(record(item.program).name) || copy.program}</strong>
                    <div>
                      <small>{textValue(record(item.cohort).name)}</small>
                    </div>
                  </div>
                  <StatusPill status={textValue(item.state)} copy={copy} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() =>
                      onInspect({
                        resource: 'enrollments',
                        row: normalizeRecord('enrollments', {
                          ...item,
                          student: { name: detail.name, publicId: detail.code },
                        }),
                      })
                    }
                  >
                    {copy.view}
                  </Button>
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
      {resource === 'cohorts' ? (
        <CohortEnrollments id={detail.id} userId={user.id} copy={copy} onInspect={onInspect} />
      ) : null}
      {['versions', 'cohorts'].includes(resource) &&
      hasPermission(user, 'academic.programs.manage', ['O']) ? (
        <AttendancePolicies
          key={detail.id}
          programVersionId={
            resource === 'versions' ? detail.id : textValue(detail.data.programVersionId)
          }
          {...(resource === 'cohorts' ? { cohortId: detail.id } : {})}
          locale={locale}
          userId={user.id}
        />
      ) : null}
    </>
  );
}
