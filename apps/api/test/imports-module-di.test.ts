import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('ImportsModule dependency injection', () => {
  it('resolves importer collaborators and exposes its OpenAPI routes', () => {
    const script = `
      require('reflect-metadata');
      const { NestFactory } = require('@nestjs/core');
      const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
      const { AppModule } = require('./src/app.module');
      (async () => {
        const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
        const document = SwaggerModule.createDocument(
          app,
          new DocumentBuilder().setTitle('imports-smoke').build(),
        );
        const hasImports = Object.keys(document.paths).some((path) => path.includes('imports/batches'));
        console.log(JSON.stringify({ hasImports }));
        await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 1000))]);
        process.exit(hasImports ? 0 : 2);
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 90_000,
        env: { ...process.env, WHATSAPP_AUTH_ENCRYPTION_KEY: '' },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"hasImports":true');
  }, 100_000);
});
