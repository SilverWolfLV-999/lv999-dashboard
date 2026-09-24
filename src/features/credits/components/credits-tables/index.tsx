'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsArrayOf, parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/table/data-table';
import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { getSortingStateParser } from '@/lib/parsers';
import { ledgerQueryOptions } from '../../api/queries';
import type { LedgerFilters } from '../../api/types';
import { columns } from './columns';

const columnIds = columns.map((column) => column.id).filter(Boolean) as string[];

export function CreditsTable() {
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(10),
    kind: parseAsArrayOf(parseAsString).withDefault([]),
    sort: getSortingStateParser(columnIds).withDefault([])
  });

  // nuqs 默认 shallow:true：筛选/翻页走 URL 但不触发 RSC 往返，由 React Query 客户端取数
  const filters: LedgerFilters = {
    page: params.page,
    limit: params.perPage,
    ...(params.kind.length > 0 && { kind: params.kind.join(',') }),
    ...(params.sort.length > 0 && { sort: JSON.stringify(params.sort) })
  };

  const { data } = useSuspenseQuery(ledgerQueryOptions(filters));
  const pageCount = Math.ceil(data.total / params.perPage);

  const { table } = useDataTable({
    data: data.entries,
    columns,
    pageCount,
    shallow: true,
    debounceMs: 500,
    initialState: {
      sorting: [{ id: 'createdAt', desc: true }]
    }
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
}

/** Suspense 回退：客户端导航且缓存为空时展示（服务端已预取时不会出现） */
export function CreditsTableSkeleton() {
  return (
    <div className='flex flex-col gap-4'>
      <Skeleton className='h-9 w-full' />
      <Skeleton className='h-80 w-full' />
    </div>
  );
}
