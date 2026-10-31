import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pagination } from '@/components/base/pagination/pagination';
import { PageHeader5 } from '@/components/blocks/page-header-5';
import { Table1Pagination } from '@/components/blocks/table-1';

const labels = {
  label: 'Pagination',
  previous: 'Previous',
  next: 'Next',
  page: 'Go to page {page}',
};

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

describe('7Ovr header and pagination integration', () => {
  it('connects search, creation and view controls with localized labels', () => {
    const submit = vi.fn();
    const change = vi.fn();
    const create = vi.fn();
    const view = vi.fn();
    render(
      <PageHeader5
        title="الطلاب"
        description="ملفات الطلاب"
        action={{ label: 'إضافة', disabled: false, onClick: create }}
        search={{ value: '', placeholder: 'ابحث', onChange: change, onSubmit: submit }}
        view="table"
        onViewChange={view}
        labels={{ search: 'بحث', table: 'جدول', grid: 'كروت', display: 'طريقة العرض' }}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'بحث' }), { target: { value: 'طالب' } });
    expect(change).toHaveBeenCalledWith('طالب');
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    expect(submit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'إضافة' }));
    expect(create).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'كروت' }));
    expect(view).toHaveBeenCalledWith('grid');
    expect(screen.getByRole('button', { name: 'جدول' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('retains cursor pagination without making up a total and blocks duplicate navigation', () => {
    const change = vi.fn();
    const props = {
      page: 2,
      count: 10,
      countLabel: 'Records on this page',
      pageLabel: 'Page 2',
      previousLabel: 'Previous',
      nextLabel: 'Next',
      label: 'Pagination',
      hasPrevious: true,
      hasNext: true,
      onChange: change,
    };
    const { rerender } = render(<Table1Pagination {...props} busy={false} />);
    expect(screen.getByText('Page 2')).toHaveTextContent(/^Page 2$/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(change).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(change).toHaveBeenLastCalledWith(1);
    rerender(<Table1Pagination {...props} pages={4} busy />);
    expect(screen.getByText('Page 2', { exact: false })).toHaveTextContent('Page 2 / 4');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});

describe('BoardUI pagination adapters', () => {
  it('does not invent a total page count for cursor APIs', () => {
    const change = vi.fn();
    render(<Pagination page={2} hasPrevious hasNext labels={labels} onChange={change} />);
    expect(screen.queryByRole('button', { name: 'Go to page 3' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(change).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(change).toHaveBeenLastCalledWith(1);
  });

  it('shows real page totals and prevents navigation during a request', () => {
    const change = vi.fn();
    const { rerender } = render(
      <Pagination page={1} totalPages={3} labels={labels} onChange={change} />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(change).toHaveBeenCalledWith(3);
    rerender(<Pagination page={3} totalPages={3} labels={labels} disabled onChange={change} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toBeDisabled();
  });
});
