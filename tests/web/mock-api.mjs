import { createServer } from 'node:http';

const ownerPermissionCodes = [
  'students.read_basic',
  'students.read_contact',
  'students.create',
  'students.registration.manage',
  'leads.read',
  'business_accounts.read',
  'academic.catalog.read',
  'academic.programs.manage',
  'academic.cohorts.manage',
  'academic.sessions.manage',
  'enrollments.read',
  'attendance.read',
  'certificates.read',
  'finance.reports.read',
  'finance.reports.export',
  'reports.operations.read',
  'payments.read',
  'invoices.read',
  'receipts.read',
  'exports.sensitive',
  'imports.preview',
  'audit.read',
  'legacy_archive.read',
  'messaging.otp.read',
  'users.manage',
  'roles.manage',
  'branches.manage',
];

const owner = {
  branches: [{ code: 'MAIN', id: 'branch-main', name: 'Main Branch' }],
  id: 'user-owner',
  localePreferenceSet: true,
  mfaRequired: true,
  mfaSetupRequired: false,
  mfaVerified: true,
  name: 'Development Owner',
  onboardingCompleted: true,
  organization: { code: 'ACADEMYOPS', id: 'organization-academyops', name: 'AcademyOps' },
  passwordChangeRequired: false,
  permissions: ownerPermissionCodes.map((code) => ({ code, scopes: ['O'] })),
  preferredLocale: 'en',
  roles: [{ code: 'OWNER', name: 'Owner' }],
  version: 1,
};

let notificationsRead = false;

/**
 * @param {import('node:http').IncomingMessage} request
 */
async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  /** @type {unknown} */
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return typeof parsed === 'object' && parsed !== null
    ? /** @type {Record<string, unknown>} */ (parsed)
    : {};
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (response.headersSent) return response.end();
    response.statusCode = 500;
    response.end(JSON.stringify({ code: 'TEST_SERVER_ERROR', messageKey: 'errors.internal' }));
  });
});

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
async function handleRequest(request, response) {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/health') {
    response.end(JSON.stringify({ status: 'healthy' }));
    return;
  }
  if (request.url === '/api/v1/health/live') {
    response.end(JSON.stringify({ service: 'api', status: 'healthy' }));
    return;
  }
  if (request.url === '/api/v1/auth/me' && request.method === 'GET') {
    if (!request.headers.cookie?.includes('plg_session=test-session')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ code: 'UNAUTHORIZED', messageKey: 'auth.unauthorized' }));
      return;
    }
    response.end(JSON.stringify(owner));
    return;
  }
  if (request.url?.startsWith('/api/v1/dashboard/overview') && request.method === 'GET') {
    if (!request.headers.cookie?.includes('plg_session=test-session')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ code: 'UNAUTHORIZED', messageKey: 'auth.unauthorized' }));
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1:3999');
    const branchId = url.searchParams.get('branchId');
    const fromMonth = url.searchParams.get('fromMonth') ?? '2026-03';
    const toMonth = url.searchParams.get('toMonth') ?? '2026-08';
    response.end(
      JSON.stringify({
        academyHealth: {
          failedOperations: 1,
          openImportIssues: 2,
          pendingApprovals: 3,
          pendingCertificateUploads: 4,
        },
        approvals: [
          {
            amount: '1450.00',
            currencyCode: 'EGP',
            entityId: 'enrollment-22',
            entityType: 'ENROLLMENT',
            id: 'approval-1',
            submittedAt: '2026-08-31T08:10:00.000Z',
            type: 'REFUND',
            version: 1,
          },
        ],
        attention: {
          bySeverity: { CRITICAL: 1, INFO: 0, WARNING: 1 },
          items: [
            {
              context: { studentName: 'Mariam Hassan' },
              entityId: 'installment-1',
              entityType: 'INSTALLMENT',
              id: 'attention-1',
              occurredAt: '2026-08-30T10:15:00.000Z',
              reasonCode: 'INSTALLMENT_OVERDUE',
              severity: 'CRITICAL',
            },
            {
              context: { studentName: 'Omar Ali' },
              entityId: 'enrollment-2',
              entityType: 'ENROLLMENT',
              id: 'attention-2',
              occurredAt: '2026-08-30T09:20:00.000Z',
              reasonCode: 'ATTENDANCE_NEAR_THRESHOLD',
              severity: 'WARNING',
            },
          ],
          total: 2,
        },
        branches: [
          { code: 'MAIN', id: 'branch-main', name: 'Main Branch' },
          { code: 'WEST', id: 'branch-west', name: 'West Branch' },
        ],
        financeHealth: {
          aging: {
            current: '128000.00',
            days1To30: '41000.00',
            days31To60: '18000.00',
            days61To90: '9500.00',
            days91Plus: '5000.00',
          },
          dueNext30Days: '92000.00',
          overdueBalance: '73500.00',
          overdueEnrollmentCount: 8,
        },
        generatedAt: '2026-08-31T10:30:00.000Z',
        kpis: {
          activeCohorts: branchId ? 6 : 12,
          activeStudents: branchId ? 64 : 128,
          attendanceRate: '0.8730',
          currencyCode: 'EGP',
          netCollectionsInPeriod: '485000.00',
          netCollectionsThisMonth: branchId ? '64000.00' : '128000.00',
          outstandingBalance: '73500.00',
        },
        range: {
          from: `${fromMonth}-01T00:00:00.000Z`,
          fromMonth,
          timeZone: 'Africa/Cairo',
          toExclusive: '2026-09-01T00:00:00.000Z',
          toMonth,
        },
        recentActivity: [
          {
            actionCode: 'payment.posted',
            actor: { name: 'Development Owner' },
            createdAt: '2026-08-31T09:25:00.000Z',
            entityId: 'payment-1',
            entityType: 'PAYMENT',
            id: 'activity-1',
          },
          {
            actionCode: 'attendance.recorded',
            actor: { name: 'Operations User' },
            createdAt: '2026-08-31T08:55:00.000Z',
            entityId: 'session-1',
            entityType: 'SESSION',
            id: 'activity-2',
          },
        ],
        salesPipeline: {
          byState: { DISQUALIFIED: 2, LOST: 4, NEW: 12, OPEN: 10, QUALIFIED: 8, WON: 7 },
          convertedLeadsThisMonth: 7,
          newLeadsThisMonth: 21,
          openLeads: 34,
          overdueFollowUps: 6,
        },
        selectedBranchId: branchId,
        timezone: 'Africa/Cairo',
        todaySessions: [
          {
            attendance: { checkedIn: 14, expected: 18 },
            attendanceWindowState: 'OPEN',
            cohort: { code: 'WD-26', name: 'Web Development 26' },
            deliveryMode: 'ONSITE',
            endsAt: '2026-08-31T12:00:00.000Z',
            id: 'session-1',
            program: { name: 'Web Development' },
            room: { name: 'Lab 2' },
            startsAt: '2026-08-31T10:00:00.000Z',
            status: 'IN_PROGRESS',
            trainer: { name: 'Ahmed Samir' },
          },
        ],
        trends: {
          attendanceHealth: { belowMinimum: 9, healthy: 87, nearThreshold: 18, noData: 14 },
          collections: [
            { period: '2026-03', value: 54000 },
            { period: '2026-04', value: 72000 },
            { period: '2026-05', value: 68000 },
            { period: '2026-06', value: 91000 },
            { period: '2026-07', value: 76000 },
            { period: '2026-08', value: branchId ? 64000 : 128000 },
          ],
          enrollments: [
            { period: '2026-03', value: 12 },
            { period: '2026-04', value: 16 },
            { period: '2026-05', value: 15 },
            { period: '2026-06', value: 22 },
            { period: '2026-07', value: 19 },
            { period: '2026-08', value: 27 },
          ],
        },
      }),
    );
    return;
  }
  if (request.url?.startsWith('/api/v1/notifications') && request.method === 'GET') {
    response.end(
      JSON.stringify({
        items: [
          {
            createdAt: '2026-08-31T15:45:00.000Z',
            id: 'notification-report-ready',
            payload: {},
            readAt: notificationsRead ? '2026-08-31T16:00:00.000Z' : null,
            subjectId: 'report-1',
            subjectType: 'REPORT_EXPORT',
            type: 'REPORT_READY',
          },
        ],
        nextCursor: null,
        unreadCount: notificationsRead ? 0 : 1,
      }),
    );
    return;
  }
  if (
    request.url?.startsWith('/api/v1/notifications/') &&
    request.url.endsWith('/read') &&
    request.method === 'POST'
  ) {
    if (request.headers['x-csrf-token'] !== 'test-csrf') {
      response.statusCode = 403;
      response.end(
        JSON.stringify({ code: 'CSRF_TOKEN_INVALID', messageKey: 'auth.csrfTokenInvalid' }),
      );
      return;
    }
    notificationsRead = true;
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.url === '/api/v1/notifications/read-all' && request.method === 'POST') {
    if (request.headers['x-csrf-token'] !== 'test-csrf') {
      response.statusCode = 403;
      response.end(
        JSON.stringify({ code: 'CSRF_TOKEN_INVALID', messageKey: 'auth.csrfTokenInvalid' }),
      );
      return;
    }
    notificationsRead = true;
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.url === '/api/v1/auth/logout' && request.method === 'POST') {
    if (!request.headers.cookie?.includes('plg_session=test-session')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ code: 'UNAUTHORIZED', messageKey: 'auth.unauthorized' }));
      return;
    }
    response.statusCode = 201;
    response.setHeader('set-cookie', [
      'plg_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax',
      'plg_csrf=; Path=/; Max-Age=0; SameSite=Lax',
    ]);
    response.end('null');
    return;
  }
  if (request.url === '/api/v1/auth/phone-otp/request' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (body.organizationCode !== 'ACADEMYOPS') {
      response.statusCode = 400;
      response.end(JSON.stringify({ code: 'VALIDATION_FAILED', messageKey: 'validation.failed' }));
      return;
    }
    if (body.password !== 'strong-password') {
      response.statusCode = 401;
      response.end(
        JSON.stringify({
          code: 'INVALID_CREDENTIALS',
          correlationId: 'corr-invalid-phone-password',
          messageKey: 'auth.invalidCredentials',
        }),
      );
      return;
    }
    response.statusCode = 202;
    response.end(JSON.stringify({ accepted: true }));
    return;
  }
  if (request.url === '/api/v1/auth/phone-otp/verify' && request.method === 'POST') {
    const body = await readJsonBody(request);
    if (body.code !== '654321') {
      response.statusCode = 401;
      response.end(
        JSON.stringify({
          code: 'PHONE_OTP_INVALID',
          correlationId: 'corr-invalid-phone-otp',
          messageKey: 'auth.phoneOtpInvalid',
        }),
      );
      return;
    }
    response.statusCode = 201;
    response.setHeader('set-cookie', [
      'plg_session=test-session; Path=/; HttpOnly; SameSite=Lax',
      'plg_csrf=test-csrf; Path=/; SameSite=Lax',
    ]);
    response.end(
      JSON.stringify({
        expiresAt: '2026-08-30T00:00:00.000Z',
        mfaSetupRequired: false,
        passwordChangeRequired: false,
      }),
    );
    return;
  }
  if (request.url === '/api/v1/auth/login' && request.method === 'POST') {
    const body = await readJsonBody(request);

    if (body.organizationCode !== 'ACADEMYOPS') {
      response.statusCode = 400;
      response.end(JSON.stringify({ code: 'VALIDATION_FAILED', messageKey: 'validation.failed' }));
      return;
    }
    if (body.identifier === 'rate-limit@plg.test') {
      response.statusCode = 429;
      response.setHeader('retry-after', '2');
      response.end(
        JSON.stringify({
          code: 'RATE_LIMIT_EXCEEDED',
          correlationId: 'corr-rate-limit',
          messageKey: 'security.rateLimitExceeded',
        }),
      );
      return;
    }
    if (body.password === 'wrong-password') {
      response.statusCode = 401;
      response.end(
        JSON.stringify({
          code: 'INVALID_CREDENTIALS',
          correlationId: 'corr-invalid-login',
          messageKey: 'auth.invalidCredentials',
        }),
      );
      return;
    }
    if (body.identifier === 'mfa@plg.test' && !body.totpCode && !body.recoveryCode) {
      response.statusCode = 409;
      response.end(JSON.stringify({ code: 'MFA_REQUIRED', messageKey: 'auth.mfaRequired' }));
      return;
    }
    if (body.identifier === 'mfa@plg.test' && body.totpCode !== '123456') {
      response.statusCode = 401;
      response.end(JSON.stringify({ code: 'MFA_CODE_INVALID', messageKey: 'auth.mfaInvalid' }));
      return;
    }

    response.statusCode = 201;
    response.setHeader('set-cookie', [
      'plg_session=test-session; Path=/; HttpOnly; SameSite=Lax',
      'plg_csrf=test-csrf; Path=/; SameSite=Lax',
    ]);
    response.end(
      JSON.stringify({
        expiresAt: '2026-08-30T00:00:00.000Z',
        mfaSetupRequired: false,
        passwordChangeRequired: false,
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ code: 'NOT_FOUND', messageKey: 'errors.notFound' }));
}

server.listen(3999, '127.0.0.1');

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
