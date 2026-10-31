'use client';

// 7Ovr Profile 2 + 3 (MIT-0): https://7ovr.com/r/profile-2.json and /profile-3.json
// Keep the original card layouts. Demo identities/statistics/actions are supplied by the API adapter.
import { Button, Card, CardContent, CardFooter, CardHeader } from '@academyops/ui/registry';
import { ArrowRight2 } from 'iconsax-react';
import type { ReactNode } from 'react';

type ProfileCardProps = {
  avatar: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  facts: { id: string; label: ReactNode; value: ReactNode }[];
  actionLabel: string;
  onAction: () => void;
};

function ProfileFacts({ facts }: Pick<ProfileCardProps, 'facts'>) {
  return (
    <dl
      className="grid divide-x divide-border border-y border-border rtl:divide-x-reverse"
      style={{ gridTemplateColumns: `repeat(${Math.min(facts.length, 3) || 1}, minmax(0, 1fr))` }}
    >
      {facts.map((fact) => (
        <div
          key={fact.id}
          className="flex min-w-0 flex-col items-center gap-0.5 px-2 py-3 text-center"
        >
          <dd className="w-full break-words text-sm font-semibold tabular-nums">{fact.value}</dd>
          <dt className="text-xs text-ink-muted">{fact.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function ProfileCard2({
  avatar,
  title,
  subtitle,
  badge,
  facts,
  actionLabel,
  onAction,
}: ProfileCardProps) {
  return (
    <Card className="w-full" data-library-block="7ovr/profile-2">
      <CardHeader>
        <div className="flex flex-col items-center gap-3 text-center">
          {avatar}
          <div className="flex min-w-0 flex-col items-center gap-1">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h2 className="text-base font-semibold">
                <button
                  type="button"
                  onClick={onAction}
                  className="break-words text-start hover:text-brand"
                >
                  {title}
                </button>
              </h2>
              {badge}
            </div>
            {subtitle ? (
              <p className="break-all text-sm text-ink-muted" dir="auto">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <ProfileFacts facts={facts} />
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onAction}>
          {actionLabel}
          <ArrowRight2 color="currentColor" className="size-4 rtl:rotate-180" aria-hidden />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProfileCard3({
  avatar,
  title,
  subtitle,
  badge,
  facts,
  actionLabel,
  onAction,
}: ProfileCardProps) {
  return (
    <div
      className="flex w-full flex-col rounded-xl border border-border bg-surface p-6 text-ink"
      data-library-block="7ovr/profile-3"
    >
      <div className="flex items-start gap-4">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              <button
                type="button"
                onClick={onAction}
                className="break-words text-start hover:text-brand"
              >
                {title}
              </button>
            </h2>
            {badge}
          </div>
          {subtitle ? (
            <p className="break-all text-sm text-ink-muted" dir="auto">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto pt-5">
        <ProfileFacts facts={facts} />
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onAction}>
          {actionLabel}
          <ArrowRight2 color="currentColor" className="size-4 rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
