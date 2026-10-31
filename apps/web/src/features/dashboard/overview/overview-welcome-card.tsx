import { StatusUp } from 'iconsax-react';
import type { ReactNode } from 'react';

export function OverviewWelcomeCard({
  title,
  greeting,
  description,
  userName,
  actions,
}: {
  title: string;
  greeting: string;
  description: string;
  userName: string;
  actions?: ReactNode;
}) {
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  const [greetingStart, greetingEnd] = greeting.split('{name}');

  return (
    <div
      className="relative mt-4 flex items-center justify-between gap-3 rounded-[20px] border border-border-secondary bg-background-primary-default p-5 shadow-card sm:mt-5.5 sm:gap-5 sm:rounded-3xl sm:p-6 dark:border-white/10 dark:bg-background-secondary-default"
      data-overview-welcome
    >
      <div className="min-w-0">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-400">
          <StatusUp aria-hidden color="currentColor" size={17} variant="Bulk" />
          {title}
        </p>
        <h1 className="text-[25px] font-semibold leading-snug text-text-primary sm:text-[clamp(24px,2.5vw,34px)] [overflow-wrap:anywhere]">
          {greetingStart}
          <bdi>{firstName}</bdi>
          {greetingEnd}
        </h1>
        <p className="mt-2.5 max-w-[580px] text-body-regular leading-relaxed text-text-secondary">
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}
