import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash, verify } from 'argon2';
import { ConfigService } from '@nestjs/config';
import { decryptActionToken } from '../../src/iam/auth/action-token';
import { generateTotpCode } from '../../src/iam/auth/totp';
import {
  issueHttpSession,
  type HttpSessionHeaders,
  type HttpTestContext,
} from './http-test-harness';

const oldPassword = 'Identity-Initial-Password!31';
const changedPassword = 'Identity-Changed-Password!42';
const resetPassword = 'Identity-Reset-Password!53';
const phoneResetPassword = 'Phone-Reset-Password!75';

export async function runIamIdentityStep(context: HttpTestContext): Promise<void> {
  await exerciseMfa(context);
  const identity = await seedPasswordIdentity(context);
  await exercisePasswordChange(context, identity.userId, identity.headers);
  await exercisePasswordReset(context, identity.email);
  await exercisePhoneOtp(context);
}

async function exerciseMfa(context: HttpTestContext): Promise<void> {
  const enrolledResponse = await send(context, 'auth/mfa/totp/enroll', { label: 'HTTP verifier' });
  assert.equal(enrolledResponse.status, 201, await enrolledResponse.clone().text());
  const enrolled = (await enrolledResponse.json()) as { factorId: string; secret: string };
  const verifiedResponse = await send(context, `auth/mfa/totp/${enrolled.factorId}/verify`, {
    code: generateTotpCode(enrolled.secret),
  });
  assert.equal(verifiedResponse.status, 201, await verifiedResponse.clone().text());
  assert.equal(
    ((await verifiedResponse.json()) as { recoveryCodes: string[] }).recoveryCodes.length,
    10,
  );
  const steppedUp = await send(context, 'auth/mfa/step-up', {
    code: generateTotpCode(enrolled.secret, Date.now() + 30_000),
  });
  assert.equal(steppedUp.status, 201, await steppedUp.clone().text());
  const regenerated = await send(context, 'auth/mfa/recovery-codes/regenerate');
  assert.equal(regenerated.status, 201, await regenerated.clone().text());
  assert.equal(
    ((await regenerated.json()) as { recoveryCodes: string[] }).recoveryCodes.length,
    10,
  );
}

async function seedPasswordIdentity(context: HttpTestContext) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const email = `identity-${suffix}@example.test`;
  const person = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `IDENTITY-${suffix}`,
      name: 'Identity route user',
    },
  });
  const user = await context.prisma.user.create({
    data: {
      organizationId: context.organizationId,
      personId: person.id,
      status: 'ACTIVE',
      passwordHash: await hash(oldPassword),
      mustChangePassword: true,
    },
  });
  await context.prisma.userLoginIdentifier.create({
    data: {
      organizationId: context.organizationId,
      userId: user.id,
      type: 'EMAIL',
      normalizedValue: email,
      verifiedAt: new Date(),
    },
  });
  return { userId: user.id, email, headers: await issueHttpSession(context, user.id) };
}

async function exercisePasswordChange(
  context: HttpTestContext,
  userId: string,
  headers: HttpSessionHeaders,
): Promise<void> {
  const response = await fetch(`${context.baseUrl}/api/v1/auth/password/change`, {
    method: 'POST',
    headers: { ...headers.unsafeHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ currentPassword: oldPassword, newPassword: changedPassword }),
  });
  assert.equal(response.status, 204, await response.clone().text());
  const user = await context.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.mustChangePassword, false);
  assert.equal(await verify(user.passwordHash!, changedPassword), true);
}

async function exercisePasswordReset(context: HttpTestContext, email: string): Promise<void> {
  const organization = await context.prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  const requested = await publicPost(context, 'auth/password/reset/request', {
    organizationCode: organization.code,
    identifierType: 'EMAIL',
    identifier: email,
    locale: 'en',
  });
  assert.equal(requested.status, 202, await requested.clone().text());
  assert.deepEqual(await requested.json(), { accepted: true });
  const outbox = await context.prisma.outboxEvent.findFirstOrThrow({
    where: { organizationId: context.organizationId, type: 'security.password_reset_requested' },
    orderBy: { createdAt: 'desc' },
  });
  const payload = outbox.payload as { locale: string; tokenCipher: string };
  assert.equal(payload.locale, 'en');
  const config = context.app.get(ConfigService);
  const token = decryptActionToken(
    payload.tokenCipher,
    config.getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
  );
  const completed = await publicPost(context, 'auth/password/reset/complete', {
    organizationCode: organization.code,
    token,
    newPassword: resetPassword,
  });
  assert.equal(completed.status, 204, await completed.clone().text());
  const identifier = await context.prisma.userLoginIdentifier.findFirstOrThrow({
    where: { organizationId: context.organizationId, type: 'EMAIL', normalizedValue: email },
  });
  const user = await context.prisma.user.findUniqueOrThrow({ where: { id: identifier.userId } });
  assert.equal(await verify(user.passwordHash!, resetPassword), true);
}

async function exercisePhoneOtp(context: HttpTestContext): Promise<void> {
  const phonePassword = 'Phone-Otp-Password!64';
  const organization = await context.prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  const phone = `+2010${Date.now().toString().slice(-8)}`;
  const person = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `PHONE-${randomUUID().slice(0, 18)}`,
      name: 'Phone OTP user',
    },
  });
  const user = await context.prisma.user.create({
    data: {
      organizationId: context.organizationId,
      passwordHash: await hash(phonePassword),
      personId: person.id,
      status: 'ACTIVE',
    },
  });
  await context.prisma.userLoginIdentifier.create({
    data: {
      organizationId: context.organizationId,
      userId: user.id,
      type: 'PHONE',
      normalizedValue: phone,
    },
  });
  await context.prisma.whatsappOtpChannel.create({
    data: {
      organizationId: context.organizationId,
      enabled: true,
      desiredState: 'CONNECTED',
      state: 'CONNECTED',
      commandVersion: 1,
      handledCommandVersion: 1,
      lastHeartbeatAt: new Date(),
    },
  });
  const requested = await publicPost(context, 'auth/phone-otp/request', {
    organizationCode: organization.code,
    password: phonePassword,
    phone,
  });
  assert.equal(requested.status, 202, await requested.clone().text());
  assert.deepEqual(await requested.json(), { accepted: true });
  const outbox = await context.prisma.outboxEvent.findFirstOrThrow({
    where: { organizationId: context.organizationId, type: 'security.phone_otp_requested' },
    orderBy: { createdAt: 'desc' },
  });
  const payload = outbox.payload as { codeCipher: string };
  const code = decryptActionToken(
    payload.codeCipher,
    context.app.get(ConfigService).getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
  );
  const verified = await publicPost(context, 'auth/phone-otp/verify', {
    organizationCode: organization.code,
    phone,
    code,
  });
  assert.equal(verified.status, 201, await verified.clone().text());
  assert.ok(verified.headers.getSetCookie().length >= 2);

  const resetRequested = await publicPost(context, 'auth/password/reset/request', {
    organizationCode: organization.code,
    identifierType: 'PHONE',
    identifier: phone,
    locale: 'en',
  });
  assert.equal(resetRequested.status, 202, await resetRequested.clone().text());
  const resetOutbox = await context.prisma.outboxEvent.findFirstOrThrow({
    where: {
      organizationId: context.organizationId,
      aggregateId: user.id,
      type: 'security.password_reset_requested',
    },
    orderBy: { createdAt: 'desc' },
  });
  const resetPayload = resetOutbox.payload as {
    identifierType: string;
    locale: string;
    recipient: string;
    tokenCipher: string;
  };
  assert.equal(resetPayload.identifierType, 'PHONE');
  assert.equal(resetPayload.locale, 'en');
  assert.equal(resetPayload.recipient, phone);
  const resetToken = decryptActionToken(
    resetPayload.tokenCipher,
    context.app.get(ConfigService).getOrThrow<string>('ACTION_TOKEN_ENCRYPTION_KEY'),
  );
  const resetCompleted = await publicPost(context, 'auth/password/reset/complete', {
    organizationCode: organization.code,
    token: resetToken,
    newPassword: phoneResetPassword,
  });
  assert.equal(resetCompleted.status, 204, await resetCompleted.clone().text());
  const resetUser = await context.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await verify(resetUser.passwordHash!, phoneResetPassword), true);
}

function send(context: HttpTestContext, path: string, body?: unknown): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method: 'POST',
    headers: {
      ...context.unsafeHeaders,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function publicPost(context: HttpTestContext, path: string, body: unknown): Promise<Response> {
  return fetch(`${context.baseUrl}/api/v1/${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
