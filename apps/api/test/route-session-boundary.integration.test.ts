import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('route session boundary', () => {
  it('rejects unauthenticated requests on every protected OpenAPI operation', () => {
    const script = String.raw`
      require('reflect-metadata');
      const { readFileSync } = require('node:fs');
      const { resolve } = require('node:path');
      const { NestFactory } = require('@nestjs/core');
      const { VersioningType } = require('@nestjs/common');
      const { AppModule } = require('./src/app.module');

      const publicOperations = new Set([
        'GET /api/v1/health/live',
        'GET /api/v1/health/ready',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/password/reset/request',
        'POST /api/v1/auth/password/reset/complete',
        'POST /api/v1/auth/phone-otp/request',
        'POST /api/v1/auth/phone-otp/verify',
        'POST /api/v1/student-registrations',
        'GET /api/v1/certificates/verify/{token}',
        'GET /api/v1/files/{id}/content',
        'POST /api/v1/webhooks/paymob/transaction',
      ]);
      const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
      const spec = JSON.parse(
        readFileSync(resolve('../../packages/api-client/openapi.json'), 'utf8'),
      );
      const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => methods.has(method))
          .map((method) => ({
            key: method.toUpperCase() + ' ' + path,
            method: method.toUpperCase(),
            path,
          })),
      );
      const protectedOperations = operations.filter(({ key }) => !publicOperations.has(key));
      const concretePath = (path) => path.replace(/\{([^}]+)\}/g, (_match, name) => {
        if (name === 'token') return 'invalid-token';
        if (name === 'command') return 'plan';
        return '00000000-0000-4000-8000-000000000000';
      });

      (async () => {
        const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
        app.setGlobalPrefix('api');
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        await app.listen(0, '127.0.0.1');
        const { port } = app.getHttpServer().address();
        const failures = [];
        for (let index = 0; index < protectedOperations.length; index += 16) {
          const batch = protectedOperations.slice(index, index + 16);
          const results = await Promise.all(batch.map(async (operation) => {
            const response = await fetch(
              'http://127.0.0.1:' + port + concretePath(operation.path),
              {
                method: operation.method,
                headers: { accept: 'application/json', 'content-type': 'application/json' },
                ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(operation.method)
                  ? { body: '{}' }
                  : {}),
                redirect: 'manual',
              },
            );
            const body = await response.json().catch(() => ({}));
            return { key: operation.key, status: response.status, code: body.code };
          }));
          failures.push(...results.filter(({ status, code }) =>
            status !== 401 || code !== 'SESSION_REQUIRED',
          ));
        }
        console.log(JSON.stringify({
          operations: operations.length,
          publicOperations: publicOperations.size,
          protectedOperations: protectedOperations.length,
          failures,
        }));
        await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
        process.exit(failures.length ? 2 : 0);
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      '"operations":221,"publicOperations":11,"protectedOperations":210,"failures":[]',
    );
  }, 130_000);
});
