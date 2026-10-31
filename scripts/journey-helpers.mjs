import { createHmac, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  assertSyntheticOrganization,
  JourneySafetyError,
  syntheticTenant,
} from './journey-config.mjs';

export function currentTotp(secret, now = Date.now()) {
  if (!/^[A-Z2-7]{16,}={0,6}$/i.test(secret ?? '')) {
    throw new JourneySafetyError('Synthetic MFA requires a valid Base32 secret.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase().replace(/=+$/, '')]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 1_000_000).padStart(6, '0');
}

export async function authenticateFixture(page, credentials, configuration, organizationId) {
  const login = () =>
    page.request.post(`${configuration.baseUrl}/api/v1/auth/login`, {
      data: {
        organizationCode: syntheticTenant.code,
        identifierType: 'EMAIL',
        identifier: credentials.email,
        password: credentials.password,
        ...(credentials.totpSecret ? { totpCode: currentTotp(credentials.totpSecret) } : {}),
      },
      headers: { origin: configuration.baseUrl, 'x-correlation-id': randomUUID() },
      maxRedirects: 0,
    });
  let response = await login();
  if (response.status() === 401 && credentials.totpSecret) {
    await new Promise((resolve) => setTimeout(resolve, 30_250 - (Date.now() % 30_000)));
    response = await login();
  }
  if (response.status() !== 201) {
    throw new JourneySafetyError(`Synthetic authentication failed with HTTP ${response.status()}.`);
  }
  const me = await page.request.get(`${configuration.baseUrl}/api/v1/auth/me`, { maxRedirects: 0 });
  if (me.status() !== 200)
    throw new JourneySafetyError('Could not verify the authenticated fixture.');
  const profile = await me.json();
  assertSyntheticOrganization(profile.organization, organizationId);
}

export function copyJourneyArtifact(source, artifactDirectory) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  copyFileSync(source, join(artifactDirectory, basename(source)));
}

export async function finalizeJourneyVideo(video, destination, artifactDirectory) {
  if (!video) return null;
  await video.saveAs(destination);
  copyJourneyArtifact(destination, artifactDirectory);
  return destination;
}
