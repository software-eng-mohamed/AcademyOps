import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ImportCorrectionFields,
  prepareImportCorrectionValues,
} from '@/features/system/import-correction-fields';

afterEach(cleanup);

describe('import correction editors', () => {
  it('turns incomplete legacy payment evidence into an editable payment without losing its slot', () => {
    expect(
      prepareImportCorrectionValues({
        payments: [],
        paymentEvidenceIssues: [
          {
            ordinal: 3,
            amount: 250,
            method: 'Cash',
            receivedAt: '',
            codes: ['PAYMENT_DATE_REQUIRED'],
          },
        ],
      }),
    ).toEqual({
      payments: [{ amount: 250, method: 'Cash', receivedAt: '', sourceOrdinal: 3 }],
      paymentEvidenceIssues: [],
    });
  });

  it('edits payment and attendance arrays while showing workbook provenance', () => {
    function Harness() {
      const [value, setValue] = useState<Record<string, unknown>>({
        payments: [
          { amount: 100, method: 'Cash', receivedAt: '2026-01-02T00:00:00.000Z', sourceOrdinal: 2 },
        ],
        attendance: [
          {
            ordinal: 1,
            cohortCode: 'TST 1',
            status: 'PRESENT',
            sourceMarkColumn: 'M',
            sourceCohortColumn: 'N',
          },
        ],
      });
      return (
        <>
          <ImportCorrectionFields value={value} onChange={setValue} locale="en" />
          <output>{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByText(/Original workbook columns.*M.*N/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'Card' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add attendance mark' }));
    expect(screen.getByText(/"method":"Card"/)).toBeVisible();
    expect(screen.getAllByLabelText('Original slot')).toHaveLength(2);
  });
});
