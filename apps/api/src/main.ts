import 'reflect-metadata';
import './platform/patch-uuid';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import type { Express, NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import helmet from 'helmet';
import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './platform/http/api-exception.filter';
import { CorrelationIdMiddleware } from './platform/http/correlation-id.middleware';
import { NoStoreInterceptor, setNoStoreHeaders } from './platform/http/no-store.interceptor';
import { RealtimeSocketIoAdapter } from './realtime/realtime-socket-io.adapter';
import { useBoundedBodyParsers } from './platform/http/bounded-body-parser';
import { isAllowedCorsOrigin } from './platform/http/cors-policy';
import { IdentifierParamPipe } from './platform/http/identifier-param.pipe';
import { ApiMetricsService } from './observability/api-metrics.service';
import { trustedProxyAddress } from './platform/http/trusted-proxy';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get(ConfigService);
  const express = app.getHttpAdapter().getInstance() as Express;
  const trustedProxyIp = config.get<string>('TRUSTED_PROXY_IP');
  express.set('trust proxy', trustedProxyIp ? trustedProxyAddress(trustedProxyIp) : false);
  express.set('query parser', 'simple');
  express.disable('x-powered-by');
  app.useWebSocketAdapter(
    new RealtimeSocketIoAdapter(app, config.getOrThrow<string>('WEB_ORIGIN')),
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  const corsOrigin: CustomOrigin = (requestOrigin, callback) => {
    callback(null, isAllowedCorsOrigin(webOrigin, requestOrigin));
  };
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'X-Correlation-Id',
      'X-CSRF-Token',
    ],
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 600,
  });
  app.use(
    helmet({
      contentSecurityPolicy: webOrigin.startsWith('https://')
        ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }
        : false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(new CorrelationIdMiddleware().use);
  app.use(
    compression({
      threshold: 1_024,
      filter: (request: Request, response: Response) => {
        if (request.headers['x-no-compression']) return false;
        return compression.filter(request, response);
      },
    }),
  );
  app.use(app.get(ApiMetricsService).middleware());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    setNoStoreHeaders(response);
    next();
  });
  useBoundedBodyParsers(app);
  app.use(cookieParser());
  app.useGlobalPipes(
    new IdentifierParamPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new NoStoreInterceptor());

  app.enableShutdownHooks();
  await app.listen(config.get<number>('API_PORT') ?? 3001, '0.0.0.0');
  const httpServer = app.getHttpServer() as Server;
  httpServer.requestTimeout = 120_000;
  httpServer.headersTimeout = 15_000;
  httpServer.keepAliveTimeout = 5_000;
  httpServer.maxHeadersCount = 100;
  httpServer.maxRequestsPerSocket = 1_000;
}

void bootstrap();
