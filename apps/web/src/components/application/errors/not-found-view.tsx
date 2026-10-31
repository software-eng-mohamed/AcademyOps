'use client';

import { useRef } from 'react';
import { AuthCard } from '@/components/application/auth/auth-card';
import { AnimatedThemeToggler } from '@/components/base/buttons/animated-theme-toggler';
import { ButtonLink } from '@/components/base/buttons/button';
import { AcademyOpsBrand } from '@/features/auth/login-brand';
import { useLoginEntranceMotion } from '@/features/auth/use-login-entrance-motion';
import { getAppCopy } from '@/i18n/app-copy';
import type { Locale } from '@/lib/locales';

export function NotFoundView({ locale }: { locale: Locale }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const copy = getAppCopy(locale);
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const otherLocaleHref = `/${otherLocale}/404`;

  useLoginEntranceMotion(rootRef);

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-[var(--color-background-auth-page)]"
      ref={rootRef}
    >
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

      <main className="flex min-h-dvh items-center justify-center px-5 py-20 sm:px-8 sm:py-24">
        <div className="w-full max-w-[400px]" data-login-panel>
          <AuthCard
            appearance="plain"
            centeredHeader
            description={copy.notFound.description}
            logo={<AcademyOpsBrand label={copy.brand} />}
            title={`404 • ${copy.notFound.title}`}
          >
            <div className="flex flex-col gap-3">
              <ButtonLink
                className="h-11 w-full rounded-lg text-white"
                href={`/${locale}/dashboard`}
              >
                {copy.notFound.action}
              </ButtonLink>
              <ButtonLink
                className="h-auto self-center !bg-transparent px-0 py-0 hover:!bg-transparent active:!bg-transparent text-caption-1-medium text-text-secondary hover:text-text-primary"
                href={`/${locale}/login`}
                size="xs"
                variant="ghost"
              >
                {copy.notFound.loginAction || (locale === 'ar' ? 'تسجيل الدخول' : 'Sign In')}
              </ButtonLink>
            </div>
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
