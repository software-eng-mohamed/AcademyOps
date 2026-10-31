import type { AcademyCopy } from '@/i18n/academy-copy';
import { isCairoWallTime } from '@/lib/cairo-time';
import { getActionFields } from './action-fields';
import type { ActionTarget, ContactEntry, CurriculumEntry, FormValues } from './actions';

export function validateAction(
  target: ActionTarget,
  values: FormValues,
  copy: AcademyCopy,
  curriculum: CurriculumEntry[],
  contacts: ContactEntry[],
  confirmMerge: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of getActionFields(target)) {
    const value = values[item.key]?.trim() ?? '';
    if (!value) {
      if (!item.optional) errors[item.key] = copy.required;
      continue;
    }
    if (item.min && value.length < item.min) errors[item.key] = copy.tooShort;
    if (item.max && value.length > item.max) errors[item.key] = copy.tooLong;
    if (item.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      errors[item.key] = copy.emailInvalid;
    if (item.kind === 'number' && (!Number.isSafeInteger(Number(value)) || Number(value) < 1))
      errors[item.key] = copy.numberInvalid;
    if (item.kind === 'date' && !Number.isFinite(Date.parse(value)))
      errors[item.key] = copy.dateInvalid;
    if (item.kind === 'datetime-local' && !isCairoWallTime(value))
      errors[item.key] = copy.dateInvalid;
    if (item.choices && !item.choices.includes(value)) errors[item.key] = copy.choiceMissing;
  }
  if (
    values.code &&
    !(
      target.resource === 'cohorts'
        ? /^[A-Za-z0-9][A-Za-z0-9_/-]{1,79}$/
        : /^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/
    ).test(values.code)
  )
    errors.code = copy.codeInvalid;
  if (values.startsOn && values.endsOn && values.endsOn < values.startsOn)
    errors.endsOn = copy.datesInvalid;
  if (
    target.action === 'approve' &&
    !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{9,79}$/.test(values.verificationReference ?? '')
  )
    errors.verificationReference = copy.proofInvalid;
  if (values.kind === 'CORPORATE' && !values.billingAccountId)
    errors.billingAccountId = copy.required;
  if (values.retakeCohortId && !values.targetCohortModuleId)
    errors.targetCohortModuleId = copy.required;
  if (
    ['createVersion', 'replaceCurriculum'].includes(target.action) &&
    (!curriculum.length ||
      curriculum.some((item) => !item.moduleId) ||
      new Set(curriculum.map((item) => item.moduleId)).size !== curriculum.length)
  )
    errors.curriculum = copy.moduleRequired;
  if (target.action === 'editContacts') {
    const valid = contacts.every((item) =>
      item.type === 'EMAIL'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.value)
        : item.value.trim().length >= 5,
    );
    if (
      !valid ||
      ['EMAIL', 'PHONE'].some(
        (type) => contacts.filter((item) => item.type === type && item.isPrimary).length > 1,
      )
    )
      errors.contacts = copy.contactInvalid;
  }
  if (target.action === 'merge' && (!confirmMerge || values.targetPersonId === target.row?.id))
    errors.targetPersonId = copy.confirmMerge;
  return errors;
}
