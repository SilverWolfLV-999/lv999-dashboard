'use client';

import { useState } from 'react';
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
import type { Artifact } from '../../../api/types';
import { ArtifactPreviewDialog } from '../artifact-preview-dialog';

interface CellActionProps {
  data: Artifact;
}

export function CellAction({ data }: CellActionProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useMutation(deleteArtifactMutation);

  return (
    <>
      <ArtifactPreviewDialog
        artifactId={data.id}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
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
            <DropdownMenuItem onClick={() => setPreviewOpen(true)}>
              <Icons.eye className='mr-2 h-4 w-4' /> 预览
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `/api/agent/artifacts/${data.id}/download`;
              }}
            >
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
