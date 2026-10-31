import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';
const safeCorrelationId = /^[A-Za-z0-9._:-]{1,128}$/;

export class CorrelationIdMiddleware {
  readonly use = (request: Request, response: Response, next: NextFunction): void => {
    const incoming = request.header(CORRELATION_HEADER);
    const correlationId = incoming && safeCorrelationId.test(incoming) ? incoming : randomUUID();
    request.headers[CORRELATION_HEADER] = correlationId;
    response.setHeader(CORRELATION_HEADER, correlationId);
    next();
  };
}
