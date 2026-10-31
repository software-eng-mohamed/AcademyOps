import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function emit(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const config = new DocumentBuilder()
    .setTitle('AcademyOps API')
    .setDescription('Command-oriented API for AcademyOps V1')
    .setVersion('1.0')
    .addCookieAuth('plg_session')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const output = resolve(process.cwd(), '../../packages/api-client/openapi.json');
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await Promise.race([
    app.close(),
    new Promise<void>((resolveClose) => setTimeout(resolveClose, 1_000)),
  ]);
  process.exit(0);
}

void emit().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`OpenAPI generation failed:\n${detail}`);
  process.exit(1);
});
