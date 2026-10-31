import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { getAppCopy } from '@/i18n/app-copy';
import { directionFor, localeFromPath } from '@/lib/locales';
import './globals.css';

export const metadata: Metadata = {
  description: getAppCopy('en').metadataDescription,
  applicationName: 'AcademyOps',
  icons: { icon: { url: '/academyops-mark.svg', type: 'image/svg+xml' } },
  title: {
    default: 'AcademyOps',
    template:
      process.env.ACADEMYOPS_DEMO_ONLY === 'true' ? '%s | AcademyOps Demo' : '%s | AcademyOps',
  },
  ...(process.env.ACADEMYOPS_DEMO_ONLY === 'true'
    ? { robots: { index: false, follow: false } }
    : {}),
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const locale = localeFromPath(requestHeaders.get('x-plg-request-path'));
  const isDemo = process.env.ACADEMYOPS_DEMO_ONLY === 'true';
  return (
    <html
      data-academyops-demo={isDemo ? 'true' : undefined}
      dir={directionFor(locale)}
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <Providers disableAnalytics={isDemo}>{children}</Providers>
      </body>
    </html>
  );
}
