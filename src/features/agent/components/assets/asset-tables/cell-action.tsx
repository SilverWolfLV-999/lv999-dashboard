'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertModal } from '@/components/modal/alert-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import { deleteAssetMutation } from '../../../api/mutations';
import { downloadAsset } from '../../../lib/asset-download';
import { ImageEditDialog } from '../image-edit-dialog';
import type { Asset } from '../../../api/types';

/**
 * 预览弹窗含完整 Markdown 渲染链（streamdown 约 99KB 未压缩），按需加载：
 * 不打开预览则不下载该 chunk（bundle-dynamic-imports）。
 */
const AssetPreviewDialog = dynamic(
  () => import('../asset-preview-dialog').then((m) => m.AssetPreviewDialog),
  { ssr: false }
);

interface CellActionProps {
  data: Asset;
}

export function CellAction({ data }: CellActionProps) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMounted, setPreviewMounted] = useState(false);
  // 预览目标资产：默认当前行；「继续修改」成功后指向新派生资产
  const [previewAssetId, setPreviewAssetId] = useState(data.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = useMutation(deleteAssetMutation);

  // 首次打开后才挂载（挂载即触发 chunk 加载）；之后保持挂载以保留关闭动画
  const openPreview = (assetId: string = data.id) => {
    setPreviewAssetId(assetId);
    setPreviewMounted(true);
    setPreviewOpen(true);
  };

  return (
    <>
      {previewMounted && (
        <AssetPreviewDialog
          assetId={previewAssetId}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
      {data.kind === 'image' && (
        <ImageEditDialog
          asset={data}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSuccess={(newAssetId) => openPreview(newAssetId)}
        />
      )}
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteMutation.mutate(data.id, {
            onSuccess: () => {
              toast.success('资产已删除');
              setDeleteOpen(false);
            },
            onError: () => toast.error('删除失败')
          })
        }
        loading={deleteMutation.isPending}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
          <span className='sr-only'>Open menu</span>
          <Icons.ellipsis className='h-4 w-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>操作</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            {data.kind === 'design' && (
              <DropdownMenuItem onClick={() => router.push(`/dashboard/design/${data.id}`)}>
                <Icons.edit className='mr-2 h-4 w-4' /> 编辑
              </DropdownMenuItem>
            )}
            {data.kind === 'image' && (
              <>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Icons.sparkles className='mr-2 h-4 w-4' /> 继续修改
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push(`/dashboard/design?imageAssetId=${data.id}`)}
                >
                  <Icons.palette className='mr-2 h-4 w-4' /> 在画布使用
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => openPreview()}>
              <Icons.eye className='mr-2 h-4 w-4' /> 预览
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void downloadAsset(data.id)}>
              <Icons.download className='mr-2 h-4 w-4' /> 下载
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
              <Icons.trash className='mr-2 h-4 w-4' /> 删除
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
