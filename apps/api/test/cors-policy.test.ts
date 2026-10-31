import { describe, expect, it } from 'vitest';
import { isAllowedCorsOrigin } from '../src/platform/http/cors-policy';

describe('exact CORS origin policy', () => {
  const expected = 'https://academy.example.com';

  it('allows same-origin browser requests and clients without an Origin header', () => {
    expect(isAllowedCorsOrigin(expected, expected)).toBe(true);
    expect(isAllowedCorsOrigin(expected)).toBe(true);
  });

  it.each([
    'https://attacker.example',
    'https://academy.example.com.attacker.example',
    'http://academy.example.com',
    'null',
  ])('does not emit CORS permission for %s', (origin) => {
    expect(isAllowedCorsOrigin(expected, origin)).toBe(false);
  });
});
