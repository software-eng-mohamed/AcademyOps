import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';

export interface AuthCardProps {
  appearance?: 'card' | 'plain';
  centeredHeader?: boolean;
  children: ReactNode;
  className?: string;
  description: ReactNode;
  footnote?: ReactNode;
  fullBleed?: boolean;
  logo?: ReactNode;
  media?: ReactNode;
  title: ReactNode;
}

/**
 * BoardUI Auth Card adapted as a product-level shell.
 *
 * Authentication fields stay in the host application because academy sign-in is
 * organization-aware and can branch into MFA. The card owns only the visual
 * composition, so the backend contract never leaks into the UI primitive.
 */
export function AuthCard({
  appearance = 'card',
  centeredHeader = false,
  children,
  className,
  description,
  footnote,
  fullBleed = false,
  logo,
  media,
  title,
}: AuthCardProps) {
  const isPlain = appearance === 'plain';
  const body = (
    <div
      className={cx(
        'flex min-w-0 flex-col',
        isPlain ? 'p-0' : 'p-6 sm:p-9 lg:p-12',
        fullBleed &&
          'min-h-dvh overflow-y-auto bg-background-primary-default px-6 py-8 sm:px-10 lg:px-14 xl:px-20 dark:bg-background-secondary-default',
      )}
    >
      <div
        className={cx(
          'flex min-w-0 flex-1 flex-col',
          isPlain && 'w-full',
          fullBleed && 'mx-auto w-full max-w-[460px] justify-center py-4 sm:py-8',
        )}
      >
        {logo ? (
          <div
            className={cx(
              'mb-8 flex items-center',
              centeredHeader ? 'justify-center' : 'justify-between',
            )}
          >
            {logo}
          </div>
        ) : null}
        <div className={cx('flex flex-col gap-2', centeredHeader && 'items-center text-center')}>
          <h1 className="text-title-1-semibold text-text-primary">{title}</h1>
          {description ? (
            <p className="max-w-md text-body-regular leading-6 text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        <div className={description ? 'mt-8' : 'mt-6'}>{children}</div>
        {footnote ? (
          <p className="mt-auto pt-8 text-caption-1-regular text-text-tertiary">{footnote}</p>
        ) : null}
      </div>
    </div>
  );

  if (!media) {
    return (
      <div
        className={cx(
          isPlain
            ? 'w-full'
            : 'w-full max-w-[440px] overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-xl dark:bg-background-secondary-default',
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className={cx(
        fullBleed
          ? 'grid min-h-dvh w-full overflow-hidden bg-background-primary-default md:grid-cols-[minmax(420px,0.82fr)_minmax(0,1.18fr)] dark:bg-background-secondary-default'
          : 'grid min-h-[680px] w-full max-w-[1080px] overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-xl md:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] dark:bg-background-secondary-default',
        className,
      )}
    >
      {body}
      <div className="relative hidden min-w-0 overflow-hidden md:block">{media}</div>
    </div>
  );
}
