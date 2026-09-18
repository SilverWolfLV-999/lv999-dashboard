'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatBytes } from '../../lib/format';
import type { ArtifactKind } from '../../api/types';
import { ArtifactPreviewDialog } from './artifact-preview-dialog';

interface ArtifactCardProps {
  artifactId: string;
  title: string;
  kind: ArtifactKind;
  sizeBytes?: number | null;
}

/** 对话内联的产物卡片：预览 + 下载 */
export function ArtifactCard({ artifactId, title, kind, sizeBytes }: ArtifactCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const KindIcon = kind === 'html' ? Icons.code : Icons.post;

  return (
    <>
      <div className='bg-card flex items-center gap-3 rounded-xl border p-3'>
        <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
          <KindIcon className='size-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{title}</p>
          <div className='text-muted-foreground mt-1 flex items-center gap-2 text-xs'>
            <Badge variant='outline'>{kind === 'html' ? 'HTML' : 'Markdown'}</Badge>
            {typeof sizeBytes === 'number' && <span>{formatBytes(sizeBytes)}</span>}
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            onClick={() => setPreviewOpen(true)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Icons.eye /> 预览
          </button>
          <a
            href={`/api/agent/artifacts/${artifactId}/download`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <Icons.download /> 下载
          </a>
        </div>
      </div>
      <ArtifactPreviewDialog
        artifactId={artifactId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
