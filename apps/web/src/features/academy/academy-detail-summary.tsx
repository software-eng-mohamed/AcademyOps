'use client';

import { type AcademyResource, field, records, textValue } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import { hasStaffPermission as hasPermission, staffScopes } from '@/features/dashboard/navigation';
import { academyLabel } from '@/i18n/academy-copy';
import styles from './academy-detail-styles';
import { formatAcademyDate } from './academy-ui';
import { CohortIntakeProgress } from './cohort-intake';

const detailFields: Partial<Record<AcademyResource, string[]>> = {
  leads: ['source', 'nextActionAt', 'createdAt', 'updatedAt'],
  students: ['publicId', 'birthDate', 'gender', 'createdAt'],
  registrations: ['email', 'phone', 'submittedAt', 'reviewedAt', 'rejectionReason'],
  enrollments: ['program.name', 'cohort.name', 'kind', 'createdAt', 'activatedAt', 'completedAt'],
  programs: ['code', 'createdAt', 'updatedAt'],
  cohorts: [
    'code',
    'program.name',
    'programVersion.version',
    'startsOn',
    'endsOn',
    'capacity',
    'confirmedEnrollmentCount',
    'pendingEnrollmentCount',
    'postponedEnrollmentCount',
    'remainingEnrollmentCount',
    'scheduledSessionCount',
  ],
  rooms: ['code', 'capacity', 'scheduledSessions', 'cohortCount'],
  trainers: ['scheduledSessions', 'cohortCount', 'biographyEn', 'biographyAr'],
  modules: ['code', 'createdAt'],
  stages: ['code', 'ordinal'],
  versions: ['version', 'effectiveFrom', 'effectiveTo'],
};
const fieldLabels: Record<string, string> = {
  'program.name': 'program',
  'cohort.name': 'cohortId',
  'programVersion.version': 'version',
  scheduledSessionCount: 'scheduledSessions',
};

import type { AcademyDetailModel } from './academy-detail-model';

export function AcademyDetailSummary({ model }: { model: AcademyDetailModel }) {
  const { detail, resource, user, locale, copy, actions, onAction } = model;
  return (
    <>
      <section className={styles.detailSection}>
        <h3>{copy.details}</h3>
        <dl className={styles.facts}>
          {(detailFields[resource] ?? []).map((key) => {
            const value = field(detail.data, key);
            const date = /At$|On$|Date$|^effective/.test(key);
            const formatted = date
              ? formatAcademyDate(value, locale, copy.none)
              : textValue(value) || copy.none;
            return (
              <div key={key}>
                <dt>
                  {resource === 'cohorts' && key === 'capacity'
                    ? copy.cohortTarget
                    : academyLabel(copy, fieldLabels[key] ?? key)}
                </dt>
                <dd dir={['email', 'phone', 'code'].includes(key) ? 'ltr' : undefined}>
                  {['kind', 'gender'].includes(key) ? academyLabel(copy, formatted) : formatted}
                </dd>
              </div>
            );
          })}
        </dl>
        {resource === 'cohorts' ? <CohortIntakeProgress row={detail} copy={copy} showHint /> : null}
      </section>
      {actions.length ? (
        <section className={styles.detailSection}>
          <h3>{copy.actions}</h3>
          <div className={styles.inlineActions}>
            {actions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={
                  ['archive', 'cancelCohort', 'merge', 'reject'].includes(action)
                    ? 'ghost'
                    : 'secondary'
                }
                size="small"
                onClick={() => onAction({ resource, action, row: detail })}
              >
                {resource === 'cohorts' && action === 'plan'
                  ? copy.openIntake
                  : resource === 'cohorts' && action === 'activate'
                    ? copy.startCohort
                    : academyLabel(copy, action)}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      {resource === 'leads' ||
      (resource === 'students' &&
        hasPermission(user, 'students.read_contact', staffScopes(user))) ? (
        <section className={styles.detailSection}>
          <h3>{copy.contacts}</h3>
          <div className={styles.related}>
            {records(detail.data.contacts).length ? (
              records(detail.data.contacts).map((item, index) => (
                <div className={styles.relatedItem} key={textValue(item.id) || index}>
                  <span className={styles.muted}>
                    {academyLabel(copy, textValue(item.type))}
                    {item.isPrimary ? ` Â· ${copy.isPrimary}` : ''}
                  </span>
                  <span dir="ltr">{textValue(item.rawValue)}</span>
                </div>
              ))
            ) : (
              <p className={styles.muted}>{copy.empty}</p>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
