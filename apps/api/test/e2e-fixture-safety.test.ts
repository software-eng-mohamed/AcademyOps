import { describe, expect, it } from 'vitest';
import {
  assertCleanupIntent,
  assertFixtureOrganization,
  assertSyntheticIntent,
} from '../prisma/e2e-fixture/safety';
import {
  CLEAN_CONFIRMATION,
  FIXTURE_ORGANIZATION_CODE,
  FIXTURE_ORGANIZATION_NAME,
} from '../prisma/e2e-fixture/constants';
const safeEnvironment = {
  E2E_FIXTURE_CONFIRM: 'synthetic-only',
  E2E_ORGANIZATION_CODE: FIXTURE_ORGANIZATION_CODE,
  DATABASE_URL: 'postgresql://fixture:fixture@localhost:5432/fixture',
  MFA_ENCRYPTION_KEY: 'fixture-key-at-least-thirty-two-characters',
} as NodeJS.ProcessEnv;
describe('synthetic E2E fixture safety', () => {
  it('requires the explicit marker and fixed tenant code', () => {
    expect(() => assertSyntheticIntent({ ...safeEnvironment })).not.toThrow();
    expect(() =>
      assertSyntheticIntent({ ...safeEnvironment, E2E_FIXTURE_CONFIRM: undefined }),
    ).toThrow(/synthetic-only/);
    expect(() =>
      assertSyntheticIntent({ ...safeEnvironment, E2E_ORGANIZATION_CODE: 'PLG' }),
    ).toThrow(/fixed E2EACADEMY/);
  });
  it('requires a second exact confirmation for cleanup', () => {
    expect(() => assertCleanupIntent({ ...safeEnvironment })).toThrow(/Cleanup requires/);
    expect(() =>
      assertCleanupIntent({
        ...safeEnvironment,
        E2E_FIXTURE_CLEAN_CONFIRM: CLEAN_CONFIRMATION,
      }),
    ).not.toThrow();
  });
  it('refuses an existing organization without exact synthetic names', () => {
    const fixture = {
      id: '00000000-0000-4000-8000-000000000001',
      code: FIXTURE_ORGANIZATION_CODE,
      name: FIXTURE_ORGANIZATION_NAME,
      timezone: 'Africa/Cairo',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(() => assertFixtureOrganization(fixture)).not.toThrow();
    expect(() => assertFixtureOrganization({ ...fixture, name: 'Real Academy' })).toThrow(
      /collision/,
    );
  });
});
