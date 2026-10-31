import { describe, expect, it } from 'vitest';
import { IdempotencyService } from '../src/platform/idempotency/idempotency.service';

describe('idempotency request hashing', () => {
  it('is stable across object key order while retaining array order', () => {
    const service = new IdempotencyService() as unknown as {
      hash(value: unknown): string;
    };
    expect(service.hash({ b: 2, a: [1, 2] })).toBe(service.hash({ a: [1, 2], b: 2 }));
    expect(service.hash({ a: [1, 2] })).not.toBe(service.hash({ a: [2, 1] }));
  });
});
