'use client';

import { isPlgApiError } from '@academyops/api-client/http';
import { useToast } from '@academyops/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { executeAcademyAction } from '@/api/academy/commands';
import { records, textValue } from '@/api/academy/models';
import { academyKey, findAcademyMatches } from '@/api/academy/queries';
import type { AcademyCopy } from '@/i18n/academy-copy';
import type { Locale } from '@/lib/locales';
import { initialActionValues } from './academy-action-values';
import {
  type ActionTarget,
  type ContactEntry,
  type CurriculumEntry,
  type FormValues,
  getActionFields,
  validateAction,
} from './actions';
import { isStepUpRequired } from './step-up-dialog';
export function useAcademyAction({
  target,
  userId,
  branchId,
  canEditSensitive = false,
  locale,
  copy,
  onClose,
  onSaved,
}: {
  target: ActionTarget;
  userId: string;
  branchId?: string;
  canEditSensitive?: boolean;
  locale: Locale;
  copy: AcademyCopy;
  onClose: () => void;
  onSaved: (result: unknown) => Promise<void>;
}) {
  const formId = useId();
  const toast = useToast();
  const [values, setValues] = useState(() => initialActionValues(target));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const focusValidation = useRef(false);
  useEffect(() => {
    if (!focusValidation.current) return;
    focusValidation.current = false;
    if (!Object.values(errors).some(Boolean)) return;
    const form = formRef.current;
    const invalid = form?.querySelector<HTMLElement>(
      'input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]',
    );
    (invalid ?? form?.querySelector<HTMLElement>('[data-validation-summary]'))?.focus();
  }, [errors]);
  const [confirmed, setConfirmed] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [distinctConfirmed, setDistinctConfirmed] = useState(false);
  const [existingPersonId, setExistingPersonId] = useState('');
  const needsMatchReview =
    target.action === 'create' && ['students', 'leads'].includes(target.resource);
  const identitySignature = JSON.stringify({
    name: values.name?.trim() ?? '',
    email: values.email?.trim() ?? '',
    phone: values.phone?.trim() ?? '',
    legacyCode: values.legacyCode?.trim() ?? '',
  });
  const [matchSignature, setMatchSignature] = useState(identitySignature);
  useEffect(() => {
    setDistinctConfirmed(false);
    setExistingPersonId('');
    const timer = setTimeout(() => setMatchSignature(identitySignature), 350);
    return () => clearTimeout(timer);
  }, [identitySignature]);
  const identityValid =
    (values.name?.trim().length ?? 0) >= 2 &&
    (!values.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) &&
    (!values.phone || values.phone.trim().length >= 5);
  const matchQuery = useQuery({
    queryKey: [...academyKey(userId), 'match-candidates', matchSignature],
    queryFn: ({ signal }) => findAcademyMatches(JSON.parse(matchSignature) as FormValues, signal),
    enabled: needsMatchReview && identityValid && matchSignature === identitySignature,
    retry: false,
    staleTime: 0,
  });
  const currentMatches = matchSignature === identitySignature ? (matchQuery.data ?? []) : [];
  const candidateSignature = currentMatches
    .map((item) => item.personId)
    .sort()
    .join(',');
  const previousCandidates = useRef(candidateSignature);
  useEffect(() => {
    if (previousCandidates.current !== candidateSignature) {
      previousCandidates.current = candidateSignature;
      setDistinctConfirmed(false);
    }
  }, [candidateSignature]);
  const [curriculum, setCurriculum] = useState<Array<CurriculumEntry & { key: string }>>(() =>
    records(target.row?.data.modules).map((item) => ({
      key: textValue(item.id) || crypto.randomUUID(),
      moduleId: textValue(item.moduleId),
      required: item.required !== false,
    })),
  );
  const [contacts, setContacts] = useState<Array<ContactEntry & { key: string }>>(() =>
    records(target.row?.data.contacts)
      .filter((item) => item.type === 'EMAIL' || item.type === 'PHONE')
      .map((item) => ({
        key: textValue(item.id) || crypto.randomUUID(),
        type: item.type === 'EMAIL' ? 'EMAIL' : 'PHONE',
        value: textValue(item.rawValue),
        isPrimary: item.isPrimary === true,
      })),
  );
  const attempt = useRef<{ signature: string; key: string } | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: executeAcademyAction,
    // Commands with a read/validate step are never repeated automatically.
    retry: false,
    onSuccess: async (result) => {
      toast.add({ title: target.action === 'create' ? copy.created : copy.saved, type: 'success' });
      await onSaved(result);
      onClose();
    },
    onError: (error) => {
      if (isPlgApiError(error)) {
        focusValidation.current = true;
        setErrors(
          Object.fromEntries(
            (error.payload.fieldErrors ?? []).map((item) => [
              item.field.replace(/^newPerson\./, ''),
              copy.invalid,
            ]),
          ),
        );
      }
    },
  });
  const restrictSensitive =
    target.resource === 'students' && target.action === 'edit' && !canEditSensitive;
  const fields = getActionFields(target).filter(
    (field) => !restrictSensitive || !['birthDate', 'gender'].includes(field.key),
  );
  const isCurriculum = target.action === 'createVersion' || target.action === 'replaceCurriculum';
  const setValue = (key: string, value: string) => {
    setValues((old) => ({
      ...old,
      [key]: value,
      ...(key === 'programId' ? { programVersionId: '' } : {}),
      ...(['retakeCohortId', 'programVersionModuleId'].includes(key)
        ? { targetCohortModuleId: '' }
        : {}),
    }));
    setErrors((old) => ({ ...old, [key]: '' }));
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const nextErrors = validateAction(target, values, copy, curriculum, contacts, confirmed);
    focusValidation.current = Object.keys(nextErrors).length > 0;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (needsMatchReview && (matchSignature !== identitySignature || !matchQuery.isSuccess)) {
      setErrors({ matches: copy.checkingMatches });
      return;
    }
    if (needsMatchReview && currentMatches.length && !distinctConfirmed && !existingPersonId) {
      setErrors({ matches: copy.matchReviewRequired });
      return;
    }
    const confirmedDistinctPersonIds = distinctConfirmed
      ? currentMatches.map((item) => item.personId)
      : [];
    const submittedValues: FormValues = {
      ...values,
      ...(existingPersonId ? { personId: existingPersonId } : {}),
    };
    if (restrictSensitive) {
      delete submittedValues.birthDate;
      delete submittedValues.gender;
    }
    const signature = JSON.stringify({
      target,
      values: submittedValues,
      curriculum,
      contacts,
      confirmedDistinctPersonIds,
    });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    mutation.mutate({
      target,
      values: submittedValues,
      ...(branchId ? { branchId } : {}),
      idempotencyKey: attempt.current.key,
      curriculum,
      contacts,
      confirmedDistinctPersonIds,
    });
  }
  const notice =
    target.action === 'approve'
      ? copy.verificationNotice
      : target.action === 'merge'
        ? copy.mergeNotice
        : target.action === 'requestCancellation'
          ? copy.cancellationNotice
          : isCurriculum
            ? copy.curriculumHelp
            : target.action === 'editContacts'
              ? copy.contactsHelp
              : fields.length
                ? copy.formHelp
                : copy.actionHelp;
  useEffect(() => {
    if (isStepUpRequired(mutation.error)) setStepUpOpen(true);
  }, [mutation.error]);
  return {
    target,
    userId,
    branchId,
    locale,
    copy,
    onClose,
    formId,
    values,
    errors,
    setErrors,
    formRef,
    confirmed,
    setConfirmed,
    stepUpOpen,
    setStepUpOpen,
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
    curriculum,
    setCurriculum,
    contacts,
    setContacts,
    mutation,
    fields,
    isCurriculum,
    setValue,
    submit,
    notice,
  };
}
export type AcademyActionModel = ReturnType<typeof useAcademyAction>;
