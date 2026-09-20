'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation } from '@tanstack/react-query';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { setAssetFavoriteMutation } from '../../../api/mutations';
import { ASSET_KIND_META, ASSET_KINDS, getAssetKindMeta } from '../../../constants/kinds';
import type { Asset } from '../../../api/types';
import { formatBytes, formatDateTime } from '../../../lib/format';
import { CellAction } from './cell-action';

/**
 * 预览弹窗含完整 Markdown 渲染链（streamdown 约 99KB 未压缩），按需加载：
 * 不打开预览则不下载该 chunk（bundle-dynamic-imports）。
 */
const AssetPreviewDialog = dynamic(
  () => import('../asset-preview-dialog').then((m) => m.AssetPreviewDialog),
  { ssr: false }
);

/** 标题单元格：点击打开预览弹窗（资产视角，不再深链到来源会话） */
function AssetTitleCell({ assetId, title }: { assetId: string; title: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMounted, setPreviewMounted] = useState(false);

  // 首次打开后才挂载（挂载即触发 chunk 加载）；之后保持挂载以保留关闭动画
  const openPreview = () => {
    setPreviewMounted(true);
    setPreviewOpen(true);
  };

  return (
    <>
      <button type='button' onClick={openPreview} className='font-medium hover:underline'>
        {title}
      </button>
      {previewMounted && (
        <AssetPreviewDialog assetId={assetId} open={previewOpen} onOpenChange={setPreviewOpen} />
      )}
    </>
  );
}

/** 行内收藏切换：星形图标按钮，乐观失效走 assetsRoot（列表重查后回填真实状态） */
function FavoriteCell({ asset }: { asset: Asset }) {
  const mutation = useMutation(setAssetFavoriteMutation);
  return (
    <button
      type='button'
      aria-label={asset.favorite ? '取消收藏' : '收藏'}
      aria-pressed={asset.favorite}
      disabled={mutation.isPending}
      onClick={() =>
        mutation.mutate(
          { id: asset.id, favorite: !asset.favorite },
          {
            onSuccess: () => toast.success(asset.favorite ? '已取消收藏' : '已收藏'),
            onError: () => toast.error('操作失败，请稍后重试')
          }
        )
      }
      className={cn(
        'text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50',
        asset.favorite && 'text-amber-500 hover:text-amber-500'
      )}
    >
      <Icons.star className={cn('size-4', asset.favorite && 'fill-current')} />
    </button>
  );
}

export const columns: ColumnDef<Asset>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        aria-label='全选'
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label='选择行'
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    id: 'title',
    accessorKey: 'title',
    header: ({ column }: { column: Column<Asset, unknown> }) => (
      <DataTableColumnHeader column={column} title='标题' />
    ),
    cell: ({ row }) => <AssetTitleCell assetId={row.original.id} title={row.original.title} />,
    meta: {
      label: '标题',
      placeholder: '搜索资产标题...',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    id: 'kind',
    accessorKey: 'kind',
    enableSorting: false,
    header: ({ column }: { column: Column<Asset, unknown> }) => (
      <DataTableColumnHeader column={column} title='类型' />
    ),
    cell: ({ row }) => {
      const { label, icon: KindIcon } = getAssetKindMeta(row.original.kind);
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
      options: ASSET_KINDS.map((kind) => ({
        label: ASSET_KIND_META[kind].label,
        value: kind
      }))
    }
  },
  {
    id: 'sizeBytes',
    accessorKey: 'sizeBytes',
    header: ({ column }: { column: Column<Asset, unknown> }) => (
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
    header: ({ column }: { column: Column<Asset, unknown> }) => (
      <DataTableColumnHeader column={column} title='创建时间' />
    ),
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {formatDateTime(row.original.createdAt)}
      </span>
    )
  },
  {
    id: 'favorite',
    accessorKey: 'favorite',
    enableSorting: false,
    header: () => <span className='sr-only'>收藏</span>,
    cell: ({ row }) => <FavoriteCell asset={row.original} />,
    enableHiding: false
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
