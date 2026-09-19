'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { getArtifactKindMeta } from '../../constants/kinds';
import { downloadArtifact } from '../../lib/artifact-download';
import { formatBytes } from '../../lib/format';
import type { ArtifactKind } from '../../api/types';

/** 按需加载：不打开预览则不下载含 streamdown 的弹窗 chunk（bundle-dynamic-imports） */
const ArtifactPreviewDialog = dynamic(
  () => import('./artifact-preview-dialog').then((m) => m.ArtifactPreviewDialog),
  { ssr: false }
);

interface ArtifactCardProps {
  artifactId: string;
  title: string;
  kind: ArtifactKind;
  sizeBytes?: number | null;
}

/** 对话内联的产物卡片：预览 + 下载 */
export function ArtifactCard({ artifactId, title, kind, sizeBytes }: ArtifactCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMounted, setPreviewMounted] = useState(false);
  const { label, icon: KindIcon } = getArtifactKindMeta(kind);

  // 首次打开后才挂载（挂载即触发 chunk 加载）；之后保持挂载以保留关闭动画
  const openPreview = () => {
    setPreviewMounted(true);
    setPreviewOpen(true);
  };

  return (
    <>
      <div className='bg-card flex items-center gap-3 rounded-xl border p-3'>
        <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
          <KindIcon className='size-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{title}</p>
          <div className='text-muted-foreground mt-1 flex items-center gap-2 text-xs'>
            <Badge variant='outline'>{label}</Badge>
            {typeof sizeBytes === 'number' && <span>{formatBytes(sizeBytes)}</span>}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            onClick={openPreview}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Icons.eye /> 预览
          </button>
          <button
            type='button'
            onClick={() => void downloadArtifact(artifactId)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Icons.download /> 下载
          </button>
        </div>
      </div>
      {previewMounted && (
        <ArtifactPreviewDialog
          artifactId={artifactId}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </>
  );
}
