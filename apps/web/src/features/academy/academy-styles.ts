// BoardUI Tailwind design system tokens for academy, management, student, and system workspaces.
const styles = {
  canvas:
    'mt-4 sm:mt-6 px-3.5 sm:px-6 min-w-0 rounded-2xl sm:rounded-[20px] border border-border-secondary bg-background-primary-default shadow-xs',
  canvasHeader:
    'flex flex-wrap items-center justify-between gap-3 pb-3 sm:pb-0 border-b border-border-secondary',
  cardFacts:
    'grid grid-cols-2 gap-x-4 gap-y-5 [&_dt]:text-xs [&_dt]:leading-normal [&_dt]:text-text-secondary [&_dd]:mt-1.5 [&_dd]:text-sm [&_dd]:[overflow-wrap:anywhere] [&_.cardNumber]:text-[28px] [&_.cardNumber]:font-semibold [&_.cardNumber]:tracking-tight [&_.cardNumber]:leading-tight',
  cardNumber: 'text-[28px] font-semibold tracking-tight leading-tight text-text-primary',
  container: 'mx-auto w-full max-w-[1600px] min-w-0',
  detailSection:
    'py-6 border-b border-border-secondary first:pt-1 last:border-b-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-3.5',
  drawer:
    'w-[min(calc(100vw-32px),680px)] max-sm:w-[calc(100vw-16px)] max-sm:inset-inline-end-2 max-sm:top-2 max-sm:bottom-2 rounded-[22px] bg-background-primary-default text-text-primary shadow-xl [&_[class~="plg-drawer-header"]]:p-6',
  drawerTitle: 'text-[22px] font-bold leading-snug text-text-primary [overflow-wrap:anywhere]',
  error:
    'flex items-start gap-3.5 p-4 my-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] dark:bg-red-950/30 dark:border-red-500/30 text-xs sm:text-sm leading-relaxed text-text-primary shadow-xs backdrop-blur-xs [&>div]:min-w-0',
  facts:
    'grid grid-cols-1 sm:grid-cols-2 gap-3 [&>div]:min-w-0 [&>div]:p-3.5 sm:[&>div]:p-4 [&>div]:rounded-xl [&>div]:bg-background-secondary-default [&>div]:border [&>div]:border-border-secondary [&_dt]:text-xs [&_dt]:text-text-secondary [&_dt]:mb-1.5 [&_dd]:text-sm [&_dd]:font-medium [&_dd]:text-text-primary [&_dd]:[overflow-wrap:anywhere]',
  form: 'grid gap-5 py-2 [&_[data-input-size]>[role="presentation"]]:min-h-[42px] [&_[data-input-size]>[role="presentation"]]:rounded-xl [&_[data-input-size]>[role="presentation"]]:border [&_[data-input-size]>[role="presentation"]]:border-border-secondary [&_[data-input-size]>[role="presentation"]]:bg-background-secondary-default [&_[data-input-size]>[role="presentation"]:focus-within]:border-accent-500 [&_[data-input-size][data-invalid]>[role="presentation"]]:border-red-500 [&_input::placeholder]:text-text-tertiary [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-border-secondary [&_textarea]:bg-background-secondary-default [&_textarea]:text-text-primary [&_textarea:focus]:border-accent-500 [&_textarea:focus]:ring-1 [&_textarea:focus]:ring-accent-500 [&_textarea::placeholder]:text-text-tertiary [&_textarea[aria-invalid="true"]]:border-red-500 [&_button[aria-invalid="true"]]:border-red-500',
  headingIcon:
    'grid size-11 sm:size-14 shrink-0 place-items-center rounded-xl sm:rounded-2xl border border-accent-500/25 bg-accent-500/10 text-accent-500 shadow-xs',
  loading: 'px-3.5 sm:px-6',
  loadingRow: 'flex items-center gap-3.5 py-5 border-b border-border-secondary',
  modal:
    'w-[min(calc(100vw-32px),650px)] max-sm:w-[calc(100vw-16px)] max-sm:max-h-[calc(100dvh-16px)] rounded-[22px] bg-background-primary-default text-text-primary shadow-xl [&_[class~="plg-modal-header"]]:p-6',
  page: 'min-w-0 px-3 sm:px-6 xl:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8 text-text-primary',
  pageHeading:
    'flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 sm:gap-5 mt-5 sm:mt-7',
  pagination: 'flex flex-wrap items-center justify-between gap-3 sm:gap-6 py-5',
  recordCard:
    'min-w-0 p-0 gap-5 overflow-hidden rounded-2xl border border-border-secondary bg-background-primary-default shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-accent-500/45 hover:shadow-md focus-within:border-accent-500/45 focus-within:shadow-md',
  recordGrid: 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4',
  records: 'mt-0 min-w-0',
  related: 'flex flex-col gap-2.5',
  relatedItem:
    'flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border-secondary p-3.5 [&_strong]:text-sm [&_strong]:font-semibold [&_small]:text-xs [&_small]:text-text-secondary',
  search: 'w-full sm:w-[min(360px,100%)]',
  toolbar:
    'flex flex-wrap items-end gap-2.5 py-5 [&_[data-input-size]>[role="presentation"]]:min-h-[40px]',
};

export default styles;
