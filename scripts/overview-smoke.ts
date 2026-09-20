/* oxlint-disable no-console */
/**
 * 创作数据看板冒烟脚本：对真实库调用 getAssetStats / getConversationStats，打印结构验证。
 *
 * 运行：bun run scripts/overview-smoke.ts
 * 前置：.env.local 中配置 DATABASE_URL（脚本自行加载，不依赖 shell 环境）
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const { getDb } = await import('../src/lib/db');
const { assets } = await import('../src/lib/db/schema');
const { getAssetStats, getConversationStats } =
  await import('../src/features/overview/api/service');

const db = getDb();
const userRows = await db.select({ userId: assets.userId }).from(assets).limit(1);
const userId = userRows[0]?.userId ?? null;
console.log('userId:', userId ?? '(库中无资产，用 null 验证空态)');

const stats = await getAssetStats(userId);
const conversations = await getConversationStats(userId);

console.log('total:', stats.total);
console.log('last30d:', stats.last30dCount, 'prev30d:', stats.prev30dCount);
console.log('imageCount:', stats.imageCount);
console.log('kindCounts:', stats.kindCounts);
console.log('dailyTrend.length:', stats.dailyTrend.length);
console.log('dailyTrend tail(7):', stats.dailyTrend.slice(-7));
console.log(
  'trendSum:',
  stats.dailyTrend.reduce((sum, day) => sum + day.count, 0)
);
console.log('recentAssets:', stats.recentAssets);
console.log('conversations:', conversations);

const empty = await getAssetStats(null);
console.log('empty stats ok:', empty.total === 0 && empty.dailyTrend.length === 30);

process.exit(0);
