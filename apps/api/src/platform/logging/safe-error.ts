const safeCodePattern = /^[A-Za-z0-9_.:-]{1,80}$/;

export function safeErrorSummary(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  const code =
    'code' in error && typeof error.code === 'string' && safeCodePattern.test(error.code)
      ? error.code
      : undefined;
  return code ? `${error.name}:${code}` : error.name;
}

export function developmentErrorStack(error: unknown): string | undefined {
  if (process.env.NODE_ENV === 'production' || !(error instanceof Error)) return undefined;
  return error.stack;
}
