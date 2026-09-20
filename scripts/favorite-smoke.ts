/* oxlint-disable no-console */
/**
 * 收藏链路冒烟：对真实资产 收藏 → 仅看收藏筛选 → 还原，验证 C1/C2 数据链路。
 * 运行：bun run scripts/favorite-smoke.ts
 */
import { getDb } from '../src/lib/db';
import { assets } from '../src/lib/db/schema';
import { listAssets, setAssetFavorite } from '../src/features/agent/api/service';

const db = getDb();
const rows = await db.select({ id: assets.id, userId: assets.userId }).from(assets).limit(1);
const target = rows[0];
if (!target) {
  console.log('库中无资产，跳过（favorite 列已由迁移验证）');
  process.exit(0);
}

const ok = await setAssetFavorite(target.userId, target.id, true);
console.log('set favorite=true:', ok);

const filtered = await listAssets(target.userId, { favorite: true, page: 1, limit: 10 });
console.log(
  'favorite-only total:',
  filtered.total,
  'hit:',
  filtered.assets.some((a) => a.id === target.id)
);
console.log('asset.favorite mapped:', filtered.assets.find((a) => a.id === target.id)?.favorite);

const all = await listAssets(target.userId, { page: 1, limit: 10 });
console.log('unfiltered total:', all.total);

await setAssetFavorite(target.userId, target.id, false);
const restored = await listAssets(target.userId, { favorite: true, page: 1, limit: 10 });
console.log('restored favorite-only total:', restored.total);

process.exit(0);
