'use client';
import { textValue } from '@/api/academy/models';
import { instantToCairoDateTimeLocal } from '@/lib/cairo-time';
import { type ActionTarget, type FormValues, getActionFields } from './actions';

export function initialActionValues(target: ActionTarget): FormValues {
  const result: FormValues = { kind: 'INDIVIDUAL', type: 'CALL' };
  for (const item of getActionFields(target)) {
    const value = target.row?.data[item.key];
    if (value === null || value === undefined) continue;
    let formatted = textValue(value);
    if (item.kind === 'datetime-local' && formatted) {
      if (Number.isFinite(Date.parse(formatted)))
        formatted = instantToCairoDateTimeLocal(formatted);
    } else if (item.kind === 'date') formatted = formatted.slice(0, 10);
    result[item.key] = formatted;
  }
  return result;
}
