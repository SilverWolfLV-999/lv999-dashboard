'use client';

import { Icons } from '@/components/icons';
import { ArtifactCard } from '../artifacts/artifact-card';
import type { ArtifactKind } from '../../api/types';

/** 供消息渲染层断言使用：保留 output 等完整字段类型，避免双重断言抹掉结构 */
export interface CreateImageArtifactToolPart {
  state: string;
  input?: { title?: string } | undefined;
  output?: { artifactId: string; title: string; kind: ArtifactKind; sizeBytes: number } | undefined;
  errorText?: string;
}

/**
 * createImageArtifact 工具的调用状态渲染：
 * 生成中（通常 10-60 秒）→ 状态条；完成 → 产物卡片；失败 → 错误条（引导换描述重试）。
 *
 * 关于 active：AI SDK 中止语义下（stop() / abortSignal），进行中的 tool part 不会被置为终态
 * （流以 abort chunk 结束、无 tool-output-error，持久化仍是 input-available），
 * 因此仅当该消息仍在流式中才显示 loading；否则渲染中性「已停止」收尾，
 * 避免停止后残留永久转圈的「正在生成图片」状态条（刷新后同样正确还原）。
 */
export function ToolImagePart({
  part,
  active
}: {
  part: CreateImageArtifactToolPart;
  active: boolean;
}) {
  const state = part.state;

  if (state === 'input-streaming' || state === 'input-available') {
    const title = part.input?.title;
    if (!active) {
      return (
        <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm'>
          <Icons.clock className='size-4' />
          已停止：{title ? `${title} 未生成图片` : '图片未生成'}
        </div>
      );
    }
    return (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm'>
        <Icons.spinner className='size-4 animate-spin' />
        正在生成图片{title ? `：${title}` : '…'}（通常需 10–60 秒）
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
        图片生成失败：{part.errorText ?? '未知错误'}（可换个画面描述后重试）
      </div>
    );
  }

  return null;
}
