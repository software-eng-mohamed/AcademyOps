'use client';

import { cn, ModalTitle } from '@academyops/ui';
import { AcademyCard, AcademyTab, AcademyTabList, AcademyTabs } from '@academyops/ui/academy';
import { Avatar, AvatarFallback, Button as RecordButton } from '@academyops/ui/registry';
import { Add, ArrowRight2, Edit2 } from 'iconsax-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/base/buttons/button';
import formStyles from './academy-form-styles';
import styles from './academy-styles';

export function DirectoryTabs(props: Omit<ComponentProps<typeof AcademyTabs>, 'variant'>) {
  return <AcademyTabs {...props} variant="underline" />;
}

export function DirectoryTabList(props: ComponentProps<typeof AcademyTabList>) {
  return <AcademyTabList {...props} className="max-w-full gap-3 border-0" />;
}

export function DirectoryTab(props: ComponentProps<typeof AcademyTab>) {
  return <AcademyTab {...props} className="gap-2 px-1.5 py-3.5" />;
}

// Academy is the visual baseline for directory pages in every workspace category.
export function DirectoryHeading({
  title,
  description,
  icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: { label: string; disabled?: boolean; onClick: () => void };
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeading}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={styles.headingIcon}>{icon}</span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
      </div>
      {action || children ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {children}
          {action ? (
            <Button
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              className="shrink-0 [&>span]:gap-1.5"
            >
              <Add aria-hidden size={19} color="currentColor" />
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function DirectoryAvatar({
  name,
  icon,
  large = false,
}: {
  name?: string;
  icon?: ReactNode;
  large?: boolean;
}) {
  if (name !== undefined)
    return (
      <Avatar className={cn('border border-brand/15', large ? 'size-12' : 'size-9')} aria-hidden>
        <AvatarFallback className="bg-brand-soft text-brand">
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join('')
            .toUpperCase() || '—'}
        </AvatarFallback>
      </Avatar>
    );
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl border border-brand/15 bg-brand-soft text-brand',
        large ? 'size-12' : 'size-9',
      )}
      aria-hidden
    >
      {icon}
    </span>
  );
}

export function DirectoryCard({
  name,
  code,
  avatar,
  status,
  resource,
  onInspect,
  viewLabel,
  children,
}: {
  name: string;
  code?: string;
  avatar: ReactNode;
  status?: ReactNode;
  resource: string;
  onInspect: () => void;
  viewLabel: string;
  children: ReactNode;
}) {
  return (
    <AcademyCard
      className={styles.recordCard ?? ''}
      data-library-component="heroui/card"
      data-resource={resource}
    >
      <AcademyCard.Header className="gap-4 p-5 pb-0">
        <div className="flex items-center justify-between gap-3">
          {avatar}
          {status}
        </div>
        <div className="min-w-0">
          <AcademyCard.Title className="text-base font-semibold text-ink">
            <RecordButton
              type="button"
              variant="ghost"
              className="h-auto max-w-full justify-start rounded-md p-0 text-start text-base font-semibold whitespace-normal hover:text-brand"
              onClick={onInspect}
            >
              {name}
            </RecordButton>
          </AcademyCard.Title>
          {code && code !== name ? (
            <AcademyCard.Description className="mt-1 text-xs text-ink-muted">
              <bdi>{code}</bdi>
            </AcademyCard.Description>
          ) : null}
        </div>
      </AcademyCard.Header>
      <AcademyCard.Content className="px-5 py-1">{children}</AcademyCard.Content>
      <AcademyCard.Footer className="justify-end border-t border-border bg-surface-subtle/50 px-4 py-2.5">
        <RecordButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onInspect}
          className="text-brand"
        >
          {viewLabel}
          <ArrowRight2 aria-hidden size={14} color="currentColor" className="ms-1 rtl:rotate-180" />
        </RecordButton>
      </AcademyCard.Footer>
    </AcademyCard>
  );
}

export function AcademyFormHeading({ children }: { children: ReactNode }) {
  return (
    <div className={formStyles.formHeading}>
      <span aria-hidden>
        <Edit2 size={20} color="currentColor" variant="Bulk" />
      </span>
      <ModalTitle className="text-lg font-semibold">{children}</ModalTitle>
    </div>
  );
}
