import { test } from '../support/test';
import {
  expectForbiddenStaffPage,
  expectDashboard,
  expectForbiddenImportApi,
} from '../support/dashboard';

test('accounts dashboard is readable and owner surfaces stay isolated', async ({ page }) => {
  await expectDashboard(page, 'accounts');
  await expectForbiddenImportApi(page);
  await expectForbiddenStaffPage(page, 'imports');
});
