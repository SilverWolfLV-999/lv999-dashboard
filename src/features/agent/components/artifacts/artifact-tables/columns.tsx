'use client';

import Link from 'next/link';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { Icons } from '@/components/icons';
import { ARTIFACT_KIND_META, ARTIFACT_KINDS, getArtifactKindMeta } from '../../../constants/kinds';
import type { Artifact } from '../../../api/types';
import { formatBytes, formatDateTime } from '../../../lib/format';
import { CellAction } from './cell-action';

export const columns: ColumnDef<Artifact>[] = [
  {
    id: 'title',
    accessorKey: 'title',
    header: ({ column }: { column: Column<Artifact, unknown> }) => (
      <DataTableColumnHeader column={column} title='标题' />
    ),
    cell: ({ row }) => (
      <Link
        href={`/dashboard/agent/${row.original.conversationId}`}
        className='font-medium hover:underline'
      >
        {row.original.title}
      </Link>
    ),
    meta: {
      label: '标题',
      placeholder: '搜索产物标题...',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    id: 'kind',
    accessorKey: 'kind',
    enableSorting: false,
    header: ({ column }: { column: Column<Artifact, unknown> }) => (
      <DataTableColumnHeader column={column} title='类型' />
    ),
    cell: ({ row }) => {
      const { label, icon: KindIcon } = getArtifactKindMeta(row.original.kind);
      return (
        <Badge variant='outline'>
          <KindIcon className='size-3' />
          {label}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: '类型',
      variant: 'multiSelect' as const,
      options: ARTIFACT_KINDS.map((kind) => ({
        label: ARTIFACT_KIND_META[kind].label,
        value: kind
      }))
    }
  },
  {
    id: 'sizeBytes',
    accessorKey: 'sizeBytes',
    header: ({ column }: { column: Column<Artifact, unknown> }) => (
      <DataTableColumnHeader column={column} title='大小' />
    ),
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {formatBytes(row.original.sizeBytes ?? 0)}
      </span>
    )
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: ({ column }: { column: Column<Artifact, unknown> }) => (
      <DataTableColumnHeader column={column} title='创建时间' />
    ),
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {formatDateTime(row.original.createdAt)}
      </span>
    )
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
