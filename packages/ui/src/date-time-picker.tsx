'use client';

import { useMemo } from 'react';
import { DatePicker } from './date-picker';
import { cn } from './lib/cn';
import { Select } from './select';

function splitDateTime(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return { date: match?.[1] ?? '', time: match?.[2] ?? '' };
}

function compose(date: string, time: string) {
  if (!date) return '';
  return `${date}T${time || '09:00'}`;
}

export function DateTimePicker({
  className,
  disabled,
  id,
  max,
  min,
  name,
  onBlur,
  onValueChange,
  value,
}: {
  className?: string;
  disabled?: boolean;
  id: string;
  max?: string;
  min?: string;
  name?: string;
  onBlur?: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const parts = splitDateTime(value);
  const timeOptions = useMemo(() => {
    const options = Array.from({ length: 96 }, (_, index) => {
      const hour = String(Math.floor(index / 4)).padStart(2, '0');
      const minute = String((index % 4) * 15).padStart(2, '0');
      const option = `${hour}:${minute}`;
      return { label: option, value: option };
    });
    if (parts.time && !options.some(({ value: option }) => option === parts.time)) {
      options.push({ label: parts.time, value: parts.time });
      options.sort((left, right) => left.value.localeCompare(right.value));
    }
    return options;
  }, [parts.time]);
  const minParts = splitDateTime(min ?? '');
  const maxParts = splitDateTime(max ?? '');

  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_7rem] gap-2', className)}>
      <DatePicker
        {...(disabled ? { disabled: true } : {})}
        id={id}
        {...(maxParts.date ? { max: maxParts.date } : {})}
        {...(minParts.date ? { min: minParts.date } : {})}
        onBlur={onBlur}
        onValueChange={(date) => onValueChange(compose(date, parts.time))}
        placeholder="Select date"
        value={parts.date}
      />
      <Select
        ariaLabel="Time"
        className="w-full font-mono tabular-nums"
        {...(disabled ? { disabled: true } : {})}
        id={`${id}-time`}
        onValueChange={(time) => onValueChange(compose(parts.date, time ?? ''))}
        options={timeOptions}
        placeholder="Time"
        value={parts.time || null}
      />
      {name ? <input name={name} readOnly type="hidden" value={value} /> : null}
    </div>
  );
}
