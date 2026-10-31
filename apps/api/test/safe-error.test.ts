import { describe, expect, it, vi } from 'vitest';
import { developmentErrorStack, safeErrorSummary } from '../src/platform/logging/safe-error';

describe('safe operational errors', () => {
  it('keeps only a bounded machine code and never the sensitive message', () => {
    const error = Object.assign(new Error('password=secret'), { code: 'ECONNRESET' });
    expect(safeErrorSummary(error)).toBe('Error:ECONNRESET');
    expect(safeErrorSummary(error)).not.toContain('secret');
  });

  it('suppresses stacks in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(developmentErrorStack(new Error('secret'))).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
