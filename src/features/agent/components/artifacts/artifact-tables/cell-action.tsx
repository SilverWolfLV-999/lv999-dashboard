'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
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
import { deleteArtifactMutation } from '../../../api/mutations';
import { downloadArtifact } from '../../../lib/artifact-download';
import type { Artifact } from '../../../api/types';

/**
 * 预览弹窗含完整 Markdown 渲染链（streamdown 约 99KB 未压缩），按需加载：
 * 不打开预览则不下载该 chunk（bundle-dynamic-imports）。
 */
const ArtifactPreviewDialog = dynamic(
  () => import('../artifact-preview-dialog').then((m) => m.ArtifactPreviewDialog),
  { ssr: false }
);

interface CellActionProps {
  data: Artifact;
}

export function CellAction({ data }: CellActionProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useMutation(deleteArtifactMutation);

  // 首次打开后才挂载（挂载即触发 chunk 加载）；之后保持挂载以保留关闭动画
  const openPreview = () => {
    setPreviewMounted(true);
    setPreviewOpen(true);
  };

  return (
    <>
      {previewMounted && (
        <ArtifactPreviewDialog
          artifactId={data.id}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteMutation.mutate(data.id, {
            onSuccess: () => {
              toast.success('产物已删除');
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
            <DropdownMenuItem onClick={openPreview}>
              <Icons.eye className='mr-2 h-4 w-4' /> 预览
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void downloadArtifact(data.id)}>
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
