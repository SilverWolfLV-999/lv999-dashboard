'use client';

import { Icons } from '@/components/icons';
import { ArtifactCard } from '../artifacts/artifact-card';
import type { ArtifactKind } from '../../api/types';

/** 供消息渲染层断言使用：保留 output 等完整字段类型，避免双重断言抹掉结构 */
export interface CreateArtifactToolPart {
  state: string;
  input?: { title?: string } | undefined;
  output?: { artifactId: string; title: string; kind: ArtifactKind; sizeBytes: number } | undefined;
  errorText?: string;
}

/**
 * createArtifact 工具的调用状态渲染：
 * 生成中 → 状态条；完成 → 产物卡片；失败 → 错误条。
 */
export function ToolArtifactPart({ part }: { part: CreateArtifactToolPart }) {
  const state = part.state;

  if (state === 'input-streaming' || state === 'input-available') {
    const title = part.input?.title;
    return (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm'>
        <Icons.spinner className='size-4 animate-spin' />
        正在生成产物{title ? `：${title}` : '…'}
      </div>
    );
  }

  if (state === 'output-available' && part.output) {
    const { artifactId, title, kind, sizeBytes } = part.output;
    return <ArtifactCard artifactId={artifactId} title={title} kind={kind} sizeBytes={sizeBytes} />;
  }

  if (state === 'output-error') {
    return (
      <div className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm'>
        产物保存失败：{part.errorText ?? '未知错误'}
      </div>
    );
  }

  return null;
}
