import assert from 'node:assert/strict';
import {
  finishAcademicLifecycle,
  runAcademicCatalogHttpStep,
} from './domain-academic-catalog-http.step';
import { runAcademicSessionsHttpStep } from './domain-academic-sessions-http.step';
import { runDirectoryHttpStep } from './domain-directory-http.step';
import { runLeadsHttpStep } from './domain-leads-http.step';
import { runStudentRegistrationHttpStep } from './domain-registration-http.step';
import { post } from './finance-http-client';
import { runHttpScenario } from './http-test-harness';
const permissions = [
  'students.read_basic',
  'students.read_contact',
  'students.create',
  'students.update',
  'students.update_sensitive',
  'students.merge',
  'students.registration.manage',
  'leads.read',
  'leads.create',
  'leads.update',
  'leads.claim',
  'leads.assign',
  'leads.convert',
  'business_accounts.read',
  'business_accounts.manage',
  'academic.catalog.read',
  'academic.programs.manage',
  'academic.cohorts.manage',
  'academic.sessions.manage',
] as const;
export async function runDomainHttpScenario(): Promise<void> {
  await runHttpScenario({ permissions: [...permissions], roleCode: 'OWNER' }, async (context) => {
    const academic = await runAcademicCatalogHttpStep(context);
    await runAcademicSessionsHttpStep(context, academic);
    await runDirectoryHttpStep(context);
    await runStudentRegistrationHttpStep(context);
    await runLeadsHttpStep(context, academic);
    await finishAcademicLifecycle(context, academic);
  });
  await proveDomainRoleDenial();
}
async function proveDomainRoleDenial(): Promise<void> {
  await runHttpScenario(
    { permissions: ['academic.catalog.read'], roleCode: 'CATALOG_VIEWER' },
    async (context) => {
      const denied = await post(context, 'programs', {
        code: 'DENIED',
        name: 'Denied',
      });
      assert.equal(denied.status, 403);
      assert.equal(
        (
          (await denied.json()) as {
            code: string;
          }
        ).code,
        'PERMISSION_DENIED',
      );
    },
  );
}
