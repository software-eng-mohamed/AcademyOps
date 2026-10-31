'use client';

import { PlgHttpTransport } from '@academyops/api-client/http';
import { notifyAuthExpired } from './auth-events';
import { readCsrfToken } from './csrf';
import { demoAwareFetch } from './demo-fetch';

export const browserTransport = new PlgHttpTransport({
  // Orval emits absolute application paths such as `/api/v1/auth/login`.
  // Keeping the base empty prevents `/api/v1/api/v1/...` from being produced.
  baseUrl: '',
  fetch: demoAwareFetch,
  getCsrfToken: readCsrfToken,
  onUnauthorized: (error) => {
    // A session challenge can expire while the user's login is still valid.
    if (error.payload.code !== 'QR_INVALID_OR_EXPIRED') notifyAuthExpired();
  },
  timeoutMs: 15_000,
});
