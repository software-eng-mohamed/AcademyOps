import { isPlgApiError } from '@academyops/api-client/http';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { AuthCard } from '@/components/application/auth/auth-card';
import { ButtonLink } from '@/components/base/buttons/button';
import { getAppCopy } from '@/i18n/app-copy';
import type { Locale } from '@/lib/locales';
import { AcademyOpsBrand } from './login-brand';
import type { getPasswordRecoveryCopy } from './password-recovery-copy';
export type RecoveryMethod = 'EMAIL' | 'PHONE';
export type RecoveryError = { message: string; correlationId?: string };

export const FIELD_CLASS_NAME =
  'min-h-11 rounded-lg border border-border-button-default bg-background-primary-default shadow-xs dark:bg-background-secondary-default';

export function RecoveryShell({
  children,
  description,
  locale,
  method,
  preserveHash = false,
  route,
  title,
}: {
  children: ReactNode;
  description: string;
  locale: Locale;
  method?: RecoveryMethod;
  preserveHash?: boolean;
  route: 'forgot-password' | 'reset-password';
  title: string;
}) {
  const appCopy = getAppCopy(locale);
  const otherLocale = locale === 'ar' ? 'en' : 'ar';
  const otherLocaleHref = `/${otherLocale}/${route}${
    method ? `?method=${method === 'PHONE' ? 'phone' : 'email'}` : ''
  }`;
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[var(--color-background-auth-page)]">
      <aside className="absolute end-4 top-4 z-10 flex items-center gap-1 sm:end-6 sm:top-6">
        <ButtonLink
          className="h-9 rounded-lg"
          href={otherLocaleHref}
          onClick={(event) => {
            if (!preserveHash) return;
            event.preventDefault();
            window.location.assign(`${otherLocaleHref}${window.location.hash}`);
          }}
          size="small"
          variant="ghost"
        >
          {appCopy.switchLanguage}
        </ButtonLink>
      </aside>
      <main className="flex min-h-dvh items-center justify-center px-5 py-20 sm:px-8 sm:py-24">
        <div className="w-full max-w-[400px]">
          <AuthCard
            appearance="plain"
            centeredHeader
            description={description}
            logo={<AcademyOpsBrand label={appCopy.brand} />}
            title={title}
          >
            {children}
          </AuthCard>
        </div>
      </main>
    </div>
  );
}

export function RecoveryErrorMessage({
  copy,
  error,
}: {
  copy: ReturnType<typeof getPasswordRecoveryCopy>;
  error: RecoveryError | null;
}) {
  if (!error) return null;
  return (
    <div
      className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] dark:border-red-500/30 dark:bg-red-950/30 p-4 text-sm text-text-primary shadow-xs backdrop-blur-xs"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-600 dark:bg-red-500/20 dark:text-red-400 ring-1 ring-red-500/20">
          <AlertCircle aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold text-text-primary">{error.message}</p>
          {error.correlationId ? (
            <div className="mt-2.5 flex items-center">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-secondary bg-background-primary-default px-2.5 py-1 text-[11px] font-mono text-text-secondary shadow-2xs">
                <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                <span>{copy.supportId}:</span>
                <bdi
                  dir="ltr"
                  className="select-all font-semibold tracking-wider text-text-primary"
                >
                  {error.correlationId}
                </bdi>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function recoveryError(
  error: unknown,
  copy: ReturnType<typeof getPasswordRecoveryCopy>,
): RecoveryError {
  if (!isPlgApiError(error)) return { message: copy.genericError };
  const message =
    error.payload.code === 'DEMO_STORAGE_LIMIT'
      ? copy.demoStorageLimit
      : error.payload.code === 'DEMO_ACTION_UNAVAILABLE'
        ? copy.demoActionUnavailable
        : copy.genericError;
  return {
    message,
    ...(error.payload.correlationId ? { correlationId: error.payload.correlationId } : {}),
  };
}

export function passwordResetError(
  error: unknown,
  copy: ReturnType<typeof getPasswordRecoveryCopy>,
): RecoveryError {
  if (!isPlgApiError(error)) return { message: copy.genericError };
  if (error.payload.code === 'PASSWORD_RESET_INVALID' || error.status === 401) {
    return { message: copy.invalidLink };
  }
  if (error.payload.code === 'PASSWORD_REUSE_FORBIDDEN') {
    return { message: copy.passwordReuseForbidden };
  }
  return recoveryError(error, copy);
}
