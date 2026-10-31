import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasFreshStepUp, requiresStepUpMfa } from '@academyops/contracts';
import type { PermissionCode } from '@academyops/contracts';
import { PUBLIC_ROUTE, REQUIRED_PERMISSION, type AuthenticatedRequest } from './decorators';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const permission = this.reflector.getAllAndOverride<PermissionCode>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const access = request.accessContext;
    if (!access?.grants.has(permission)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    if (requiresStepUpMfa.has(permission) && !hasFreshStepUp(access)) {
      throw new ForbiddenException({
        code: 'MFA_STEP_UP_REQUIRED',
        messageKey: 'auth.mfaStepUpRequired',
      });
    }
    return true;
  }
}
