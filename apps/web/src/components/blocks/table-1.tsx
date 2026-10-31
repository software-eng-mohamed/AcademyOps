'use client';

// 7Ovr Table 1 (MIT-0): https://7ovr.com/r/table-1.json
// Original table + footer presentation. Server pagination replaces demo client-side data;
// unsupported demo bulk mutations, local sorting and checkboxes are intentionally omitted.
import { cn, type DataColumn } from '@academyops/ui';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@academyops/ui/registry';
import { ArrowLeft2, ArrowRight2 } from 'iconsax-react';

export function Table1<T extends { id: string }>({
  rows,
  columns,
  label,
  busy,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  label: string;
  busy: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-library-block="7ovr/table-1"
    >
      <Table aria-label={label} aria-busy={busy}>
        <TableHeader>
          <TableRow className="border-b border-border bg-surface-subtle/40 hover:bg-surface-subtle/40">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                className={cn(
                  'h-9',
                  column.id === 'name' && 'ps-4',
                  column.id === 'actions' && 'w-10 pe-4',
                )}
              >
                <span
                  className={
                    column.id === 'actions'
                      ? 'sr-only'
                      : 'text-xs font-medium tracking-wide text-ink-muted uppercase'
                  }
                >
                  {column.header}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="border-b border-border transition-colors duration-100 last:border-b-0 hover:bg-surface-subtle/30"
            >
              {columns.map((column) =>
                column.id === 'name' ? (
                  <TableHead key={column.id} scope="row" className="py-3 ps-4 font-normal">
                    {column.cell(row)}
                  </TableHead>
                ) : (
                  <TableCell
                    key={column.id}
                    className={cn(
                      'py-3 text-sm text-ink-muted',
                      column.id === 'actions' && 'pe-4 text-end',
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ),
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Table1Pagination({
  page,
  pages,
  count,
  countLabel,
  pageLabel,
  previousLabel,
  nextLabel,
  label,
  hasPrevious,
  hasNext,
  busy,
  onChange,
}: {
  page: number;
  pages?: number;
  count: number | undefined;
  countLabel: string;
  pageLabel: string;
  previousLabel: string;
  nextLabel: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-4 px-1 py-3"
      data-library-block="7ovr/table-1-pagination"
    >
      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink tabular-nums">{count ?? '—'}</span> {countLabel}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          onClick={() => onChange(page - 1)}
          disabled={!hasPrevious || busy}
          aria-label={previousLabel}
        >
          <ArrowLeft2 color="currentColor" className="size-3.5 rtl:rotate-180" aria-hidden />
        </Button>
        <span className="px-1 text-xs text-ink-muted tabular-nums" aria-current="page">
          {pageLabel} {pages ? <span dir="ltr"> / {pages}</span> : null}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          onClick={() => onChange(page + 1)}
          disabled={!hasNext || busy}
          aria-label={nextLabel}
        >
          <ArrowRight2 color="currentColor" className="size-3.5 rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
