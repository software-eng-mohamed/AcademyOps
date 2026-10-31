'use client';

import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from './lib/cn';

const defaultPhases = [
  'Opening workspace',
  'Checking access',
  'Loading current records',
  'Preparing your view',
] as const;

export type ProgressiveLoaderProps = {
  className?: string;
  duration?: number;
  label?: string;
  loop?: boolean;
  onComplete?: () => void;
  phases?: readonly string[];
  progress?: number;
};

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function ProgressiveLoader({
  className,
  duration = 7,
  label = 'Loading AcademyOps workspace',
  loop = true,
  onComplete,
  phases = defaultPhases,
  progress,
}: ProgressiveLoaderProps) {
  const reducedMotion = useReducedMotion();
  const [internalProgress, setInternalProgress] = useState(0);
  const completionRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const isControlled = typeof progress === 'number';

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (isControlled) return;

    let frame = 0;
    let startedAt: number | undefined;
    const durationMs = Math.max(duration, 0.5) * 1000;

    const tick = (now: number) => {
      startedAt ??= now;
      const nextProgress = clampProgress(((now - startedAt) / durationMs) * 100);
      setInternalProgress(nextProgress);

      if (nextProgress >= 100) {
        onCompleteRef.current?.();
        if (!loop) return;
        startedAt = now;
        setInternalProgress(0);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, isControlled, loop]);

  const currentProgress = clampProgress(isControlled ? progress : internalProgress);

  useEffect(() => {
    if (!isControlled) return;
    if (currentProgress >= 100 && !completionRef.current) {
      completionRef.current = true;
      onCompleteRef.current?.();
    } else if (currentProgress < 100) {
      completionRef.current = false;
    }
  }, [currentProgress, isControlled]);

  let phase = 'Loading';
  if (phases.length) {
    const index = Math.min(phases.length - 1, Math.floor((currentProgress / 100) * phases.length));
    phase = phases[index] ?? phases[phases.length - 1] ?? 'Loading';
  }

  return (
    <div className={cn('w-full max-w-sm', className)}>
      <div className="mb-3 flex min-h-5 items-center justify-between gap-4">
        <AnimatePresence initial={false} mode="wait">
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className="text-[13px] font-semibold tracking-[-0.01em] text-ink"
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 3 }}
            key={phase}
            transition={{ duration: reducedMotion ? 0.01 : 0.12, ease: 'easeOut' }}
          >
            {phase}
          </m.p>
        </AnimatePresence>
        <span className="font-mono text-[10px] font-medium tabular-nums text-ink-muted">
          {Math.round(currentProgress)}%
        </span>
      </div>

      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(currentProgress)}
        aria-valuetext={`${phase}, ${Math.round(currentProgress)} percent`}
        className="relative h-2 overflow-hidden rounded-full border border-border bg-surface-subtle"
        role="progressbar"
      >
        <m.div
          animate={{ width: `${currentProgress}%` }}
          className="relative h-full min-w-px overflow-hidden rounded-full"
          initial={false}
          style={{
            background:
              'linear-gradient(90deg, var(--plg-color-brand), var(--plg-color-brand-bright))',
          }}
          transition={{
            duration: reducedMotion ? 0.01 : 0.16,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <span className="absolute inset-y-0 end-0 w-1 bg-accent" />
          {reducedMotion ? null : (
            <m.span
              animate={{ x: ['-120%', '320%'] }}
              className="absolute inset-y-0 start-0 w-10 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              transition={{ duration: 1.35, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
            />
          )}
        </m.div>
      </div>

      <p className="mt-2 text-[10.5px] leading-4 text-ink-muted">
        Your permissions and current branch scope stay protected while this view loads.
      </p>
    </div>
  );
}
