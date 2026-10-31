import { setTimeout as delay } from 'node:timers/promises';

// A slow API must not make Turbo terminate the API that we are waiting for.
// This is a development-only grace period, not a prerequisite for running Next.js.
export async function waitForDevApi(
  readinessUrl,
  {
    timeoutMs = 180_000,
    pollIntervalMs = 1_000,
    requestTimeoutMs = 2_000,
    fetchImpl = fetch,
    sleep = delay,
    now = Date.now,
    log = console.log,
    warn = console.warn,
  } = {},
) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let nextProgressAt = startedAt + 15_000;
  let lastStatus = 'not contacted';
  log(`[web] Waiting for API readiness at ${readinessUrl.href}`);

  while (now() < deadline) {
    try {
      const response = await fetchImpl(readinessUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, deadline - now()))),
      });
      // Only the status matters; release the response stream between probes.
      await response.body?.cancel();
      if (response.ok) {
        log('[web] API is ready. Starting Next.js.');
        return true;
      }
      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error?.name === 'TimeoutError' ? 'request timed out' : 'connection unavailable';
    }

    if (now() >= nextProgressAt) {
      log(`[web] API still starting (${Math.round((now() - startedAt) / 1_000)}s; ${lastStatus}).`);
      nextProgressAt = now() + 15_000;
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(pollIntervalMs, remaining));
  }

  warn(
    `[web] API is not ready after ${timeoutMs / 1_000}s (${lastStatus}). ` +
      'Starting Next.js without stopping the API or worker. ' +
      'API-backed pages require the API to finish starting; check the @academyops/api:dev logs.',
  );
  return false;
}
