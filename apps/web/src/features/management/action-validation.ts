import { cairoWallTimeToIso, isCairoWallTime } from '@/lib/cairo-time';
import { actionFields, type FormValues } from './action-fields';
import type { ManagementAction } from './actions';
import { validInvoiceLines } from './invoice-values';
import { validSessionTrainers } from './session-trainer-values';

export function validateManagementAction(
  action: ManagementAction,
  values: FormValues,
): string | undefined {
  return Object.values(validateManagementFields(action, values))[0];
}

export function validateManagementFields(
  action: ManagementAction,
  values: FormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (
    ['createSession', 'reschedule'].includes(action) &&
    values.trainers !== undefined &&
    !validSessionTrainers(values.trainers)
  )
    errors.trainers = 'invalidTrainers';
  if (values.reason && values.reason.trim().length > 1000) errors.reason = 'reasonRequired';
  if (
    action === 'completeSession' &&
    values.note?.trim() &&
    (values.note.trim().length < 3 || values.note.trim().length > 1000)
  )
    errors.note = 'reasonRequired';
  if (
    action === 'createInvoice' &&
    values.invoiceLines !== undefined &&
    !validInvoiceLines(values.invoiceLines)
  )
    errors.invoiceLines = 'invalidInvoiceLines';
  for (const item of actionFields(action, values)) {
    const rawVal =
      values[item.name] ??
      (item.name === 'description' ? (values.descriptionEn ?? values.descriptionAr) : undefined);
    const strVal = typeof rawVal === 'string' ? rawVal.trim() : rawVal ? String(rawVal) : '';
    if (
      (item.required && !strVal) ||
      (item.options && !item.options.includes(values[item.name] ?? ''))
    )
      errors[item.name] = 'required';
  }
  if (values.reason !== undefined && values.reason.trim().length < 3 && !errors.reason)
    errors.reason = 'reasonRequired';
  for (const key of ['startsAt', 'endsAt', 'receivedAt']) {
    if (values[key] && !isCairoWallTime(values[key])) errors[key] = 'invalidDate';
  }
  if (
    values.startsAt &&
    values.endsAt &&
    !errors.startsAt &&
    !errors.endsAt &&
    Date.parse(cairoWallTimeToIso(values.endsAt)) <= Date.parse(cairoWallTimeToIso(values.startsAt))
  )
    errors.endsAt = 'invalidDate';
  for (const key of ['amount', 'quantity', 'unitAmount'])
    if (
      values[key] !== undefined &&
      (!/^\d+(\.\d{1,2})?$/.test(values[key] ?? '') || Number(values[key]) <= 0)
    )
      errors[key] ??= 'invalidAmount';
  if (
    values.taxAmount &&
    (!/^\d+(\.\d{1,2})?$/.test(values.taxAmount) || Number(values.taxAmount) < 0)
  )
    errors.taxAmount = 'invalidAmount';
  if (
    values.ordinal &&
    (!Number.isSafeInteger(Number(values.ordinal)) || Number(values.ordinal) < 1)
  )
    errors.ordinal = 'required';
  return errors;
}
