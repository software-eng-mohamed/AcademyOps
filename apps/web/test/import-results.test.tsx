import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { systemName } from '@/api/system/queries';
import { ImportReconciliation, ImportSources } from '@/features/system/import-results';
import { StructuredValues } from '@/features/system/system-ui';

afterEach(cleanup);
describe('Owner import evidence presentation', () => {
  it('preserves workbook column letters and original values instead of translating them as permission scopes', () => {
    render(<StructuredValues value={{ A: 'O', B: 'B', O: '1000' }} locale="en" literal />);
    expect(screen.getByText('A')).toBeVisible();
    expect(screen.getAllByText('B')).toHaveLength(2);
    expect(screen.queryByText('Assigned branches')).not.toBeInTheDocument();
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });
  it('shows the original workbook name and worksheet facts, not internal storage metadata', () => {
    const source = {
      id: 'source',
      originalName: 'academy.xlsx',
      sizeBytes: '2048',
      organizationId: 'internal-tenant',
      storedPath: '/private/internal',
      workbookMeta: { sheets: [{ name: 'Students', state: 'visible', rowCount: 12 }] },
    };
    render(<ImportSources value={[source]} locale="en" />);
    expect(screen.getByRole('table', { name: 'Worksheets: academy.xlsx' })).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeVisible();
    expect(screen.getByText('Visible')).toBeVisible();
    expect(screen.queryByText('internal-tenant')).not.toBeInTheDocument();
    expect(screen.queryByText('/private/internal')).not.toBeInTheDocument();
    expect(systemName('imports', { id: 'batch', sources: [source] })).toBe('academy.xlsx');
  });
  it('shows source, imported, difference and result in an Arabic table', () => {
    render(
      <ImportReconciliation
        locale="ar"
        value={[
          {
            id: 'check',
            metric: 'domain.payment',
            sourceValue: '2',
            targetValue: '2',
            difference: '0',
            passed: true,
          },
        ]}
      />,
    );
    expect(screen.getByRole('table', { name: 'المطابقة' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'الفرق' })).toBeVisible();
    expect(screen.getByText('المدفوعات')).toBeVisible();
    expect(screen.getByText('نعم')).toBeVisible();
  });
});
