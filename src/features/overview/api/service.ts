import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { assets, conversations } from '@/lib/db/schema';
import { ASSET_KIND_VALUES, type AssetKind } from '@/features/agent/api/types';
import type { AssetStats, ConversationStats, DailyAssetCount, RecentAssetItem } from './types';

/**
 * 创作数据看板数据访问层（server-only）。
 *
 * 总览页 layout 与 4 个并行路由槽在同一次请求内各自调用 getAssetStats，
 * 用 React.cache 做 per-request 去重（与 agent 模块 getConversation 同款模式），
 * 每次页面渲染实际只打一轮统计查询。
 *
 * 全部按 userId 过滤（看板是「我的」创作数据）；userId 为空（未登录）时返回空统计。
 */

const TREND_DAYS = 30;
const TREND_TIMEZONE = 'Asia/Shanghai';
/** TREND_TIMEZONE 的固定偏移（上海无夏令时），用于构造日历日边界 */
const TREND_TZ_OFFSET = '+08:00';
const RECENT_LIMIT = 8;

/** 类型分布固定顺序（直接取 ASSET_KIND_VALUES 单一来源，新增类型不会漏统计） */
const KIND_ORDER: AssetKind[] = [...ASSET_KIND_VALUES];

const EMPTY_STATS: AssetStats = {
  total: 0,
  last30dCount: 0,
  prev30dCount: 0,
  imageCount: 0,
  kindCounts: KIND_ORDER.map((kind) => ({ kind, count: 0 })),
  dailyTrend: buildDailyTrend([]),
  recentAssets: []
};

interface DayBucketRow {
  /** SQL 端 to_char 产出的日历日 key（YYYY-MM-DD），不经 JS Date 解析，避免服务器时区干扰 */
  day: string;
  source: string;
  total: string;
}

/** Asia/Shanghai 日历日 key（YYYY-MM-DD）；SQL date_trunc 与 JS 补零共用同一时区口径 */
function formatDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TREND_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * 近 30 个自然日窗口（Asia/Shanghai，含今天）：
 * 返回 [窗口起点, 今天之后的上界) 与逐日 key 列表（升序）。
 */
function getTrendWindow(): { start: Date; end: Date; dayKeys: string[] } {
  const now = new Date();
  const todayKey = formatDayKey(now);
  // 边界必须是「上海午夜」：用 +08:00 构造，若用 Z（UTC 午夜）会漏掉首日 00:00-08:00 的资产
  const start = new Date(`${todayKey}T00:00:00.000${TREND_TZ_OFFSET}`);
  start.setUTCDate(start.getUTCDate() - (TREND_DAYS - 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + TREND_DAYS);

  const dayKeys: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < TREND_DAYS; i += 1) {
    dayKeys.push(formatDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { start, end, dayKeys };
}

/** 按天分组行（day 已是 YYYY-MM-DD 文本）→ 逐日补 0 的升序趋势 */
function buildDailyTrend(rows: DayBucketRow[]): DailyAssetCount[] {
  const { dayKeys } = getTrendWindow();
  const byDay = new Map<string, DailyAssetCount>();
  for (const key of dayKeys) {
    byDay.set(key, { date: key, count: 0, generated: 0, imported: 0 });
  }
  for (const row of rows) {
    const bucket = byDay.get(row.day);
    if (!bucket) continue;
    const value = Number(row.total);
    bucket.count += value;
    if (row.source === 'upload') bucket.imported += value;
    else bucket.generated += value;
  }
  return dayKeys.map((key) => byDay.get(key) ?? { date: key, count: 0, generated: 0, imported: 0 });
}

/**
 * 资产统计聚合：总数 / 近 30 天与上一个 30 天新增 / 类型分布 / 按天趋势 / 最近创作。
 * 五路查询互不依赖，并行执行（async-parallel）。
 */
export const getAssetStats = cache(async (userId: string | null): Promise<AssetStats> => {
  if (!userId) return EMPTY_STATS;
  const db = getDb();
  const { start, end } = getTrendWindow();
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - TREND_DAYS);

  const [totalRows, last30dRows, prev30dRows, kindRows, trendRows, recentRows] = await Promise.all([
    db.select({ value: count() }).from(assets).where(eq(assets.userId, userId)),
    db
      .select({ value: count() })
      .from(assets)
      .where(and(eq(assets.userId, userId), gte(assets.createdAt, start))),
    db
      .select({ value: count() })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          gte(assets.createdAt, prevStart),
          lt(assets.createdAt, start)
        )
      ),
    db
      .select({ kind: assets.kind, value: count() })
      .from(assets)
      .where(eq(assets.userId, userId))
      .groupBy(assets.kind),
    db
      .select({
        // at time zone 产出 timestamp without tz，若原样返回会被 pg 驱动按服务器本地时区
        // 解析成 Date（+08 机器上整体前移一天）；在 SQL 端直接 to_char 成日期文本规避该问题
        day: sql<string>`to_char(date_trunc('day', ${assets.createdAt} at time zone ${TREND_TIMEZONE}), 'YYYY-MM-DD')`,
        source: assets.source,
        total: sql<string>`count(*)::text`
      })
      .from(assets)
      .where(
        and(eq(assets.userId, userId), gte(assets.createdAt, start), lt(assets.createdAt, end))
      )
      .groupBy(sql`1`, assets.source),
    db
      .select({
        id: assets.id,
        title: assets.title,
        kind: assets.kind,
        createdAt: assets.createdAt
      })
      .from(assets)
      .where(eq(assets.userId, userId))
      .orderBy(desc(assets.createdAt))
      .limit(RECENT_LIMIT)
  ]);

  const kindCountMap = new Map(kindRows.map((row) => [row.kind, Number(row.value)]));
  const kindCounts = KIND_ORDER.map((kind) => ({
    kind,
    count: kindCountMap.get(kind) ?? 0
  }));
  const recentAssets: RecentAssetItem[] = recentRows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind as AssetKind,
    createdAt: row.createdAt.toISOString()
  }));

  return {
    total: Number(totalRows[0]?.value ?? 0),
    last30dCount: Number(last30dRows[0]?.value ?? 0),
    prev30dCount: Number(prev30dRows[0]?.value ?? 0),
    imageCount: kindCountMap.get('image') ?? 0,
    kindCounts,
    dailyTrend: buildDailyTrend(trendRows),
    recentAssets
  };
});

/** 会话总数（看板「创作会话」卡） */
export const getConversationStats = cache(
  async (userId: string | null): Promise<ConversationStats> => {
    if (!userId) return { total: 0 };
    const db = getDb();
    const rows = await db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.userId, userId));
    return { total: Number(rows[0]?.value ?? 0) };
  }
);
