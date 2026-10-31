'use client';

import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { useRef, useState } from 'react';
import { AuthCard } from '@/components/application/auth/auth-card';
import { AnimatedThemeToggler } from '@/components/base/buttons/animated-theme-toggler';
import { Button, ButtonLink } from '@/components/base/buttons/button';
import { AcademyOpsBrand } from '@/features/auth/login-brand';
import { useLoginEntranceMotion } from '@/features/auth/use-login-entrance-motion';
import { getAppCopy } from '@/i18n/app-copy';
import { useDocumentLocale } from '@/i18n/use-document-locale';

export function ErrorView({
  error,
  reset,
  isGlobal = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  isGlobal?: boolean;
}) {
  const locale = useDocumentLocale();
  const copy = getAppCopy(locale);
  const rootRef = useRef<HTMLDivElement>(null);
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const otherLocaleHref = `/${otherLocale}/login`;
  const [copied, setCopied] = useState(false);

  useLoginEntranceMotion(rootRef);

  const copyDigest = () => {
    if (error.digest) {
      navigator.clipboard.writeText(error.digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-[var(--color-background-auth-page)]"
      ref={rootRef}
    >
      {!isGlobal && (
        <aside
          aria-label={copy.pageSettings}
          className="absolute end-4 top-4 z-10 flex items-center gap-1 sm:end-6 sm:top-6"
          data-login-controls
        >
          <AnimatedThemeToggler
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary outline-none transition-[background-color,color,transform] duration-150 ease-out hover:scale-[1.045] hover:bg-background-tertiary-default hover:text-accent-600 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset motion-reduce:transform-none motion-reduce:transition-none"
            darkThemeLabel={copy.shell.switchToDarkTheme}
            lightThemeLabel={copy.shell.switchToLightTheme}
          />
          <ButtonLink
            className="h-9 rounded-lg"
            href={otherLocaleHref}
            hrefLang={otherLocale}
            size="small"
            variant="ghost"
          >
            {copy.switchLanguage}
          </ButtonLink>
        </aside>
      )}

      <main className="flex min-h-dvh items-center justify-center px-5 py-20 sm:px-8 sm:py-24">
        <div className="w-full max-w-[400px]" data-login-panel>
          <AuthCard
            appearance="plain"
            centeredHeader
            description={copy.error.description}
            logo={<AcademyOpsBrand label={copy.brand} />}
            title={isGlobal ? copy.error.globalTitle : copy.error.title}
          >
            <div className="flex flex-col gap-4">
              {error.digest ? (
                <div className="flex items-center justify-between rounded-lg border border-border-secondary-default bg-background-secondary-default/60 px-3.5 py-2 text-caption-1-regular text-text-secondary">
                  <span className="truncate">
                    <span className="text-text-tertiary">
                      {copy.error.errorCode || (locale === 'ar' ? 'رمز تتبع الخطأ' : 'Reference')}:{' '}
                    </span>
                    <code className="font-mono font-semibold text-text-primary select-all">
                      {error.digest}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={copyDigest}
                    title="Copy code"
                    className="ms-2 grid size-6 shrink-0 place-items-center rounded hover:bg-background-tertiary-default text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {copied ? (
                      <RiCheckLine className="size-3.5 text-success-600" />
                    ) : (
                      <RiFileCopyLine className="size-3.5" />
                    )}
                  </button>
                </div>
              ) : null}

              <Button className="h-11 w-full rounded-lg text-white" onClick={reset} type="button">
                {isGlobal ? copy.error.globalAction : copy.error.action}
              </Button>

              <ButtonLink
                className="h-auto self-center !bg-transparent px-0 py-0 hover:!bg-transparent active:!bg-transparent text-caption-1-medium text-text-secondary hover:text-text-primary"
                href={`/${locale}/dashboard`}
                size="xs"
                variant="ghost"
              >
                {copy.error.backHome ||
                  (locale === 'ar' ? 'العودة للوحة التحكم' : 'Return to Dashboard')}
              </ButtonLink>
            </div>
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
