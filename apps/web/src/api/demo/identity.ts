import type { CurrentUserSummaryDto } from '@/api/generated/models/currentUserSummaryDto';
import { UserPermissionGrantDtoCode } from '@/api/generated/models/userPermissionGrantDtoCode';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from './credentials';
import {
  baseRecord,
  branchId,
  bump,
  type DemoContext,
  type DemoRecord,
  type DemoState,
  demoId,
  failure,
  find,
  invalid,
  json,
  notFound,
  organizationId,
  ownerId,
  records,
  timestamp,
  unsupported,
} from './shared';

const permissions = Object.values(UserPermissionGrantDtoCode);

export function demoUser(state: DemoState): CurrentUserSummaryDto {
  return {
    id: ownerId,
    version: 1,
    name: 'Demo Owner',
    preferredLocale: state.locale,
    localePreferenceSet: true,
    onboardingCompleted: true,
    passwordChangeRequired: false,
    mfaRequired: false,
    mfaVerified: true,
    mfaSetupRequired: false,
    organization: {
      id: organizationId,
      code: DEMO_ORGANIZATION,
      name: 'AcademyOps Learning Studio',
    },
    branches: [{ id: branchId, code: 'CAIRO', name: 'Cairo Studio' }],
    roles: [{ code: 'OWNER', name: 'Owner' }],
    permissions: permissions.map((code) => ({ code, scopes: ['O'] })),
  };
}

export function identityFixtures(): Record<string, DemoRecord[]> {
  const branch = baseRecord(branchId, { code: 'CAIRO', name: 'Cairo Studio', isActive: true });
  const role = baseRecord(demoId(3000), {
    code: 'OWNER',
    name: 'Owner',
    isSystem: true,
    grants: permissions.map((permissionCode) => ({ permissionCode, scope: 'O' })),
  });
  return {
    branches: [branch],
    roles: [role],
    users: [
      baseRecord(ownerId, {
        name: 'Demo Owner',
        publicId: 'AO-OWNER',
        status: 'ACTIVE',
        roles: [{ id: role.id, code: 'OWNER', name: 'Owner' }],
        branches: [branch],
        identifiers: [{ type: 'EMAIL', normalizedValue: DEMO_EMAIL, verifiedAt: timestamp(-30) }],
      }),
      baseRecord(demoId(3001), {
        name: 'Mariam Khalil',
        publicId: 'AO-OPS',
        status: 'ACTIVE',
        roles: [{ id: demoId(3002), code: 'OPERATIONS', name: 'Operations' }],
        branches: [branch],
        identifiers: [{ type: 'EMAIL', normalizedValue: 'operations@example.test' }],
      }),
    ],
    notifications: [
      baseRecord(demoId(3010), {
        type: 'REPORT_READY',
        subjectType: 'REPORT_EXPORT',
        subjectId: demoId(2400),
        payload: {},
        readAt: null,
        createdAt: timestamp(0, 8),
      }),
      baseRecord(demoId(3011), {
        type: 'INSTALLMENT_DUE',
        subjectType: 'ENROLLMENT',
        subjectId: demoId(302),
        payload: { studentName: 'Nour Adel' },
        readAt: null,
        createdAt: timestamp(-1, 12),
      }),
    ],
    'audit-events': [
      baseRecord(demoId(3020), {
        action: 'enrollment.activated',
        entityType: 'ENROLLMENT',
        entityId: demoId(300),
        actor: { id: ownerId, name: 'Demo Owner' },
        actorUserId: ownerId,
        metadata: { synthetic: true },
        createdAt: timestamp(-1, 10),
      }),
    ],
    imports: [],
    legacyArchive: [],
  };
}

export function handleIdentityRoute(ctx: DemoContext): Response | null {
  const { path, method, state, body } = ctx;
  if (path[0] === 'health' && method === 'GET') return json({ service: 'demo', status: 'healthy' });
  if (path[0] === 'auth') {
    if (path[1] === 'login' && method === 'POST') {
      if (
        body.identifier !== DEMO_EMAIL ||
        body.password !== DEMO_PASSWORD ||
        body.organizationCode !== DEMO_ORGANIZATION
      )
        return failure('INVALID_CREDENTIALS', 401, 'auth.invalidCredentials');
      state.authenticated = true;
      return json(
        { expiresAt: timestamp(1), mfaSetupRequired: false, passwordChangeRequired: false },
        201,
      );
    }
    if (path[1] === 'me' && path.length === 2 && method === 'GET')
      return state.authenticated
        ? json(demoUser(state))
        : failure('UNAUTHORIZED', 401, 'auth.unauthorized');
    if (!state.authenticated) return failure('UNAUTHORIZED', 401, 'auth.unauthorized');
    if (path[1] === 'logout' && method === 'POST') {
      state.authenticated = false;
      return json(null, 201);
    }
    if (path[2] === 'preferences' && method === 'PATCH') {
      if (body.preferredLocale !== 'en' && body.preferredLocale !== 'ar') return invalid();
      state.locale = body.preferredLocale;
      return json(demoUser(state));
    }
    if (path[2] === 'onboarding' && path[3] === 'complete' && method === 'POST')
      return json(demoUser(state), 201);
    return unsupported();
  }
  if (path[0] === 'notifications') {
    const items = records(state, 'notifications');
    if (method === 'GET' && path.length === 1)
      return json({
        items: items.filter((item) => !item.readAt),
        nextCursor: null,
        unreadCount: items.filter((item) => !item.readAt).length,
      });
    if (method === 'POST' && path[1] === 'read-all') {
      for (const item of items) bump(item, { readAt: timestamp() });
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && path[2] === 'read') {
      const item = find(state, 'notifications', path[1]);
      if (!item) return notFound();
      bump(item, { readAt: timestamp() });
      return new Response(null, { status: 204 });
    }
  }
  if (path[0] === 'messaging' && path[1] === 'otp-channel') {
    if (method !== 'GET') return unsupported();
    return json({
      id: null,
      provider: 'BAILEYS',
      enabled: false,
      state: 'DISABLED',
      otpAvailable: false,
      needsQr: false,
      phoneMasked: null,
      lastErrorCode: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastHeartbeatAt: null,
      qrExpiresAt: null,
      version: 1,
    });
  }
  if (path[0] === 'realtime') return unsupported();
  return null;
}
