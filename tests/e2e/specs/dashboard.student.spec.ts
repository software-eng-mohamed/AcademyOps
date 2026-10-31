import { test } from '../support/test';
import {
  expectForbiddenStaffPage,
  expectDashboard,
  expectForbiddenImportApi,
} from '../support/dashboard';

test('student dashboard is readable and staff surfaces stay isolated', async ({ page }) => {
  await expectDashboard(page, 'student');
  await expectForbiddenImportApi(page);
  await expectForbiddenStaffPage(page, 'payments');
  await expectForbiddenStaffPage(page, 'students');
  await expectForbiddenStaffPage(page, 'imports');
});
