import { Icons, type Icon } from '@/components/icons';
import type { ArtifactKind } from '../api/types';

export interface ArtifactKindMeta {
  label: string;
  icon: Icon;
}

/**
 * 产物类型统一元数据（Phase 2 小重构）：对话卡片、预览弹窗、产物表格列共用一个来源，
 * 消除多处重复的 kind 判断与文案。
 */
export const ARTIFACT_KIND_META: Record<ArtifactKind, ArtifactKindMeta> = {
  markdown: { label: 'Markdown', icon: Icons.post },
  html: { label: 'HTML', icon: Icons.code },
  image: { label: '图片', icon: Icons.media }
};

/** 表格筛选/展示顺序 */
export const ARTIFACT_KINDS = Object.keys(ARTIFACT_KIND_META) as ArtifactKind[];

/** 宽松读取：兼容未知历史 kind，避免渲染崩溃 */
export function getArtifactKindMeta(kind: string): ArtifactKindMeta {
  return (
    (ARTIFACT_KIND_META as Record<string, ArtifactKindMeta>)[kind] ?? {
      label: kind,
      icon: Icons.page
    }
  );
}
