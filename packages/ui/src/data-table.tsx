'use client';

import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { type ReactNode, useMemo } from 'react';
import { cn } from './lib/cn';

const coreTableFeatures = tableFeatures({});

export type DataColumn<Row extends Record<string, unknown>> = {
  cell: (row: Row) => ReactNode;
  header: ReactNode;
  id: string;
};

export function DataTable<Row extends Record<string, unknown>>({
  columns,
  data,
  emptyLabel = 'No records match this view.',
  getRowId,
  isFetching = false,
}: {
  columns: DataColumn<Row>[];
  data: Row[];
  emptyLabel?: string;
  getRowId?: (row: Row, index: number) => string;
  isFetching?: boolean;
}) {
  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<typeof coreTableFeatures, Row>();
    return helper.columns(
      columns.map((column) =>
        helper.accessor((row) => column.cell(row), {
          id: column.id,
          header: () => column.header,
          cell: (context) => context.getValue(),
        }),
      ),
    );
  }, [columns]);
  const table = useTable<typeof coreTableFeatures, Row>({
    columns: tableColumns,
    data,
    features: coreTableFeatures,
    ...(getRowId ? { getRowId } : {}),
  });
  const rows = table.getRowModel().rows;

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-surface">
      <div
        className={cn(
          'h-0.5 bg-brand transition-opacity',
          isFetching ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
          <thead className="bg-surface-subtle text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th className="h-9 border-b border-border px-3.5" key={header.id} scope="col">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  className="border-b border-border last:border-b-0 hover:bg-surface-subtle/55"
                  key={row.id}
                >
                  {row.getAllCells().map((cell) => (
                    <td className="h-11 px-3.5 text-ink" key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="h-28 px-4 text-center text-xs text-ink-muted"
                  colSpan={Math.max(columns.length, 1)}
                >
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
