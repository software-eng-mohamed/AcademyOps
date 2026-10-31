import type { DataColumn } from '@academyops/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcademyRecord } from '@/api/academy/models';
import { AcademyEmpty, AcademyLoading, AcademyRecords } from '@/features/academy/academy-records';
import { AcademyHeading, AcademyToolbar } from '@/features/academy/academy-workspace';
import { CohortIntakeProgress, CohortStatus } from '@/features/academy/cohort-intake';
import { getAcademyCopy } from '@/i18n/academy-copy';

const row: AcademyRecord = {
  id: 'program-1',
  name: 'Language Diploma',
  code: 'LANG',
  status: 'ACTIVE',
  version: 1,
  data: {},
};
const columns: DataColumn<AcademyRecord>[] = [
  { id: 'name', header: 'Name', cell: (item) => item.name },
  { id: 'versions', header: 'Curriculum versions', cell: () => '2' },
];
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Academy library-based presentation', () => {
  it.each(['en', 'ar'] as const)('explains confirmed-only intake and readiness in %s', (locale) => {
    const copy = getAcademyCopy(locale);
    const group = {
      ...row,
      status: 'PLANNED',
      data: {
        capacity: 12,
        learnerCount: 99,
        confirmedEnrollmentCount: 12,
        intakeStatus: 'READY_TO_START',
      },
    };
    const { rerender } = render(
      <>
        <CohortStatus row={group} copy={copy} />
        <CohortIntakeProgress row={group} copy={copy} showHint />
      </>,
    );
    expect(screen.getByText(copy.READY_TO_START)).toBeInTheDocument();
    expect(screen.queryByText(copy.PLANNED)).not.toBeInTheDocument();
    expect(screen.getByText(copy.cohortStartHint)).toBeInTheDocument();
    expect(screen.getByText(copy.cohortIntakeHint)).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '12');
    const collecting = {
      ...group,
      data: { ...group.data, confirmedEnrollmentCount: 0, intakeStatus: 'COLLECTING' },
    };
    rerender(
      <>
        <CohortStatus row={collecting} copy={copy} />
        <CohortIntakeProgress row={collecting} copy={copy} showHint />
      </>,
    );
    expect(screen.getByText(copy.COLLECTING)).toBeInTheDocument();
    expect(screen.queryByText(copy.cohortStartHint)).not.toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('uses only the confirmed intake count, not the legacy alias/learner count, for cohort meters', () => {
    const copy = getAcademyCopy('en');
    const props = {
      rows: [{ ...row, data: { capacity: 30, learnerCount: 27, confirmedEnrollmentCount: 9 } }],
      columns,
      copy,
      view: 'grid' as const,
      busy: false,
      onInspect: vi.fn(),
    };
    const { rerender } = render(<AcademyRecords {...props} resource="cohorts" />);
    const meter = screen.getByRole('meter', { name: copy.cohortIntakeProgress });
    expect(meter).toHaveAttribute('aria-valuenow', '9');
    expect(meter).toHaveAttribute('aria-valuemax', '30');
    rerender(<AcademyRecords {...props} resource="rooms" />);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    rerender(
      <AcademyRecords {...props} resource="cohorts" rows={[{ ...row, data: { capacity: 0 } }]} />,
    );
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('connects the composed toolbar and a contextual creation action', () => {
    const copy = getAcademyCopy('en');
    const change = vi.fn();
    const submit = vi.fn();
    const view = vi.fn();
    const create = vi.fn();
    render(
      <>
        <AcademyHeading
          section="resources"
          resource="rooms"
          copy={copy}
          action={{ disabled: false, onClick: create }}
        />
        <AcademyToolbar
          copy={copy}
          view="grid"
          onViewChange={view}
          filters={null}
          search={{ value: '', onChange: change, onSubmit: submit }}
        />
      </>,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: copy.search }), {
      target: { value: 'ROOM-A' },
    });
    expect(change).toHaveBeenCalledWith('ROOM-A');
    fireEvent.click(screen.getByRole('button', { name: copy.search }));
    expect(submit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: copy.add_rooms }));
    expect(create).toHaveBeenCalledOnce();
    expect(screen.getByRole('radio', { name: copy.gridView })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: copy.tableView }));
    expect(view).toHaveBeenCalledWith('table');
  });
  it('composes shadcn table primitives with native row and column headers', () => {
    render(
      <AcademyRecords
        rows={[row]}
        columns={columns}
        resource="programs"
        copy={getAcademyCopy('en')}
        view="table"
        busy={false}
        onInspect={vi.fn()}
      />,
    );
    expect(screen.getByRole('table', { name: 'Directory' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: row.name })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Curriculum versions' })).toBeInTheDocument();
  });

  it('uses real record data in HeroUI cards and opens the selected record', () => {
    const inspect = vi.fn();
    const copy = getAcademyCopy('ar');
    render(
      <AcademyRecords
        rows={[row]}
        columns={columns}
        resource="programs"
        copy={copy}
        view="grid"
        busy={false}
        onInspect={inspect}
      />,
    );
    expect(screen.getByText('LANG')).toBeInTheDocument();
    expect(screen.getByText(copy.ACTIVE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.view }));
    expect(inspect).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole('button', { name: row.name }));
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('composes a compact person card without introducing demo statistics or actions', () => {
    const { container } = render(
      <AcademyRecords
        rows={[{ ...row, name: 'Test Student', status: '' }]}
        columns={columns}
        resource="students"
        copy={getAcademyCopy('en')}
        view="grid"
        busy={false}
        onInspect={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-library-component="heroui/card"]')).toBeInTheDocument();
    expect(screen.getByText('Curriculum versions')).toBeInTheDocument();
    expect(screen.queryByText('Followers')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  });

  it('offers a real reset action when the empty result is filtered', () => {
    const reset = vi.fn();
    const create = vi.fn();
    const copy = getAcademyCopy('en');
    render(<AcademyEmpty copy={copy} onReset={reset} onCreate={create} />);
    fireEvent.click(screen.getByRole('button', { name: copy.reset }));
    expect(reset).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: copy.add })).not.toBeInTheDocument();
  });

  it('keeps the loading and empty states localized', () => {
    const copy = getAcademyCopy('ar');
    const create = vi.fn();
    const { rerender } = render(<AcademyLoading label={copy.loading} />);
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();
    rerender(<AcademyEmpty copy={copy} onCreate={create} />);
    expect(screen.getByRole('heading', { name: copy.noResults })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.add }));
    expect(create).toHaveBeenCalledOnce();
  });
});
