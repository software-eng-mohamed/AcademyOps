import { createHash, timingSafeEqual } from 'node:crypto';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PUBLIC_ROUTE, type AuthenticatedRequest } from './decorators';
import { SessionAccessService } from './session-access.service';
import { sessionCookieName } from '../auth/session-cookie.helper';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionAccessService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = sessionCookieName(this.config);
    const rawToken = (request.cookies?.[cookieName] ??
      request.cookies?.['plg_session'] ??
      request.cookies?.['__Host-plg_session']) as string | undefined;
    if (!rawToken)
      throw new UnauthorizedException({
        code: 'SESSION_REQUIRED',
        messageKey: 'auth.sessionRequired',
      });

    const session = await this.sessions.authenticateHttpSession(rawToken);
    this.verifyCsrf(request, session.csrfSecretHash);
    request.accessContext = await this.sessions.buildHttpAccessContext(session);
    request.sessionId = session.id;
    return true;
  }

  private verifyCsrf(request: Request, expectedHash: string): void {
    if (safeMethods.has(request.method)) return;
    const origin = request.header('origin');
    const expectedOrigin = this.config.getOrThrow<string>('WEB_ORIGIN');
    const host = request.header('host');
    const forwardedHost = request.header('x-forwarded-host');
    const forwardedProto = request.header('x-forwarded-proto') ?? 'http';
    const matchesHost =
      origin === expectedOrigin ||
      (host && (origin === `http://${host}` || origin === `https://${host}`)) ||
      (forwardedHost && origin === `${forwardedProto}://${forwardedHost}`);
    const fetchSite = request.header('sec-fetch-site');
    if (!matchesHost || (fetchSite && !['same-origin', 'same-site'].includes(fetchSite))) {
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_INVALID',
        messageKey: 'auth.csrfOriginInvalid',
      });
    }
    const token = request.header('x-csrf-token');
    if (!token || !safeEquals(digest(token), expectedHash)) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        messageKey: 'auth.csrfTokenInvalid',
      });
    }
  }
}
