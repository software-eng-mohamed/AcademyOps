'use client';

import { useEffect, useState } from 'react';
import { AcademyOpsMark } from '@/components/brand/academyops-mark';
import { markDashboardInitialLoaderSeen } from '@/features/dashboard/initial-loader-preference';

const LOADER_VISIBLE_MS = 650;
const LOADER_EXIT_MS = 180;
const REDUCED_MOTION_VISIBLE_MS = 180;

export function DashboardInitialLoader({ label, show }: { label: string; show: boolean }) {
  const [visible, setVisible] = useState(show);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    markDashboardInitialLoaderSeen();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visibleDuration = reduceMotion ? REDUCED_MOTION_VISIBLE_MS : LOADER_VISIBLE_MS;
    const leaveTimer = window.setTimeout(() => setLeaving(true), visibleDuration);
    const hideTimer = window.setTimeout(
      () => setVisible(false),
      visibleDuration + (reduceMotion ? 0 : LOADER_EXIT_MS),
    );
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [show]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      aria-label={label}
      className={`fixed inset-0 z-[100] grid place-items-center bg-[var(--color-background-auth-page)]/85 backdrop-blur-md transition-all duration-300 ease-out motion-reduce:transition-none ${leaving ? 'pointer-events-none opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      data-dashboard-initial-loader
      data-state={leaving ? 'leaving' : 'visible'}
      role="status"
    >
      <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-border-button-default bg-background-primary-default/90 px-8 py-6 shadow-2xl">
        <div className="relative flex items-center justify-center">
          <span className="absolute size-14 animate-ping rounded-2xl bg-accent-500/20 [animation-duration:1.5s]" />
          <AcademyOpsMark className="relative size-12 shadow-control" />
        </div>
        <div className="flex items-center gap-2.5 text-xs font-medium text-text-secondary">
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-border-button-default border-t-accent-500 motion-reduce:animate-none"
          />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}
