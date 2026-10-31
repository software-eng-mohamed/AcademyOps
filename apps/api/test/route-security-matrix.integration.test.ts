import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('route security matrix', () => {
  it('enforces CSRF and no-grant denial across the complete protected route surface', () => {
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', 'test/route-security-matrix.child.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          ...process.env,
          SESSION_PEPPER: randomBytes(32).toString('hex'),
          PAYMOB_SECRET_KEY: 'route-matrix-test-secret',
          PAYMOB_PUBLIC_KEY: 'route-matrix-test-public',
          PAYMOB_HMAC_SECRET: 'route-matrix-test-hmac',
          PAYMOB_PAYMENT_METHOD_IDS: '1',
          PAYMOB_NOTIFICATION_URL: 'https://api.example.test/api/v1/webhooks/paymob/transaction',
          PAYMOB_REDIRECTION_URL: 'https://academy.example.test/ar/dashboard/student',
          PAYMOB_CHECKOUT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(
      /"operations":221,"publicOperations":11,"protected":210,"unsafe":132,"permissionOperations":195,"failures":\[\]/,
    );
  }, 190_000);
});
