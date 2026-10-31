'use client';

import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

/**
 * Reports Core Web Vitals to PostHog as custom events.
 *
 * Captures: LCP, FID, CLS, INP, TTFB — the essential performance metrics
 * that Google uses for search ranking. These arrive via the `web-vitals`
 * library which Next.js bundles and exposes through the performance
 * observer API.
 *
 * Events are sent once per metric per page load (no duplicates).
 */

type WebVitalMetric = {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
};

export function PostHogWebVitals() {
  const posthog = usePostHog();
  const reported = useRef(new Set<string>());

  useEffect(() => {
    if (!posthog || process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== 'true') return;

    async function reportVitals() {
      try {
        const webVitals = await import('web-vitals');

        const report = (metric: WebVitalMetric) => {
          // Avoid duplicate reports for the same metric instance
          if (reported.current.has(metric.id)) return;
          reported.current.add(metric.id);

          posthog.capture('web_vitals', {
            metric_name: metric.name,
            metric_value: metric.value,
            metric_rating: metric.rating,
            metric_delta: metric.delta,
            navigation_type: metric.navigationType,
            environment: process.env.NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT ?? 'unknown',
          });
        };

        // Register all Core Web Vitals observers
        // Note: FID was removed in web-vitals v4+ (replaced by INP)
        webVitals.onLCP(report);
        webVitals.onCLS(report);
        webVitals.onINP(report);
        webVitals.onTTFB(report);
      } catch {
        // web-vitals may not be available in all environments
      }
    }

    reportVitals();
  }, [posthog]);

  return null;
}
