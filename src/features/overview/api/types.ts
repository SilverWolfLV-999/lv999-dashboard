import type { AssetKind } from '@/features/agent/api/types';

/**
 * 创作数据看板（/dashboard/overview）响应类型契约。
 * 数据全部来自当前用户的 assets / conversations 真实行（见 service.ts）。
 */

/** 单一资产类型的计数（分布饼图 / 类型对比用） */
export interface AssetKindCount {
  kind: AssetKind;
  count: number;
}

/** 近 30 天按天计数（含来源拆分：AI 生成 / 用户上传） */
export interface DailyAssetCount {
  /** 自然日（Asia/Shanghai），格式 YYYY-MM-DD */
  date: string;
  /** 当日新增总数 */
  count: number;
  /** 当日 source='agent' 计数 */
  generated: number;
  /** 当日 source='upload' 计数 */
  imported: number;
}

/** 最近创作列表项 */
export interface RecentAssetItem {
  id: string;
  title: string;
  kind: AssetKind;
  createdAt: string;
}

export interface AssetStats {
  /** 资产总数 */
  total: number;
  /** 近 30 天新增 */
  last30dCount: number;
  /** 上一个 30 天新增（环比基期） */
  prev30dCount: number;
  /** 图片资产数（kind='image'） */
  imageCount: number;
  /** 各类型计数（固定顺序：markdown/html/image/design） */
  kindCounts: AssetKindCount[];
  /** 近 30 天按天趋势（升序，缺失日期已补 0） */
  dailyTrend: DailyAssetCount[];
  /** 最近创作（按创建时间倒序，最多 8 条） */
  recentAssets: RecentAssetItem[];
}

export interface ConversationStats {
  /** 会话总数 */
  total: number;
}
