let pendingMutation: Promise<void> = Promise.resolve();

/** Keep cookie-backed demo edits ordered; ordinary application requests are unchanged. */
export function demoAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const isDemo =
    typeof document !== 'undefined' && document.documentElement.dataset.academyopsDemo === 'true';
  if (!isDemo || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return globalThis.fetch(input, init);

  const run = () => {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    signal?.throwIfAborted();
    return globalThis.fetch(input, init);
  };
  const response = pendingMutation.then(run, run);
  pendingMutation = response.then(
    () => undefined,
    () => undefined,
  );
  return response;
}
