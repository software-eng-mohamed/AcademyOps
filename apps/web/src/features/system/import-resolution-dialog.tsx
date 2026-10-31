'use client';

import { Field, Textarea } from '@academyops/ui';

import { useId, useState } from 'react';
import { record, records } from '@/api/academy/models';
import { resolveImportIssue } from '@/api/system/commands';

import { Button } from '@/components/base/buttons/button';

import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import { SystemCommandDialog } from './command-dialog';
import type { SystemRecord } from './config';
import { ImportCorrectionFields, prepareImportCorrectionValues } from './import-correction-fields';

import { StructuredValues, SystemSelect } from './system-ui';
export function ResolveIssueDialog({
  batchId,
  issue,
  userId,
  locale,
  onClose,
}: {
  batchId: string;
  issue: SystemRecord;
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const row = record(issue.row);
  const candidates = records(issue.candidates);
  const isIdentity = issue.code === 'PERSON_IDENTITY_REVIEW_REQUIRED';
  const [values, setValues] = useState(() =>
    prepareImportCorrectionValues(record(row.normalizedValues)),
  );
  const [decision, setDecision] = useState<'CORRECT' | 'EXCLUDE'>('CORRECT');
  const [mappingAction, setMappingAction] = useState<'MATCH_EXISTING' | 'CREATE_NEW'>(
    candidates.length ? 'MATCH_EXISTING' : 'CREATE_NEW',
  );
  const [personId, setPersonId] = useState(String(candidates[0]?.personId ?? ''));
  const [note, setNote] = useState('');
  const id = useId();
  const t = (key: string) => systemText(locale, key);
  return (
    <SystemCommandDialog
      title={t('resolve')}
      description={t('resolveHint')}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({
        batchId,
        issue: issue.id,
        rowHash: row.rowHash,
        issueCode: issue.code,
        values,
        decision,
        mappingAction,
        personId,
        note,
      })}
      submit={() =>
        resolveImportIssue(batchId, issue.id, {
          schemaVersion: 'plg-import-correction/v1',
          decision,
          expectedRowHash: String(row.rowHash),
          expectedIssueCode: String(issue.code),
          expectedIssueVersion: Number(record(issue.details).ruleVersion) || 1,
          ...(decision === 'CORRECT'
            ? {
                correction: isIdentity
                  ? mappingAction === 'MATCH_EXISTING'
                    ? { kind: 'PERSON_MAPPING', action: mappingAction, personId }
                    : { kind: 'PERSON_MAPPING', action: mappingAction }
                  : { kind: 'ROW_VALUES', values },
              }
            : {}),
          note,
        })
      }
      validate={() =>
        note.trim().length >= 3 &&
        note.trim().length <= 1000 &&
        (decision === 'EXCLUDE' ||
          (isIdentity
            ? mappingAction === 'CREATE_NEW' || Boolean(personId)
            : Object.keys(values).length > 0))
      }
      onClose={onClose}
    >
      <SystemSelect
        label={t('decision')}
        value={decision}
        options={['CORRECT', 'EXCLUDE']}
        onChange={(next) => setDecision(next === 'EXCLUDE' ? 'EXCLUDE' : 'CORRECT')}
        locale={locale}
      />
      {decision === 'CORRECT' && isIdentity ? (
        <fieldset className="grid gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{t('personMapping')}</legend>
          <SystemSelect
            label={t('mappingAction')}
            value={mappingAction}
            options={candidates.length ? ['MATCH_EXISTING', 'CREATE_NEW'] : ['CREATE_NEW']}
            onChange={(next) =>
              setMappingAction(next === 'MATCH_EXISTING' ? 'MATCH_EXISTING' : 'CREATE_NEW')
            }
            locale={locale}
          />
          {mappingAction === 'MATCH_EXISTING' ? (
            <div className="grid gap-2">
              {candidates.map((candidate) => {
                const person = record(candidate.person);
                const id = String(candidate.personId);
                return (
                  <Button
                    key={id}
                    variant={personId === id ? 'primary' : 'secondary'}
                    onClick={() => setPersonId(id)}
                  >
                    {String(person.name || person.publicId || id)} · {t('matchScore')}{' '}
                    {String(candidate.score)}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </fieldset>
      ) : decision === 'CORRECT' ? (
        <ImportCorrectionFields value={values} onChange={setValues} locale={locale} />
      ) : null}
      <Field htmlFor={id} label={t('note')}>
        <Textarea
          id={id}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
          minLength={3}
          maxLength={1000}
        />
      </Field>
      <details>
        <summary className="cursor-pointer text-sm text-brand">{t('rawValues')}</summary>
        <div className="mt-3">
          <StructuredValues value={row.rawValues} locale={locale} literal />
        </div>
      </details>
    </SystemCommandDialog>
  );
}
