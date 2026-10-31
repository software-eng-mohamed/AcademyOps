// BoardUI Tailwind design system tokens for student overviews.
const styles = {
  amount:
    'my-2 text-2xl sm:text-3xl font-semibold leading-snug tabular-nums text-text-primary [overflow-wrap:anywhere]',
  attendanceStats:
    'grid grid-cols-3 gap-2.5 my-4.5 [&>div]:p-2.5 sm:[&>div]:p-3 [&>div]:rounded-xl [&>div]:bg-background-secondary-default [&>div]:text-center [&_dd]:text-lg sm:[&_dd]:text-xl [&_dd]:font-semibold [&_dd]:text-text-primary [&_dt]:text-xs [&_dt]:text-text-secondary',
  card: 'relative min-w-0 p-4 sm:p-5.5 rounded-[20px] border border-border-secondary bg-background-primary-default text-text-primary shadow-card dark:border-white/10 dark:bg-background-secondary-default',
  chart: 'relative min-w-0 h-[220px]',
  content: 'grid gap-5 min-w-0',
  date: 'text-accent-600 dark:text-accent-400 text-sm font-medium',
  details:
    'grid gap-3 [&>div]:flex [&>div]:flex-wrap [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-2 [&>div]:text-sm [&_dt]:text-text-secondary [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-text-primary',
  empty:
    'grid content-center gap-1.5 min-h-[150px] p-5 rounded-2xl border border-dashed border-border-secondary bg-background-secondary-default text-center [&_strong]:text-sm [&_strong]:font-medium [&_strong]:text-text-primary',
  grid: 'grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5',
  heading:
    'flex items-center gap-3 mb-4 sm:mb-5.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-normal text-text-primary',
  legend:
    'flex flex-wrap justify-center gap-4 text-xs text-text-secondary [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5 [&_i]:size-2 [&_i]:rounded-full [&_i]:shrink-0',
  muted: 'text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]',
  note: 'mt-4',
  row: 'flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 sm:gap-4 py-4 border-b border-border-secondary last:border-b-0 last:pb-0',
  rowEnd:
    'grid sm:flex shrink-0 justify-items-end items-center justify-between sm:justify-end gap-2 text-xs sm:text-sm text-text-secondary w-full sm:w-auto',
  rowMain:
    'flex flex-wrap sm:flex-nowrap items-center gap-3 min-w-0 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-text-primary [&_h3]:[overflow-wrap:anywhere]',
  rows: 'grid',
  sessionMeta:
    'flex flex-wrap items-center gap-3.5 mt-5 pt-4.5 border-t border-border-secondary text-sm text-text-secondary [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5',
  sessionTitle:
    'mt-4 text-xl sm:text-2xl font-semibold leading-normal text-text-primary [overflow-wrap:anywhere]',
  tabLabel:
    'grid gap-1 justify-items-center min-w-[66px] py-1 [&_strong]:text-lg [&_strong]:font-semibold text-text-primary',
  tabs: 'overflow-x-auto pb-1',
  time: 'px-3 py-2 rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400 text-xs sm:text-sm font-medium whitespace-nowrap',
};

export default styles;
