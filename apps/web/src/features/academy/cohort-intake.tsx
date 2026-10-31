'use client';

import { AcademyMeter } from '@academyops/ui/academy';
import { type AcademyRecord, textValue } from '@/api/academy/models';
import type { AcademyCopy } from '@/i18n/academy-copy';
import { StatusPill } from './academy-ui';

export function CohortStatus({ row, copy }: { row: AcademyRecord; copy: AcademyCopy }) {
  return <StatusPill status={textValue(row.data.intakeStatus) || row.status} copy={copy} />;
}

export function CohortIntakeProgress({
  row,
  copy,
  showHint = false,
}: {
  row: AcademyRecord;
  copy: AcademyCopy;
  showHint?: boolean;
}) {
  const capacity = row.data.capacity;
  const confirmed = row.data.confirmedEnrollmentCount;
  const valid =
    typeof capacity === 'number' &&
    Number.isFinite(capacity) &&
    capacity > 0 &&
    typeof confirmed === 'number' &&
    Number.isFinite(confirmed) &&
    confirmed >= 0;
  return (
    <div className="mt-4 grid gap-3">
      {valid ? (
        <AcademyMeter
          value={Math.min(confirmed, capacity)}
          maxValue={capacity}
          aria-label={copy.cohortIntakeProgress}
          className="grid gap-2"
        >
          <div className="flex justify-between gap-2 text-xs text-ink-muted">
            <span>{copy.cohortIntakeProgress}</span>
            <AcademyMeter.Output />
          </div>
          <AcademyMeter.Track className="relative h-1.5 overflow-hidden rounded-full bg-brand-soft">
            <AcademyMeter.Fill className="absolute start-0 top-0 h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" />
          </AcademyMeter.Track>
        </AcademyMeter>
      ) : null}
      {showHint ? (
        <div className="grid gap-2 text-sm text-ink-muted">
          <p>{copy.cohortIntakeHint}</p>
          {row.status === 'DRAFT' || row.data.intakeStatus === 'TARGET_REQUIRED' ? (
            <p>{copy.cohortCollectionHint}</p>
          ) : row.data.intakeStatus === 'READY_TO_START' ? (
            <p>{copy.cohortStartHint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
