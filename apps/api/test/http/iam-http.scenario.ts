import { runHttpScenario } from './http-test-harness';
import { runIamAdminStep } from './iam-admin-http.step';
import { runIamIdentityStep } from './iam-identity-http.step';

export async function runIamHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      roleCode: 'OWNER',
      permissions: ['branches.manage', 'roles.manage', 'users.manage'],
    },
    async (context) => {
      await runIamAdminStep(context);
      await runIamIdentityStep(context);
    },
  );
}
