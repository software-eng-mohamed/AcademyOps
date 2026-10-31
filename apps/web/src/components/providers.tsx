'use client';

import { PlgMotionProvider, ToastProvider, TooltipProvider } from '@academyops/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createApiQueryClient } from '@/api/query/client';
import { PostHogPageView } from '@/components/analytics/posthog-pageview';
import { PostHogAnalyticsProvider } from '@/components/analytics/posthog-provider';
import { PostHogWebVitals } from '@/components/analytics/posthog-web-vitals';

if (typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as unknown as { crypto: Record<string, unknown> }).crypto = {};
  }
  if (typeof window.crypto.randomUUID !== 'function') {
    window.crypto.randomUUID = () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createApiQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
      <PlgMotionProvider>
        <QueryClientProvider client={queryClient}>
          <PostHogAnalyticsProvider>
            <TooltipProvider>
              <ToastProvider>
                <PostHogPageView />
                <PostHogWebVitals />
                {children}
              </ToastProvider>
            </TooltipProvider>
          </PostHogAnalyticsProvider>
          {process.env.NODE_ENV === 'development' &&
          process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === 'true' ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}
        </QueryClientProvider>
      </PlgMotionProvider>
    </ThemeProvider>
  );
}
