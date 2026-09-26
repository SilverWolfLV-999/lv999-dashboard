import { Icons, type Icon } from '@/components/icons';
import type { CreditKind, CreditLedgerMeta } from '../api/types';
import { CREDIT_KIND_VALUES } from '../api/types';

/**
 * Credits 流水展示元数据（表格单元格 + 筛选共用）。
 * 类型文案、图标、徽标变体与 meta 摘要集中一处。
 */

export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  grant: '发放',
  chat: '对话',
  image: '图片',
  video: '视频',
  knowledge: '知识库'
};

export interface CreditKindMeta {
  label: string;
  icon: Icon;
}

const CREDIT_KIND_META: Record<CreditKind, CreditKindMeta> = {
  grant: { label: CREDIT_KIND_LABELS.grant, icon: Icons.plusCircle },
  chat: { label: CREDIT_KIND_LABELS.chat, icon: Icons.chat },
  image: { label: CREDIT_KIND_LABELS.image, icon: Icons.media },
  video: { label: CREDIT_KIND_LABELS.video, icon: Icons.video },
  knowledge: { label: CREDIT_KIND_LABELS.knowledge, icon: Icons.book }
};

/** 宽松读取：兼容未知历史值，避免渲染崩溃 */
export function getCreditKindMeta(kind: string): CreditKindMeta {
  return (
    (CREDIT_KIND_META as Record<string, CreditKindMeta>)[kind] ?? {
      label: kind,
      icon: Icons.info
    }
  );
}

/**
 * data-table multiSelect 筛选选项。
 * 不带 icon：Option.icon 类型为 React.FC<SVGProps>，Tabler 图标是 ComponentType<IconProps>，
 * 两者不兼容（与知识库表格保持一致，图标只在单元格内用）。
 */
export const KIND_OPTIONS = CREDIT_KIND_VALUES.map((kind) => ({
  label: CREDIT_KIND_LABELS[kind],
  value: kind
}));

/** token 数紧凑展示（≥1000 用 K） */
function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(Math.round(value));
}

function readNumber(meta: Record<string, unknown>, key: string): number {
  const value = Number(meta[key]);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 流水 meta 摘要（详情列）：把计量明细渲染为一句话，如
 * 「对话 1.2K tokens」「视频 720P 5s」「图片编辑（I2I）」「图片生成（整版设计主图）」「知识库摄取 500 tokens」「发放：体验额度」。
 */
export function describeLedgerMeta(kind: string, meta: CreditLedgerMeta | null): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (kind) {
    case 'chat': {
      const total = readNumber(m, 'inputTokens') + readNumber(m, 'outputTokens');
      const aborted = m.aborted ? '（已停止）' : '';
      return total > 0 ? `对话 ${formatTokens(total)} tokens${aborted}` : `对话${aborted}`;
    }
    case 'image':
      // compose=true 为「一句话生成整版设计」内含的主图（design 落库本身不计费）
      return m.edit ? '图片编辑（I2I）' : m.compose ? '图片生成（整版设计主图）' : '图片生成';
    case 'video': {
      const resolution = typeof m.resolution === 'string' ? m.resolution : '';
      const duration = readNumber(m, 'duration');
      return resolution && duration > 0 ? `视频 ${resolution} ${duration}s` : '视频生成';
    }
    case 'knowledge': {
      const tokens = readNumber(m, 'tokens');
      return tokens > 0 ? `知识库摄取 ${formatTokens(tokens)} tokens` : '知识库摄取';
    }
    case 'grant':
      return typeof m.note === 'string' && m.note ? `发放：${m.note}` : '发放';
    default:
      return '';
  }
}
