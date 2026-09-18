'use client';

import { useQuery } from '@tanstack/react-query';
import { Streamdown } from 'streamdown';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { artifactQueryOptions } from '../../api/queries';
import { formatBytes } from '../../lib/format';

interface ArtifactPreviewDialogProps {
  artifactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 产物预览弹窗。
 * Markdown 用 Streamdown 渲染；HTML 一律放入 sandbox="allow-scripts" 的 iframe
 * （不加 allow-same-origin），与主站隔离，防止产物脚本访问父页面会话。
 */
export function ArtifactPreviewDialog({
  artifactId,
  open,
  onOpenChange
}: ArtifactPreviewDialogProps) {
  const { data, isLoading, isError } = useQuery({
    ...artifactQueryOptions(artifactId),
    enabled: open
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl'>
        <DialogHeader className='flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-12'>
          <div className='min-w-0'>
            <DialogTitle className='truncate'>{data?.title ?? '产物预览'}</DialogTitle>
            <DialogDescription className='sr-only'>产物内容预览</DialogDescription>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            {data && <Badge variant='outline'>{data.kind === 'html' ? 'HTML' : 'Markdown'}</Badge>}
            {data?.sizeBytes != null && (
              <span className='text-muted-foreground text-xs'>{formatBytes(data.sizeBytes)}</span>
            )}
            <a
              href={`/api/agent/artifacts/${artifactId}/download`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <Icons.download /> 下载
            </a>
          </div>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-auto'>
          {isLoading && <div className='text-muted-foreground p-6 text-sm'>加载中…</div>}
          {isError && (
            <div className='text-destructive p-6 text-sm'>加载产物失败，请稍后重试。</div>
          )}
          {data?.kind === 'html' && (
            <iframe
              title={data.title}
              sandbox='allow-scripts'
              srcDoc={data.content ?? ''}
              className='h-full w-full bg-white'
            />
          )}
          {data?.kind === 'markdown' && (
            <div className='p-5'>
              <Streamdown>{data.content ?? ''}</Streamdown>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
