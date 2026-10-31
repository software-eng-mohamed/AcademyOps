import { test } from '../support/test';
import {
  expectForbiddenStaffPage,
  expectDashboard,
  expectForbiddenImportApi,
} from '../support/dashboard';

test('attendance dashboard is readable and finance/owner UI stays isolated', async ({ page }) => {
  await expectDashboard(page, 'attendance');
  await expectForbiddenImportApi(page);
  await expectForbiddenStaffPage(page, 'payments');
  await expectForbiddenStaffPage(page, 'imports');
});
