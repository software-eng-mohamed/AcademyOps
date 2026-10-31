'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { type ReactNode, useEffect, useRef } from 'react';

/**
 * Privacy-first PostHog analytics provider.
 *
 * Gated behind `NEXT_PUBLIC_POSTHOG_ENABLED === 'true'`. When disabled,
 * renders children without any analytics overhead.
 *
 * Privacy policy (aligned with deploy/vps/README.md):
 * - `persistence: 'memory'` — no cookies, no localStorage, no cross-session tracking
 * - `autocapture: false` — no automatic click/form/change tracking
 * - `capture_pageview: false` — we handle page views manually via PostHogPageView
 * - `disable_session_recording: true` — no session replay
 * - `ip: false` — instruct PostHog to discard IP addresses server-side
 * - `property_denylist` — strip any accidentally-included PII fields
 *
 * The ingest path is routed through our own domain (`/e/`) via Caddy reverse
 * proxy to avoid ad-blocker interference and protect user privacy.
 */

const POSTHOG_ENABLED = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '';

export function PostHogAnalyticsProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!POSTHOG_ENABLED || !POSTHOG_KEY || initialized.current) return;
    if (typeof window === 'undefined') return;

    posthog.init(POSTHOG_KEY, {
      // Ingest through our Caddy reverse proxy to bypass ad-blockers
      api_host: POSTHOG_HOST || '/e',
      ui_host: 'https://us.posthog.com',

      // ── Privacy-first configuration ──────────────────────────────────
      persistence: 'memory',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
      disable_session_recording: true,
      ip: false,
      respect_dnt: true,

      // Strip PII fields from all events
      property_denylist: ['$ip', '$device_id', '$user_id', 'email', 'name', 'phone'],

      // ── Performance ──────────────────────────────────────────────────
      loaded: (ph) => {
        // In development, enable debug mode for visibility
        if (process.env.NODE_ENV === 'development') {
          ph.debug();
        }
      },
    });

    initialized.current = true;
  }, []);

  if (!POSTHOG_ENABLED || !POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
