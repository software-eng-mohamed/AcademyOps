import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CORRELATION_HEADER } from './correlation-id.middleware';

type ErrorResponse = {
  code: string;
  messageKey: string;
  correlationId: string;
  fieldErrors: Array<{ field: string; messageKey: string }>;
};

function isPayloadTooLarge(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;
  return (
    'type' in exception &&
    exception.type === 'entity.too.large' &&
    'status' in exception &&
    exception.status === HttpStatus.PAYLOAD_TOO_LARGE
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const payloadTooLarge = isPayloadTooLarge(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : payloadTooLarge
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const normalized = payloadTooLarge
      ? { code: 'PAYLOAD_TOO_LARGE', messageKey: 'errors.payloadTooLarge' }
      : this.normalizePayload(payload);
    const correlationId = String(request.headers[CORRELATION_HEADER] ?? '');

    if (status >= 500) {
      const error = exception instanceof Error ? exception : null;
      const structuredCode =
        typeof exception === 'object' && exception !== null && 'code' in exception
          ? String(exception.code)
          : null;
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_http_exception',
          correlationId,
          errorName: error?.name ?? typeof exception,
          errorCode: structuredCode,
          ...(process.env.NODE_ENV === 'production' ? {} : { message: error?.message ?? null }),
        }),
        process.env.NODE_ENV === 'production' ? undefined : error?.stack,
      );
    }

    const body: ErrorResponse = {
      code: normalized.code ?? `HTTP_${status}`,
      messageKey: normalized.messageKey ?? (status >= 500 ? 'errors.internal' : 'errors.request'),
      correlationId,
      fieldErrors: normalized.fieldErrors ?? [],
    };
    response.status(status).json(body);
  }

  private normalizePayload(payload: string | object | null): Partial<ErrorResponse> {
    if (!payload || typeof payload === 'string') return {};
    if ('code' in payload || 'messageKey' in payload || 'fieldErrors' in payload) {
      return payload as Partial<ErrorResponse>;
    }
    if ('message' in payload && Array.isArray(payload.message)) {
      return {
        code: 'VALIDATION_FAILED',
        messageKey: 'errors.validation',
        fieldErrors: payload.message.map((message) => ({
          field: 'request',
          messageKey: String(message),
        })),
      };
    }
    return {};
  }
}
