import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import type { Request } from 'express';

export const PUBLIC_ROUTE = 'plg:public';
export const REQUIRED_PERMISSION = 'plg:permission';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);
export const RequirePermission = (permission: PermissionCode): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export type AuthenticatedRequest = Request & {
  accessContext?: AccessContext;
  sessionId?: string;
};

export const CurrentAccess = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): AccessContext => {
    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.accessContext) throw new Error('AccessContext was not populated');
    return request.accessContext;
  },
);
