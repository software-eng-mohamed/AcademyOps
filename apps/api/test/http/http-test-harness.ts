import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient, type Prisma } from '@prisma/client';
import { permissions as contractPermissions, type PermissionCode } from '@academyops/contracts';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import {
  csrfCookieName,
  issueUserSession,
  sessionCookieName,
} from '../../src/iam/auth/session-cookie.helper';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-exception.filter';
import { useBoundedBodyParsers } from '../../src/platform/http/bounded-body-parser';
import { CorrelationIdMiddleware } from '../../src/platform/http/correlation-id.middleware';
import { IdentifierParamPipe } from '../../src/platform/http/identifier-param.pipe';
import { recordHttpTestRoute } from './http-route-recorder';
class IntentionalRollback extends Error {}
export type HttpTestActor = {
  organizationId: string;
  personId: string;
  userId: string;
  branchId: string;
};
export type HttpTestContext = HttpTestActor & {
  app: INestApplication;
  baseUrl: string;
  prisma: Prisma.TransactionClient;
  safeHeaders: Record<string, string>;
  unsafeHeaders: Record<string, string>;
};
export type HttpSessionHeaders = {
  safeHeaders: Record<string, string>;
  unsafeHeaders: Record<string, string>;
};
type ProviderOverride = {
  token: unknown;
  value: unknown;
};
type ScenarioOptions = {
  permissions: PermissionCode[];
  roleCode?: string;
  overrides?: ProviderOverride[];
};
export async function runHttpScenario<T>(
  options: ScenarioOptions,
  work: (context: HttpTestContext) => Promise<T>,
): Promise<T> {
  const client = new PrismaClient();
  let result: T | undefined;
  try {
    await client.$transaction(
      async (transaction) => {
        const actor = await seedActor(transaction, options);
        const adapter = transactionAdapter(transaction);
        let builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(PrismaService)
          .useValue(adapter);
        for (const override of options.overrides ?? []) {
          builder = builder.overrideProvider(override.token as never).useValue(override.value);
        }
        const module = await builder.compile();
        const app = module.createNestApplication({ bodyParser: false });
        configureApp(app);
        await app.listen(0, '127.0.0.1');
        try {
          const config = app.get(ConfigService);
          const session = await issueUserSession(transaction, config.getOrThrow('SESSION_PEPPER'), {
            organizationId: actor.organizationId,
            userId: actor.userId,
            mfaVerified: options.roleCode !== 'STUDENT',
          });
          const cookie = [
            `${sessionCookieName(config)}=${session.sessionToken}`,
            `${csrfCookieName(config)}=${session.csrfToken}`,
          ].join('; ');
          const origin = config.getOrThrow<string>('WEB_ORIGIN');
          const safeHeaders = { accept: 'application/json', cookie };
          result = await work({
            ...actor,
            app,
            baseUrl: await app.getUrl(),
            prisma: transaction,
            safeHeaders,
            unsafeHeaders: {
              ...safeHeaders,
              origin,
              'x-correlation-id': randomUUID(),
              'x-csrf-token': session.csrfToken,
            },
          });
        } finally {
          await app.close();
        }
        throw new IntentionalRollback();
      },
      { maxWait: 10000, timeout: 120000 },
    );
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error;
  } finally {
    await client.$disconnect();
  }
  return result as T;
}
export async function issueHttpSession(
  context: Pick<HttpTestContext, 'app' | 'prisma' | 'organizationId'>,
  userId: string,
  mfaVerified = true,
): Promise<HttpSessionHeaders> {
  const config = context.app.get(ConfigService);
  const session = await issueUserSession(
    context.prisma,
    config.getOrThrow<string>('SESSION_PEPPER'),
    { organizationId: context.organizationId, userId, mfaVerified },
  );
  const cookie = [
    `${sessionCookieName(config)}=${session.sessionToken}`,
    `${csrfCookieName(config)}=${session.csrfToken}`,
  ].join('; ');
  const safeHeaders = { accept: 'application/json', cookie };
  return {
    safeHeaders,
    unsafeHeaders: {
      ...safeHeaders,
      origin: config.getOrThrow<string>('WEB_ORIGIN'),
      'x-correlation-id': randomUUID(),
      'x-csrf-token': session.csrfToken,
    },
  };
}
async function seedActor(
  transaction: Prisma.TransactionClient,
  options: ScenarioOptions,
): Promise<HttpTestActor> {
  const organization = await transaction.organization.create({
    data: {
      code: `HTTP-${randomUUID().slice(0, 8)}`.toUpperCase(),
      name: 'HTTP integration test',
    },
  });
  const branch = await transaction.branch.create({
    data: {
      organizationId: organization.id,
      code: 'MAIN',
      name: 'Main',
    },
  });
  const person = await transaction.person.create({
    data: {
      organizationId: organization.id,
      publicId: `HTTP-${randomUUID().slice(0, 18)}`,
      name: 'HTTP Actor',
    },
  });
  const user = await transaction.user.create({
    data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
  });
  const role = await transaction.role.create({
    data: {
      organizationId: organization.id,
      code: options.roleCode ?? 'HTTP_TEST',
      name: 'HTTP test',
    },
  });
  const allowedPermissions = new Set<string>(contractPermissions);
  if (options.permissions.some((permission) => !allowedPermissions.has(permission))) {
    throw new Error('Unknown test permission');
  }
  await transaction.permission.createMany({
    data: contractPermissions.map((code) => ({ code, description: code })),
    skipDuplicates: true,
  });
  await transaction.rolePermissionGrant.createMany({
    data: options.permissions.map((permissionCode) => ({
      organizationId: organization.id,
      roleId: role.id,
      permissionCode,
      scope: 'O',
    })),
  });
  await transaction.userRoleAssignment.create({
    data: { organizationId: organization.id, userId: user.id, roleId: role.id },
  });
  return {
    organizationId: organization.id,
    personId: person.id,
    userId: user.id,
    branchId: branch.id,
  };
}
function transactionAdapter(transaction: Prisma.TransactionClient): PrismaService {
  return new Proxy(transaction, {
    get(target, property) {
      if (property === '$connect' || property === '$disconnect') {
        return () => Promise.resolve(undefined);
      }
      if (property === '$transaction' || property === 'serializable') {
        return async <T>(work: (database: Prisma.TransactionClient) => Promise<T>) =>
          work(transaction);
      }
      const value = (target as unknown as Record<string | symbol, unknown>)[property];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as unknown as PrismaService;
}
function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(recordHttpTestRoute);
  app.use(new CorrelationIdMiddleware().use);
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
}
