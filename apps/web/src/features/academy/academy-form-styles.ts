// BoardUI Tailwind design system tokens for academy and management forms/dialogs.
const styles = {
  editor: 'grid gap-4',
  editorRow:
    'grid gap-3.5 rounded-2xl border border-border-secondary p-4 bg-background-secondary-default/30',
  form: 'grid gap-5 py-2 [&_[data-input-size]>[role="presentation"]]:min-h-[42px] [&_[data-input-size]>[role="presentation"]]:rounded-xl [&_[data-input-size]>[role="presentation"]]:border [&_[data-input-size]>[role="presentation"]]:border-border-secondary [&_[data-input-size]>[role="presentation"]]:bg-background-secondary-default [&_[data-input-size]>[role="presentation"]:focus-within]:border-accent-500 [&_[data-input-size][data-invalid]>[role="presentation"]]:border-red-500 [&_input::placeholder]:text-text-tertiary [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-border-secondary [&_textarea]:bg-background-secondary-default [&_textarea]:text-text-primary [&_textarea:focus]:border-accent-500 [&_textarea:focus]:ring-1 [&_textarea:focus]:ring-accent-500 [&_textarea::placeholder]:text-text-tertiary [&_textarea[aria-invalid="true"]]:border-red-500 [&_button[aria-invalid="true"]]:border-red-500',
  formFields:
    'grid min-w-0 items-start gap-x-4 gap-y-5 data-[columns="2"]:grid-cols-1 sm:data-[columns="2"]:grid-cols-2 [&>*]:min-w-0 [&>:has(textarea)]:col-span-full',
  formHeading:
    'flex items-center gap-3 [&>span]:grid [&>span]:size-[42px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-xl [&>span]:border [&>span]:border-border-secondary [&>span]:bg-background-secondary-default [&>span]:text-accent-500',
  inlineActions: 'flex flex-wrap items-center gap-2',
  lookup:
    'z-[70] min-w-[max(var(--radix-popover-trigger-width),280px)] max-w-[calc(100vw-32px)] bg-background-primary-default text-text-primary rounded-2xl border border-border-secondary shadow-2xl overflow-hidden p-0',
  modal:
    'w-[min(calc(100vw-32px),650px)] max-sm:w-[calc(100vw-16px)] max-sm:max-h-[calc(100dvh-16px)] rounded-[22px] border border-border-secondary bg-background-primary-default text-text-primary shadow-2xl [&_[class~="plg-modal-header"]]:p-6 [&_[class~="plg-modal-body"]]:px-6 [&_[class~="plg-modal-footer"]]:p-6',
  muted: 'text-xs leading-relaxed text-text-secondary',
  relatedItem:
    'flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border-secondary p-3.5',
  selectTrigger:
    'w-full min-h-[40px] justify-between gap-3 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:justify-start [&>span]:text-start',
  validation: 'text-xs leading-relaxed text-text-error-primary',
  validationSummary:
    'flex items-center gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.06] dark:bg-red-950/30 dark:border-red-500/30 p-3.5 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 shadow-2xs',
};

export default styles;
