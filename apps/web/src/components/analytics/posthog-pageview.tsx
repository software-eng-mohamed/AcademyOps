'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Suspense, useEffect } from 'react';

/**
 * Tracks page views on route changes.
 *
 * Uses sanitized route template — only the pathname structure is sent,
 * not the full URL or query parameters, to preserve user privacy.
 *
 * Must be wrapped in <Suspense> because useSearchParams() requires it
 * in the Next.js App Router.
 */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog || !pathname) return;

    // Build a sanitized URL with only the path (no query params with PII)
    let url = window.origin + pathname;
    if (searchParams?.toString()) {
      url += `?${searchParams.toString()}`;
    }

    posthog.capture('$pageview', {
      $current_url: url,
      // Send sanitized route template instead of raw path
      route_template: sanitizeRoute(pathname),
    });
  }, [pathname, searchParams, posthog]);

  return null;
}

/**
 * Sanitize dynamic route segments to templates.
 * e.g. `/ar/students/abc123` → `/[locale]/students/[id]`
 */
function sanitizeRoute(pathname: string): string {
  return pathname
    .replace(/^\/(ar|en)\//, '/[locale]/')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/[id]')
    .replace(/\/\d+/g, '/[id]');
}

/**
 * PostHog page view tracker wrapped in Suspense.
 * Place this in the root layout body.
 */
export function PostHogPageView() {
  if (process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== 'true') {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
