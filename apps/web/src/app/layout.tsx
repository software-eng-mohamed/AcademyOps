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
  title: { default: 'AcademyOps', template: '%s | AcademyOps' },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const locale = localeFromPath(requestHeaders.get('x-plg-request-path'));
  return (
    <html dir={directionFor(locale)} lang={locale} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
