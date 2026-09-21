import { Icons, type Icon } from '@/components/icons';
import {
  KNOWLEDGE_SOURCE_LABELS,
  KNOWLEDGE_SOURCE_VALUES,
  KNOWLEDGE_STATUS_LABELS,
  KNOWLEDGE_STATUS_VALUES,
  type KnowledgeSource,
  type KnowledgeStatus
} from './knowledge';

/**
 * 知识库展示元数据（仅客户端组件使用；服务端代码请引用 constants/knowledge.ts）。
 * 状态/来源的文案、图标、徽标变体集中一处，表格与对话框共用。
 */

export interface StatusMeta {
  label: string;
  icon: Icon;
  variant: 'secondary' | 'outline' | 'destructive';
}

export interface SourceMeta {
  label: string;
  icon: Icon;
}

export const KNOWLEDGE_STATUS_META: Record<KnowledgeStatus, StatusMeta> = {
  processing: {
    label: KNOWLEDGE_STATUS_LABELS.processing,
    icon: Icons.spinner,
    variant: 'secondary'
  },
  ready: {
    label: KNOWLEDGE_STATUS_LABELS.ready,
    icon: Icons.circleCheck,
    variant: 'outline'
  },
  failed: {
    label: KNOWLEDGE_STATUS_LABELS.failed,
    icon: Icons.circleX,
    variant: 'destructive'
  }
};

export const KNOWLEDGE_SOURCE_META: Record<KnowledgeSource, SourceMeta> = {
  manual: { label: KNOWLEDGE_SOURCE_LABELS.manual, icon: Icons.text },
  asset: { label: KNOWLEDGE_SOURCE_LABELS.asset, icon: Icons.post }
};

/** 宽松读取：兼容未知历史值，避免渲染崩溃 */
export function getStatusMeta(status: string): StatusMeta {
  return (
    (KNOWLEDGE_STATUS_META as Record<string, StatusMeta>)[status] ?? {
      label: status,
      icon: Icons.info,
      variant: 'secondary'
    }
  );
}

export function getSourceMeta(source: string): SourceMeta {
  return (
    (KNOWLEDGE_SOURCE_META as Record<string, SourceMeta>)[source] ?? {
      label: source,
      icon: Icons.page
    }
  );
}

/**
 * data-table multiSelect 筛选选项。
 * 不带 icon：Option.icon 类型为 React.FC<SVGProps>，Tabler 图标是 ComponentType<IconProps>，
 * 两者不兼容（与资产表格的 kind 筛选保持一致，图标只在单元格内用）。
 */
export const STATUS_OPTIONS = KNOWLEDGE_STATUS_VALUES.map((status) => ({
  label: KNOWLEDGE_STATUS_META[status].label,
  value: status
}));

export const SOURCE_OPTIONS = KNOWLEDGE_SOURCE_VALUES.map((source) => ({
  label: KNOWLEDGE_SOURCE_META[source].label,
  value: source
}));
