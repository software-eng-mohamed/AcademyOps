// BoardUI Tailwind design system tokens for academy and management detail drawers & full-page views.
const styles = {
  detailHeading:
    'flex items-center gap-3.5 mt-4 [&>span:first-child]:size-12 [&>span:first-child]:rounded-2xl',
  detailSection:
    'py-6 border-b border-border-secondary first:pt-1 last:border-b-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mb-3.5',
  drawer:
    'w-[min(calc(100vw-32px),680px)] max-sm:w-[calc(100vw-16px)] max-sm:inset-inline-end-2 max-sm:top-2 max-sm:bottom-2 rounded-[22px] bg-background-primary-default text-text-primary shadow-xl [&_[class~="plg-drawer-header"]]:p-6',
  drawerTitle: 'text-[22px] font-bold leading-snug text-text-primary [overflow-wrap:anywhere]',
  facts:
    'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 [&>div]:min-w-0 [&>div]:p-4 [&>div]:rounded-xl [&>div]:bg-background-secondary-default/50 [&>div]:border [&>div]:border-border-secondary/80 [&_dt]:text-xs [&_dt]:font-medium [&_dt]:text-text-secondary [&_dt]:mb-1.5 [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:text-text-primary [&_dd]:[overflow-wrap:anywhere]',
  fullPage:
    'flex flex-col gap-6 rounded-2xl border border-border-secondary bg-background-primary-default p-6 sm:p-8 shadow-xs',
  fullPageHeader: 'flex flex-col gap-5 border-b border-border-secondary pb-6',
  fullPageHeading: 'flex flex-wrap items-center justify-between gap-4',
  fullPageIdentity:
    'flex min-w-0 items-center gap-4 [&>span:first-child]:size-[52px] [&>span:first-child]:rounded-2xl',
  fullPageNav: 'flex flex-wrap items-center justify-between gap-3',
  fullPageTitle:
    'text-xl sm:text-2xl font-bold leading-tight text-text-primary [overflow-wrap:anywhere]',
  inlineActions: 'flex flex-wrap items-center gap-2.5',
  muted: 'text-xs leading-relaxed text-text-secondary',
  related: 'flex flex-col gap-3',
  relatedItem:
    'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-secondary bg-background-primary-default p-4 shadow-2xs hover:border-border-button-hover transition-colors [&_strong]:text-sm [&_strong]:font-semibold [&_strong]:text-text-primary [&_small]:text-xs [&_small]:text-text-secondary',
  timeline: 'grid gap-0',
  timelineItem:
    'relative border-s-2 border-border-secondary ps-4 pe-2 pb-5 text-sm before:absolute before:top-2 before:-start-[5px] before:size-2 before:rounded-full before:bg-accent-500 [&_small]:block [&_small]:mt-1 [&_small]:text-xs [&_small]:text-text-secondary [&_p]:mt-1.5 [&_p]:[overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap [&_p]:text-text-primary',
};

export default styles;
