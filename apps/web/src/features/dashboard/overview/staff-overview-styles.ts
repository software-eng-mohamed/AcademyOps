// BoardUI Tailwind design system tokens for staff overviews.
const styles = {
  academicGrid: 'staff-academic-grid items-stretch',
  academicAction:
    'staff-academic-action group min-w-32 justify-between !border-accent-200 !bg-accent-50 !text-accent-700 shadow-xs hover:!border-accent-300 hover:!bg-accent-100 active:!bg-accent-200 dark:!border-accent-800 dark:!bg-accent-950 dark:!text-accent-300 dark:hover:!border-accent-700 dark:hover:!bg-accent-900 [&_svg]:transition-transform [&_svg]:duration-150 hover:[&_svg]:translate-x-0.5 [&_svg]:rtl:rotate-180 rtl:hover:[&_svg]:-translate-x-0.5',
  academicRecordLink:
    'h-auto max-w-full whitespace-normal rounded-full !border-transparent !bg-button-ghost-background !px-3 !py-1.5 !text-button-ghost-foreground shadow-none hover:!bg-button-ghost-hover active:!bg-button-ghost-active [&_span]:min-w-0 [&_span]:shrink',
  accountsGrid: 'staff-accounts-grid items-stretch',
  attendanceGrid: 'staff-attendance-grid items-stretch',
  body: 'staff-overview-body min-w-0 px-[22px] pb-[22px] pt-1',
  card: 'staff-overview-card relative min-w-0 rounded-[22px] border border-border-secondary bg-background-primary-default text-text-primary shadow-xs',
  chart: 'staff-overview-chart relative min-w-0 h-64',
  donut: 'staff-overview-donut relative min-w-0 h-56',
  empty:
    'staff-overview-empty grid gap-2 content-center min-h-40 p-6 text-center rounded-2xl border border-dashed border-border-secondary bg-background-secondary-default text-text-secondary',
  equal: 'staff-overview-equal grid grid-cols-1 lg:grid-cols-2 gap-5 items-start',
  featured: 'staff-overview-featured border-accent-500',
  foot: 'staff-overview-foot mt-auto pt-4 border-t border-border-secondary text-xs text-text-secondary',
  grid: 'staff-overview-grid grid grid-cols-1 lg:grid-cols-2 gap-5 items-start',
  header:
    'staff-overview-header flex items-center gap-3 px-[22px] pb-4 pt-[22px] text-text-primary',
  healthRow:
    'staff-overview-health-row flex items-center justify-between gap-3 py-4 border-b border-border-secondary text-sm last:border-b-0 text-text-primary',
  legend:
    'staff-overview-legend flex flex-wrap justify-center gap-3 pt-3 text-xs text-text-secondary',
  list: 'staff-overview-list grid',
  listItem:
    'staff-overview-list-item py-4 border-t border-border-secondary min-w-0 first:border-t-0 first:pt-1',
  meter:
    'staff-overview-meter block w-full h-2 border-0 rounded-full bg-background-secondary-default accent-teal-500',
  mini: 'staff-overview-mini flex flex-col items-start gap-2 p-4 min-w-0 rounded-2xl border border-border-secondary bg-background-secondary-default text-text-primary',
  miniGrid: 'staff-overview-mini-grid grid grid-cols-1 sm:grid-cols-2 gap-3',
  muted: 'staff-overview-muted text-xs leading-relaxed text-text-secondary',
  note: 'staff-overview-note flex items-start gap-2 p-4 mt-4 rounded-xl bg-background-secondary-default text-xs leading-relaxed text-text-secondary',
  operationsGrid: 'staff-operations-grid items-stretch',
  pill: 'staff-overview-pill flex items-center gap-2 px-3 py-2 rounded-xl border border-border-secondary text-xs text-text-secondary',
  pills: 'staff-overview-pills flex flex-wrap gap-2',
  pipeline: 'staff-overview-pipeline grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2',
  rankLabel:
    'staff-overview-rank-label flex items-center justify-between gap-3 text-sm mb-2 text-text-primary',
  ranking: 'staff-overview-ranking grid gap-4 py-1',
  receptionGrid: 'staff-reception-grid items-stretch',
  reverse:
    'staff-overview-reverse grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.6fr)] gap-5 items-start',
  row: 'staff-overview-row flex items-center justify-between gap-3',
  sessionDetail:
    'staff-overview-session-detail flex flex-wrap items-center gap-3 text-sm mt-4 text-text-secondary',
  sessionTitle:
    'staff-overview-session-title text-xl font-semibold leading-normal my-4 text-text-primary',
  stack: 'staff-overview-stack grid gap-5 min-w-0',
  stage:
    'staff-overview-stage rounded-xl border border-border-secondary p-4 min-w-0 bg-background-secondary-default text-text-primary',
  track: 'staff-overview-track h-2 rounded-full bg-background-secondary-default overflow-hidden',
  trainerGrid: 'staff-trainer-grid items-stretch',
};

export default styles;
