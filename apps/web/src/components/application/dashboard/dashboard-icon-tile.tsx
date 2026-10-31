import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

export type DashboardIconTone = 'blue' | 'orange' | 'purple' | 'pink' | 'sky' | 'emerald';

const TONE_CLASSES: Record<DashboardIconTone, string> = {
  blue: 'bg-blue-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(59,130,246,0.14)]',
  purple:
    'bg-purple-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(168,85,247,0.14)]',
  emerald:
    'bg-emerald-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(16,185,129,0.14)]',
  orange:
    'bg-orange-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(249,115,22,0.14)]',
  pink: 'bg-pink-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(236,72,153,0.14)]',
  sky: 'bg-sky-500 shadow-[inset_0_2px_1px_rgba(255,255,255,0.25),0_2px_3px_rgba(14,165,233,0.14)]',
};

/** The solid BoardUI icon tile shared by the Sales and Owner overview cards. */
export function DashboardIconTile({
  children,
  tone = 'blue',
}: {
  children: ReactNode;
  tone?: DashboardIconTone;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid size-[38px] shrink-0 place-items-center rounded-xl border border-black/10 text-white',
        TONE_CLASSES[tone],
      )}
      data-dashboard-icon-tone={tone}
    >
      {children}
    </span>
  );
}
