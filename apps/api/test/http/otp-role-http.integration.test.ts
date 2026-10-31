import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { defaultRoleGrants } from '@academyops/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { SessionAccessService } from '../../src/iam/authorization/session-access.service';
import { OtpChannelQrService } from '../../src/messaging/otp-channel-qr.service';
import { databaseDescribe, headers, responseBody } from './attendance-role-http-support';
import { get, post } from './finance-http-client';
import { type HttpTestContext, runHttpScenario } from './http-test-harness';

const channel = z.object({
  state: z.string(),
  version: z.number(),
  enabled: z.boolean(),
  needsQr: z.boolean(),
  otpAvailable: z.boolean(),
});
async function operator(context: HttpTestContext) {
  const assignment = await context.prisma.userRoleAssignment.findFirstOrThrow({
    where: { userId: context.userId },
  });
  await context.prisma.rolePermissionGrant.createMany({
    data: defaultRoleGrants.OTP_OPERATOR.map(([permissionCode, scope]) => ({
      organizationId: context.organizationId,
      roleId: assignment.roleId,
      permissionCode,
      scope,
    })),
  });
  return assignment.roleId;
}
async function command(
  context: HttpTestContext,
  action: string,
  version: number,
  key = randomUUID(),
) {
  return post(
    context,
    `messaging/otp-channel/${action}`,
    { reason: `Synthetic operator ${action} verification` },
    { 'if-match': String(version), 'idempotency-key': key },
  );
}
async function report(context: HttpTestContext, data: Record<string, unknown>, expected = 204) {
  const response = await fetch(`${context.baseUrl}/api/v1/internal/otp-connector/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${context.app.get(ConfigService).getOrThrow<string>('OTP_CONNECTOR_INTERNAL_TOKEN')}`,
    },
    body: JSON.stringify({ organizationId: context.organizationId, ...data }),
  });
  expect(response.status).toBe(expected);
}

databaseDescribe('WhatsApp workspace with actual OTP Operator grants', () => {
  it('runs connect → private QR → healthy → stale → reset → disable and preserves QR on stale reports/replays', async () => {
    await runHttpScenario({ roleCode: 'OTP_OPERATOR', permissions: [] }, async (context) => {
      await operator(context);
      const qrStore = context.app.get(OtpChannelQrService);
      try {
        const initial = await get(context, 'messaging/otp-channel');
        expect(initial.headers.get('cache-control')).toContain('no-store');
        expect(await responseBody(initial, 200)).toMatchObject({ state: 'DISABLED', version: 0 });
        await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 409);
        for (const reason of ['', '          ', 'short', 'x'.repeat(501)]) {
          await responseBody(
            await post(context, 'messaging/otp-channel/connect', { reason }, headers(0)),
            400,
          );
        }
        const key = randomUUID();
        const started = channel.parse(
          await responseBody(await command(context, 'connect', 0, key), 200),
        );
        expect(started).toMatchObject({ state: 'STARTING', version: 1, enabled: true });
        const qr = `synthetic-otp-qr-${randomUUID()}`;
        const expiresAt = new Date(Date.now() + 60000).toISOString();
        await report(context, {
          commandVersion: 1,
          state: 'QR_REQUIRED',
          qr,
          qrExpiresAt: expiresAt,
        });
        const pairing = await get(context, 'messaging/otp-channel/pairing-code');
        expect(pairing.headers.get('cache-control')).toContain('no-store');
        expect(await responseBody(pairing, 200)).toEqual({ qr, expiresAt });
        expect(
          JSON.stringify(await responseBody(await get(context, 'messaging/otp-channel'), 200)),
        ).not.toContain(qr);
        await responseBody(await command(context, 'connect', 0, key), 200);
        expect(
          await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 200),
        ).toEqual({ qr, expiresAt });
        await report(
          context,
          {
            commandVersion: 0,
            state: 'QR_REQUIRED',
            qr: `old-${qr}`,
            qrExpiresAt: new Date(Date.now() + 50000).toISOString(),
          },
          409,
        );
        expect(
          await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 200),
        ).toEqual({ qr, expiresAt });
        await responseBody(await command(context, 'disable', 0), 409);
        await report(context, { commandVersion: 1, state: 'CONNECTED', phoneMasked: '***1234' });
        let current = channel.parse(
          await responseBody(await get(context, 'messaging/otp-channel'), 200),
        );
        expect(current).toMatchObject({ state: 'CONNECTED', otpAvailable: true, needsQr: false });
        expect(await qrStore.read(context.organizationId)).toBeNull();
        await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 409);
        await context.prisma.whatsappOtpChannel.update({
          where: { organizationId: context.organizationId },
          data: { lastHeartbeatAt: new Date(Date.now() - 76000) },
        });
        current = channel.parse(
          await responseBody(await get(context, 'messaging/otp-channel'), 200),
        );
        expect(current).toMatchObject({ state: 'STALE', otpAvailable: false });
        const reset = channel.parse(
          await responseBody(await command(context, 'reset', current.version), 200),
        );
        expect(reset.state).toBe('STARTING');
        const persisted = await context.prisma.whatsappOtpChannel.findUniqueOrThrow({
          where: { organizationId: context.organizationId },
        });
        expect(persisted.desiredState).toBe('LOGGED_OUT');
        const disableKey = randomUUID();
        const disabled = await responseBody(
          await command(context, 'disable', reset.version, disableKey),
          200,
        );
        expect(disabled).toMatchObject({ state: 'DISABLED', enabled: false, otpAvailable: false });
        expect(
          await responseBody(await command(context, 'disable', reset.version, disableKey), 200),
        ).toEqual(disabled);
        const audits = await context.prisma.auditEvent.findMany({
          where: { organizationId: context.organizationId, entityType: 'WhatsappOtpChannel' },
        });
        expect(audits.map((row) => row.action).sort()).toEqual([
          'messaging.otp.connect',
          'messaging.otp.disable',
          'messaging.otp.reset',
        ]);
        expect(JSON.stringify(audits)).not.toContain(qr);
      } finally {
        await qrStore.clear(context.organizationId);
      }
    });
  });

  it('requires fresh MFA, organization scopes and CSRF; never grants staff or connector administration to the operator', async () => {
    await runHttpScenario({ roleCode: 'OTP_OPERATOR', permissions: [] }, async (context) => {
      const roleId = await operator(context);
      for (const path of [
        'students',
        'enrollments',
        'payments',
        'roles',
        'users',
        'audit-events',
        'dashboard/overview',
      ]) {
        await responseBody(await get(context, path), 403);
      }
      const connector = await fetch(`${context.baseUrl}/api/v1/internal/otp-connector/channels`, {
        headers: context.safeHeaders,
      });
      expect(connector.status).toBe(404);
      const noCsrf = await fetch(`${context.baseUrl}/api/v1/messaging/otp-channel/connect`, {
        method: 'POST',
        headers: {
          ...context.safeHeaders,
          origin: context.unsafeHeaders.origin!,
          'content-type': 'application/json',
          ...headers(0),
        },
        body: JSON.stringify({ reason: 'Synthetic operator command' }),
      });
      expect(noCsrf.status).toBe(403);
      await context.prisma.userSession.updateMany({
        where: { userId: context.userId },
        data: { mfaVerifiedAt: new Date(Date.now() - 31 * 60000) },
      });
      await responseBody(await get(context, 'messaging/otp-channel'), 200);
      expect(await responseBody(await command(context, 'connect', 0), 403)).toMatchObject({
        code: 'MFA_STEP_UP_REQUIRED',
      });
      expect(
        await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 403),
      ).toMatchObject({ code: 'MFA_STEP_UP_REQUIRED' });
      await context.prisma.userSession.updateMany({
        where: { userId: context.userId },
        data: { mfaVerifiedAt: new Date() },
      });
      await context.prisma.rolePermissionGrant.deleteMany({
        where: { roleId, permissionCode: 'messaging.otp.manage' },
      });
      await responseBody(await get(context, 'messaging/otp-channel'), 200);
      await responseBody(await command(context, 'connect', 0), 403);
      await responseBody(await get(context, 'messaging/otp-channel/pairing-code'), 403);
      await context.prisma.rolePermissionGrant.updateMany({
        where: { roleId, permissionCode: 'messaging.otp.read' },
        data: { scope: 'S' },
      });
      await context.app.get(SessionAccessService).invalidateUserCache(context.userId);
      await responseBody(await get(context, 'messaging/otp-channel'), 403);
      expect(
        await context.prisma.whatsappOtpChannel.count({
          where: { organizationId: context.organizationId },
        }),
      ).toBe(0);
    });
  });

  it('returns only own-organization status and aggregate request/dispatch counts, never recipients or codes', async () => {
    await runHttpScenario({ roleCode: 'OTP_OPERATOR', permissions: [] }, async (context) => {
      await operator(context);
      const foreign = await context.prisma.organization.create({
        data: { code: `OTP-${randomUUID().slice(0, 8)}`, name: 'Other synthetic academy' },
      });
      await context.prisma.whatsappOtpChannel.create({
        data: {
          organizationId: foreign.id,
          enabled: true,
          state: 'CONNECTED',
          desiredState: 'CONNECTED',
          phoneMasked: '***9876',
          lastHeartbeatAt: new Date(),
        },
      });
      for (const [organizationId, processed, attempts] of [
        [context.organizationId, false, 0],
        [context.organizationId, false, 2],
        [context.organizationId, true, 1],
        [foreign.id, false, 0],
      ] as const) {
        await context.prisma.outboxEvent.create({
          data: {
            organizationId,
            type: 'security.phone_otp_requested',
            aggregateType: 'PhoneOtpChallenge',
            aggregateId: randomUUID(),
            payload: { recipient: 'private-recipient@e2e.invalid', code: 'private-synthetic-code' },
            occurredAt: new Date(Date.now() - 1000),
            processedAt: processed ? new Date() : null,
            attempts,
          },
        });
      }
      expect(await responseBody(await get(context, 'messaging/otp-channel'), 200)).toMatchObject({
        state: 'DISABLED',
        phoneMasked: null,
      });
      const overview = await responseBody(
        await get(context, 'dashboard/workspaces/OTP_OPERATOR'),
        200,
      );
      const parsed = z
        .object({
          channel: z.object({ state: z.string() }),
          staff: z.object({
            kind: z.literal('OTP_OPERATOR'),
            days: z.array(z.object({ count: z.number() })),
            pendingDispatch: z.number(),
            retryingDispatch: z.number(),
          }),
        })
        .parse(overview);
      expect(parsed.staff.days).toHaveLength(7);
      expect(parsed.staff.days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
      expect(parsed.staff).toMatchObject({ pendingDispatch: 2, retryingDispatch: 1 });
      for (const secret of ['private-recipient', 'private-synthetic-code', '***9876', foreign.id])
        expect(JSON.stringify(overview)).not.toContain(secret);
    });
  });
});
