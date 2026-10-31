// BoardUI Tailwind design system tokens for sales overviews.
const styles = {
  empty:
    'flex flex-col sm:flex-row items-center gap-4 sm:gap-5 m-3.5 sm:m-5 p-5 sm:p-6 rounded-2xl border border-dashed border-border-secondary bg-background-secondary-default text-center sm:text-start',
  emptyDescription: 'mt-1.5 max-w-[420px] text-xs sm:text-sm leading-relaxed text-text-secondary',
  emptyIcon:
    'grid size-11 sm:size-14 shrink-0 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shadow-[0_0_0_5px_rgba(16,185,129,0.1)]',
  emptyTitle: 'text-base font-medium text-text-primary',
  followUps:
    'overflow-hidden rounded-[20px] border border-border-secondary bg-background-primary-default shadow-card text-text-primary dark:border-white/10 dark:bg-background-secondary-default',
  followUpsHeader: 'flex flex-wrap items-center justify-between gap-3.5 p-4.5 sm:p-5.5',
  footer:
    'flex flex-wrap items-center justify-between gap-3 px-4.5 sm:px-5.5 py-3.5 border-t border-border-secondary text-xs text-text-secondary leading-relaxed',
  leadIcon:
    'grid size-9.5 shrink-0 place-items-center rounded-full bg-accent-500/10 text-accent-600',
  leadName: 'truncate text-sm font-medium text-text-primary',
  queue: 'px-4.5 sm:px-5.5 divide-y divide-border-secondary',
  queueItem: 'flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 sm:gap-4 py-4',
  queueMeta:
    'flex shrink-0 items-center justify-between sm:justify-end gap-3.5 text-xs text-text-secondary w-full sm:w-auto',
  root: 'min-h-full',
  sectionDescription: 'mt-1 text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]',
  sectionIcon:
    'grid size-10 shrink-0 place-items-center rounded-xl border border-border-secondary bg-background-secondary-default text-text-secondary',
  sectionTitle: 'text-base font-semibold leading-normal text-text-primary',
  today: 'gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400',
};

export default styles;
