'use client';

import { cn, type DataColumn } from '@academyops/ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@academyops/ui/registry';

const SKELETON_ROW_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5'] as const;

// Composition of individual shadcn Table primitives, not a dashboard/table block.
export function AcademyTable<T extends { id: string }>({
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
      className="relative overflow-hidden rounded-xl border border-border-secondary bg-background-primary-default shadow-xs"
      data-library-component="shadcn/table"
    >
      {busy ? (
        <div
          className="absolute inset-x-0 top-0 z-20 h-1 overflow-hidden bg-accent-500/15"
          role="progressbar"
          aria-label={label}
        >
          <div className="h-full w-full animate-pulse bg-linear-to-r from-transparent via-accent-500 to-transparent" />
        </div>
      ) : null}
      <Table aria-label={label} aria-busy={busy}>
        <TableHeader className="border-b border-border-secondary bg-background-secondary-default">
          <TableRow className="hover:bg-background-secondary-default">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                className={cn(
                  'h-11 px-4 text-xs font-semibold text-text-secondary text-start align-middle whitespace-nowrap',
                  column.id === 'actions' && 'w-12',
                )}
              >
                <span className={column.id === 'actions' ? 'sr-only' : undefined}>
                  {column.header}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody
          className={cn(
            'divide-y divide-border-secondary bg-background-primary-default transition-opacity duration-200',
            busy && rows.length > 0 && 'pointer-events-none opacity-60',
          )}
        >
          {rows.length === 0 && busy
            ? SKELETON_ROW_KEYS.map((skeletonKey) => (
                <TableRow key={skeletonKey} className="animate-pulse">
                  {columns.map((column, colIdx) => (
                    <TableCell key={column.id} className="px-4 py-4">
                      {colIdx === 0 ? (
                        <div className="flex items-center gap-3">
                          <div className="size-9 shrink-0 rounded-xl bg-background-secondary-default" />
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="h-3 w-32 rounded-md bg-background-secondary-default" />
                            <div className="h-2.5 w-20 rounded-md bg-background-secondary-default/60" />
                          </div>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'h-3.5 rounded-md bg-background-secondary-default',
                            colIdx % 2 === 0 ? 'w-24' : 'w-16',
                            column.id === 'actions' && 'ms-auto w-12',
                          )}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="transition-colors hover:bg-background-secondary-default/50"
                >
                  {columns.map((column) =>
                    column.id === 'name' ? (
                      <TableHead
                        key={column.id}
                        scope="row"
                        className="px-4 py-4 font-normal text-text-primary"
                      >
                        {column.cell(row)}
                      </TableHead>
                    ) : (
                      <TableCell
                        key={column.id}
                        className={cn(
                          'px-4 py-4 text-sm text-text-primary',
                          column.id === 'actions' && 'text-end',
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
