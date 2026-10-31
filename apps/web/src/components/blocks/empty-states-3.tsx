'use client';

// 7Ovr Empty States 3 (MIT-0): https://7ovr.com/r/empty-states-3.json
// Replace the demo toast with the supplied real action, localize content and alias theme colors.
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@academyops/ui/registry';
import { SearchNormal1 } from 'iconsax-react';

export function EmptyStates3({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section
      className="flex w-full items-center justify-center rounded-xl bg-surface-subtle/30 px-6 py-16 text-ink"
      data-library-block="7ovr/empty-states-3"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchNormal1 color="currentColor" aria-hidden className="size-4" />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={2}>
              {title}
            </EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          {action ? (
            <EmptyContent>
              <Button type="button" variant="outline" onClick={action.onClick}>
                {action.label}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    </section>
  );
}
