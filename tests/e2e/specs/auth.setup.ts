import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test } from '../support/test';
import { loginAs } from '../support/login';
import { ROLES, roleStatePath } from '../support/environment';

test.describe.configure({ mode: 'serial' });

for (const role of ROLES) {
  test(`authenticate deterministic ${role} fixture`, async ({ page }) => {
    test.setTimeout(90_000);
    const statePath = roleStatePath(role);
    await mkdir(dirname(statePath), { recursive: true });
    await loginAs(page, role);
    await page.context().storageState({ path: statePath });
  });
}
