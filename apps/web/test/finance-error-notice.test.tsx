import { PlgApiError } from '@academyops/api-client/http';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { type AcademyCopyKey, getAcademyCopy } from '@/i18n/academy-copy';

afterEach(cleanup);
describe.each(['ar', 'en'] as const)('%s financial errors', (locale) => {
  it.each<[string, AcademyCopyKey]>([
    ['PAYMENT_ADJUSTMENT_CONFLICT', 'paymentAdjustmentConflict'],
    ['PAYMENT_ADJUSTMENT_ALLOCATION_CONFLICT', 'paymentAllocationConflict'],
    ['FINANCE_ALLOCATION_RECONCILIATION_REQUIRED', 'financeReconciliationRequired'],
    ['FINANCIAL_REQUEST_ALREADY_DECIDED', 'financialRequestAlreadyDecided'],
    ['REQUEST_WITHDRAW_REQUESTER_REQUIRED', 'financialRequestRequesterRequired'],
    ['FINANCIAL_REASON_INVALID', 'financialReasonInvalid'],
    ['MAKER_CHECKER_REQUIRED', 'financialCheckerRequired'],
    ['ENROLLMENT_PRICING_LOCKED', 'enrollmentPricingLocked'],
    ['PRICING_STATE_OR_VERSION_CONFLICT', 'pricingVersionConflict'],
    ['INSTALLMENT_SCHEDULE_STATE_OR_VERSION_CONFLICT', 'pricingVersionConflict'],
  ])('explains %s with a specific next step', (code, key) => {
    const copy = getAcademyCopy(locale);
    render(
      <ErrorNotice
        copy={copy}
        error={new PlgApiError(409, { code, messageKey: 'finance.conflict' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(copy[key]);
    expect(screen.getByRole('alert')).not.toHaveTextContent(copy.conflict);
  });
});
