'use client';

import { useRef, useState } from 'react';
import { AuthCard } from '@/components/application/auth/auth-card';
import { AnimatedThemeToggler } from '@/components/base/buttons/animated-theme-toggler';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAppCopy } from '@/i18n/app-copy';
import type { Locale } from '@/lib/locales';
import { AcademyOpsBrand } from './login-brand';
import { getLoginCopy } from './login-copy';
import { LoginForm, type LoginStep } from './login-form';
import { useLoginEntranceMotion } from './use-login-entrance-motion';
import { useLoginStepMotion } from './use-login-mfa-motion';

export function LoginScreen({
  locale,
  organizationCode,
  demo = false,
}: {
  locale: Locale;
  organizationCode: string;
  demo?: boolean;
}) {
  const copy = getLoginCopy(locale);
  const appCopy = getAppCopy(locale);
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<LoginStep>('credentials');
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const otherLocaleHref = `/${otherLocale}/login`;
  useLoginEntranceMotion(rootRef);
  useLoginStepMotion(rootRef, step);

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-[var(--color-background-auth-page)]"
      ref={rootRef}
    >
      <aside
        aria-label={appCopy.pageSettings}
        className="absolute end-4 top-4 z-10 flex items-center gap-1 sm:end-6 sm:top-6"
        data-login-controls
      >
        <AnimatedThemeToggler
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary outline-none transition-[background-color,color,transform] duration-150 ease-out hover:scale-[1.045] hover:bg-background-tertiary-default hover:text-accent-600 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset motion-reduce:transform-none motion-reduce:transition-none"
          darkThemeLabel={appCopy.shell.switchToDarkTheme}
          lightThemeLabel={appCopy.shell.switchToLightTheme}
        />
        <ButtonLink
          className="h-9 rounded-lg"
          href={otherLocaleHref}
          hrefLang={otherLocale}
          size="small"
          variant="ghost"
        >
          {appCopy.switchLanguage}
        </ButtonLink>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-5 py-20 sm:px-8 sm:py-24">
        <div className="w-full max-w-[400px]" data-login-panel>
          <AuthCard
            appearance="plain"
            centeredHeader
            description={
              step === 'mfa'
                ? copy.mfaDescription
                : step === 'phoneOtp'
                  ? copy.phoneOtpDescription
                  : step === 'changePhone'
                    ? copy.changePhoneDescription
                    : demo
                      ? locale === 'ar'
                        ? 'نسخة تجريبية ببيانات وهمية. بيانات الدخول التجريبية جاهزة؛ اضغط تسجيل الدخول للاستكشاف.'
                        : 'Fictional demo data. Sample credentials are filled in; sign in to explore.'
                      : null
            }
            logo={<AcademyOpsBrand label={copy.brand} />}
            title={
              step === 'mfa'
                ? copy.mfaTitle
                : step === 'phoneOtp'
                  ? copy.phoneOtpTitle
                  : step === 'changePhone'
                    ? copy.changePhoneTitle
                    : copy.title
            }
          >
            <LoginForm
              demo={demo}
              locale={locale}
              organizationCode={organizationCode}
              onStepChange={setStep}
            />
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
