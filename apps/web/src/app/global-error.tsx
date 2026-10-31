'use client';

import { ErrorView } from '@/components/application/errors/error-view';
import { useDocumentLocale } from '@/i18n/use-document-locale';
import { directionFor } from '@/lib/locales';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useDocumentLocale();
  return (
    <html dir={directionFor(locale)} lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--color-background-auth-page)] font-sans antialiased">
        <ErrorView error={error} reset={reset} isGlobal />
      </body>
    </html>
  );
}
