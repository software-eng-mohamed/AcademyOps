'use client';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import styles from './academy-form-styles';
import { ErrorNotice } from './academy-ui';

import type { AcademyActionModel } from './use-academy-action';

export function AcademyIdentityReview({ model }: { model: AcademyActionModel }) {
  const {
    target,
    locale,
    copy,
    errors,
    setErrors,
    distinctConfirmed,
    setDistinctConfirmed,
    existingPersonId,
    setExistingPersonId,
    needsMatchReview,
    identitySignature,
    matchSignature,
    identityValid,
    matchQuery,
    currentMatches,
    mutation,
  } = model;
  return (
    <>
      {needsMatchReview && identityValid ? (
        <div className={styles.editor}>
          {matchSignature !== identitySignature || matchQuery.isFetching ? (
            <p role="status" className={styles.muted}>
              {copy.checkingMatches}
            </p>
          ) : matchQuery.isError ? (
            <ErrorNotice
              error={matchQuery.error}
              copy={copy}
              retry={() => void matchQuery.refetch()}
            />
          ) : currentMatches.length ? (
            <>
              <div>
                <h3 className="text-sm font-semibold">{copy.duplicates}</h3>
                <p className={styles.muted}>{copy.duplicateNotice}</p>
              </div>
              {currentMatches.map((candidate) => (
                <div key={candidate.personId} className={styles.relatedItem}>
                  <div>
                    <strong>{candidate.name || copy.none}</strong>
                    <p className={styles.muted} dir="ltr">
                      {candidate.publicId}
                    </p>
                  </div>
                  {target.resource === 'leads' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={mutation.isPending}
                      aria-pressed={existingPersonId === candidate.personId}
                      onClick={() => {
                        setExistingPersonId(candidate.personId);
                        setDistinctConfirmed(false);
                        setErrors((old) => ({ ...old, matches: '' }));
                      }}
                    >
                      {copy.useExistingPerson}
                    </Button>
                  ) : (
                    <a
                      href={`/${locale}/students?record=${encodeURIComponent(candidate.personId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 underline"
                    >
                      {copy.view}
                    </a>
                  )}
                </div>
              ))}
              {existingPersonId ? (
                <div>
                  <p className={styles.muted}>{copy.usingExistingPerson}</p>
                  <Button type="button" variant="ghost" onClick={() => setExistingPersonId('')}>
                    {copy.clearExistingPerson}
                  </Button>
                </div>
              ) : (
                <Checkbox
                  isSelected={distinctConfirmed}
                  isDisabled={mutation.isPending}
                  onChange={(checked) => {
                    setDistinctConfirmed(checked);
                    setErrors((old) => ({ ...old, matches: '' }));
                  }}
                >
                  {copy.confirmDistinct}
                </Checkbox>
              )}
            </>
          ) : null}
          {errors.matches ? (
            <p role="alert" className={styles.validation}>
              {errors.matches}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
