'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FieldControlContext } from './field';
import { IconButton } from './icon-button';
import { cn } from './lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './overlay';

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const valueFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const accessibleFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'full' });
const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function parseDate(value: string | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return date;
}

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(left: Date | null, right: Date) {
  return Boolean(left && dateValue(left) === dateValue(right));
}

function calendarDays(month: Date) {
  const first = monthStart(month);
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

export function DatePicker({
  allowClear = true,
  className,
  disabled,
  id,
  max,
  min,
  name,
  onBlur,
  onValueChange,
  placeholder = 'Select date',
  value,
}: {
  allowClear?: boolean;
  className?: string | undefined;
  disabled?: boolean | undefined;
  id: string;
  max?: string | undefined;
  min?: string | undefined;
  name?: string | undefined;
  onBlur?: (() => void) | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string | undefined;
  value: string;
}) {
  const field = useContext(FieldControlContext);
  const selected = parseDate(value);
  const minDate = parseDate(min);
  const maxDate = parseDate(max);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(selected ?? today));
  const gridRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (open) setViewMonth(monthStart(parseDate(value) ?? today));
  }, [open, today, value]);

  const days = useMemo(() => calendarDays(viewMonth), [viewMonth]);
  const isDisabled = (date: Date) =>
    Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
  const focusDate =
    days.find((date) => sameDay(selected, date)) ??
    days.find((date) => sameDay(today, date)) ??
    days.find((date) => date.getMonth() === viewMonth.getMonth() && !isDisabled(date)) ??
    days[0];

  function choose(date: Date) {
    if (isDisabled(date)) return;
    onValueChange(dateValue(date));
    setOpen(false);
  }

  function focusDay(target: Date) {
    const targetValue = dateValue(target);
    const targetMonth = monthStart(target);
    if (targetMonth.getTime() !== viewMonth.getTime()) {
      setViewMonth(targetMonth);
      requestAnimationFrame(() =>
        gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${targetValue}"]`)?.focus(),
      );
      return;
    }
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${targetValue}"]`)?.focus();
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-describedby={field.describedBy}
          data-invalid={field.invalid || undefined}
          className={cn(
            'flex min-h-[38px] w-full items-center justify-between gap-3 rounded-[9px] border border-border bg-surface px-3.5 text-start text-sm text-ink shadow-control outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-border-strong focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/10 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-65 motion-reduce:transition-none',
            !selected && 'text-ink-muted',
            className,
          )}
          disabled={disabled}
          id={id}
          onBlur={onBlur}
          type="button"
        >
          <span>{selected ? valueFormatter.format(selected) : placeholder}</span>
          <CalendarDays
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted"
            strokeWidth={1.8}
          />
        </button>
      </PopoverTrigger>
      {name ? <input name={name} readOnly type="hidden" value={value} /> : null}
      <PopoverContent align="start" className="w-72 p-3" sideOffset={6}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm font-semibold text-ink">
            {monthFormatter.format(viewMonth)}
          </p>
          <div className="flex items-center gap-1">
            <IconButton
              className="size-8"
              label="Previous month"
              onClick={() =>
                setViewMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              tone="ghost"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </IconButton>
            <IconButton
              className="size-8"
              label="Next month"
              onClick={() =>
                setViewMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              tone="ghost"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
        </div>
        <div aria-hidden="true" className="grid grid-cols-7">
          {weekDays.map((day) => (
            <span
              className="grid h-7 place-items-center text-[10px] font-semibold text-ink-muted"
              key={day}
            >
              {day}
            </span>
          ))}
        </div>
        <fieldset
          aria-label="Calendar days"
          className="m-0 grid min-w-0 grid-cols-7 gap-y-0.5 border-0 p-0"
          ref={gridRef}
        >
          {days.map((date) => {
            const dateString = dateValue(date);
            const active = sameDay(selected, date);
            const current = sameDay(today, date);
            const outside = date.getMonth() !== viewMonth.getMonth();
            const unavailable = isDisabled(date);
            return (
              <button
                aria-label={accessibleFormatter.format(date)}
                aria-pressed={active}
                className={cn(
                  'grid size-8 place-items-center justify-self-center rounded-sm text-xs font-medium text-ink outline-none transition-colors hover:bg-brand-soft hover:text-brand-strong focus-visible:ring-2 focus-visible:ring-focus/25 motion-reduce:transition-none',
                  outside && 'text-ink-muted/55',
                  current && !active && 'font-semibold text-brand ring-1 ring-brand/20',
                  active &&
                    'bg-brand text-primary-foreground hover:bg-brand hover:text-primary-foreground',
                  unavailable &&
                    'cursor-not-allowed text-ink-muted/30 hover:bg-transparent hover:text-ink-muted/30',
                )}
                data-date={dateString}
                disabled={unavailable}
                key={dateString}
                onClick={() => choose(date)}
                onKeyDown={(event) => {
                  const offsets: Record<string, number> = {
                    ArrowDown: 7,
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                  };
                  const offset = offsets[event.key];
                  if (!offset) return;
                  event.preventDefault();
                  const target = new Date(date);
                  target.setDate(target.getDate() + offset);
                  focusDay(target);
                }}
                tabIndex={focusDate && sameDay(focusDate, date) ? 0 : -1}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </fieldset>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
          <button
            className="rounded-sm px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20 disabled:opacity-40"
            disabled={!allowClear || !value}
            onClick={() => {
              onValueChange('');
              setOpen(false);
            }}
            type="button"
          >
            Clear
          </button>
          <button
            className="rounded-sm px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20"
            onClick={() => {
              setViewMonth(monthStart(today));
              if (!isDisabled(today)) choose(today);
            }}
            type="button"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
