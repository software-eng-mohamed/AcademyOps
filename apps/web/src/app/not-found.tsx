import { headers } from 'next/headers';
import { NotFoundView } from '@/components/application/errors/not-found-view';
import { localeFromPath } from '@/lib/locales';

export default async function NotFound() {
  const requestHeaders = await headers();
  const locale = localeFromPath(requestHeaders.get('x-plg-request-path'));
  return <NotFoundView locale={locale} />;
}
