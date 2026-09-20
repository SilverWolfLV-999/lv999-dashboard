'use client';

import { Icons } from '@/components/icons';
import { AssetCard } from '../assets/asset-card';
import type { AssetKind } from '../../api/types';

/** 供消息渲染层断言使用：保留 output 等完整字段类型，避免双重断言抹掉结构 */
export interface CreateAssetToolPart {
  state: string;
  input?: { title?: string } | undefined;
  output?: { assetId: string; title: string; kind: AssetKind; sizeBytes: number } | undefined;
  errorText?: string;
}

/**
 * createAsset 工具的调用状态渲染：
 * 生成中 → 状态条；完成 → 资产卡片；失败 → 错误条。
 *
 * 关于 active：与 ToolImagePart 同理——AI SDK 中止语义下进行中的 tool part 不落终态，
 * 非流式（active=false）时渲染中性「已停止」收尾，避免残留永久转圈的状态条。
 */
export function ToolAssetPart({ part, active }: { part: CreateAssetToolPart; active: boolean }) {
  const state = part.state;

  if (state === 'input-streaming' || state === 'input-available') {
    const title = part.input?.title;
    if (!active) {
      return (
        <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm'>
          <Icons.clock className='size-4' />
          已停止：{title ? `${title} 未保存` : '资产未保存'}
        </div>
      );
    }
    return (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm'>
        <Icons.spinner className='size-4 animate-spin' />
        正在生成资产{title ? `：${title}` : '…'}
      </div>
    );
  }

  if (state === 'output-available' && part.output) {
    const { assetId, title, kind, sizeBytes } = part.output;
    return <AssetCard assetId={assetId} title={title} kind={kind} sizeBytes={sizeBytes} />;
  }

  if (state === 'output-error') {
    return (
      <div className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm'>
        资产保存失败：{part.errorText ?? '未知错误'}
      </div>
    );
  }

  return null;
}
