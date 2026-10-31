import type { INestApplication } from '@nestjs/common';
import express from 'express';

const jsonBodyLimitBytes = 100 * 1_024;
const formBodyLimitBytes = 32 * 1_024;

export function useBoundedBodyParsers(app: INestApplication): void {
  app.use(
    express.json({
      inflate: false,
      limit: jsonBodyLimitBytes,
      strict: true,
      type: ['application/json', 'application/*+json'],
    }),
  );
  app.use(
    express.urlencoded({
      extended: false,
      inflate: false,
      limit: formBodyLimitBytes,
      parameterLimit: 100,
    }),
  );
}
