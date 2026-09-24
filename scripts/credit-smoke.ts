/* oxlint-disable no-console */
/**
 * Credits 计费核心冒烟：懒创建 → grant → checkBalance → chargeCredits（原子扣费）→ 流水/余额正确 → 透支至负。
 *
 * 运行：bun run scripts/credit-smoke.ts
 * 前置：.env.local 中 DATABASE_URL；迁移已应用（credits_accounts / credit_ledger 两表存在）。
 *
 * 说明：脚本使用独立的 smoke 用户 id，结尾清理其账户与流水，不污染真实数据。
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../src/lib/db';
import { creditLedger, creditsAccounts } from '../src/lib/db/schema';
import {
  chargeCredits,
  checkBalance,
  getBalance,
  grantCredits,
  listLedger,
  setBalance
} from '../src/features/credits/api/service';
import {
  priceChat,
  priceEmbedding,
  priceImage,
  priceVideo
} from '../src/features/credits/lib/pricing';

const SMOKE_USER = `credit-smoke-${Date.now()}`;

const checks: string[] = [];
function check(name: string, ok: boolean) {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

async function cleanup() {
  const db = getDb();
  await db.delete(creditLedger).where(sql`user_id = ${SMOKE_USER}`);
  await db.delete(creditsAccounts).where(sql`user_id = ${SMOKE_USER}`);
}

// --- 0. 定价引擎纯函数（无需 DB） -----------------------------------------
check('priceChat 至少 1 credit', priceChat('deepseek-flash', 100, 50) >= 1);
check(
  'priceChat output 贵于 input',
  priceChat('qwen3.8-max', 0, 1000) > priceChat('qwen3.8-max', 1000, 0)
);
check('priceImage 固定 30', priceImage(false) === 30 && priceImage(true) === 30);
check('priceVideo 720P 5s = 300', priceVideo('720P', 5) === 300);
check('priceVideo 1080P 5s = 500', priceVideo('1080P', 5) === 500);
check('priceEmbedding ceil 至少 1', priceEmbedding(100) >= 1);
check(
  'priceChat undefined token 防御为 0（仍至少 1）',
  priceChat('deepseek-flash', undefined as unknown as number, undefined as unknown as number) === 1
);

// --- 1. 懒创建：无账户 user getBalance=0、checkBalance=false ----------------
await cleanup(); // 确保起点干净
check('无账户 getBalance=0', (await getBalance(SMOKE_USER)) === 0);
check('无账户 checkBalance=false', (await checkBalance(SMOKE_USER)) === false);

// --- 2. grant：upsert 建行 + 余额增加 + 流水 delta=+ ------------------------
const afterGrant = await grantCredits({ userId: SMOKE_USER, amount: 500, note: 'smoke grant' });
check('grant 后余额=500', afterGrant === 500 && (await getBalance(SMOKE_USER)) === 500);
check('grant 后 checkBalance=true', (await checkBalance(SMOKE_USER)) === true);

// --- 3. chargeCredits：原子扣费 + 流水 balanceAfter 正确 --------------------
await chargeCredits({
  userId: SMOKE_USER,
  cost: 30,
  kind: 'image',
  meta: { assetId: 'a1', edit: false }
});
check('扣 30 后余额=470', (await getBalance(SMOKE_USER)) === 470);

await chargeCredits({
  userId: SMOKE_USER,
  cost: 300,
  kind: 'video',
  meta: { resolution: '720P', duration: 5 }
});
check('再扣 300 后余额=170', (await getBalance(SMOKE_USER)) === 170);

// --- 4. 流水：grant(+) / image(-) / video(-) 三笔，balanceAfter 快照正确 ----
const ledger = await listLedger(SMOKE_USER, { page: 1, limit: 10 });
check('流水共 3 笔', ledger.total === 3 && ledger.entries.length === 3);
// listLedger 默认 createdAt 倒序：最新（video）在前
const videoEntry = ledger.entries[0];
const imageEntry = ledger.entries[1];
const grantEntry = ledger.entries[2];
check(
  '最新流水为 video delta=-300 balanceAfter=170',
  videoEntry.kind === 'video' && videoEntry.delta === -300 && videoEntry.balanceAfter === 170
);
check(
  '次新流水为 image delta=-30 balanceAfter=470',
  imageEntry.kind === 'image' && imageEntry.delta === -30 && imageEntry.balanceAfter === 470
);
check(
  '最早流水为 grant delta=+500 balanceAfter=500',
  grantEntry.kind === 'grant' && grantEntry.delta === 500 && grantEntry.balanceAfter === 500
);

// --- 5. kind 筛选 -----------------------------------------------------------
const onlyVideo = await listLedger(SMOKE_USER, { page: 1, limit: 10, kind: 'video' });
check('kind=video 筛选返回 1 笔', onlyVideo.total === 1 && onlyVideo.entries[0].kind === 'video');

// --- 6. 透支至负：照扣不拦截，后续 checkBalance=false ----------------------
await chargeCredits({
  userId: SMOKE_USER,
  cost: 200,
  kind: 'chat',
  meta: { model: 'deepseek-flash', inputTokens: 1000, outputTokens: 500 }
});
check('透支后余额=-30', (await getBalance(SMOKE_USER)) === -30);
check('负余额 checkBalance=false（后续被拦）', (await checkBalance(SMOKE_USER)) === false);

// --- 7. 并发原子扣费：10 路并发各扣 10，余额精确减少 100（无竞态丢失）------
await setBalance({ userId: SMOKE_USER, amount: 1000, note: 'smoke reset for concurrency' });
check('set 后余额=1000', (await getBalance(SMOKE_USER)) === 1000);
await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    chargeCredits({ userId: SMOKE_USER, cost: 10, kind: 'chat', meta: { seq: i } })
  )
);
check('10 路并发扣费后余额=900（原子无竞态）', (await getBalance(SMOKE_USER)) === 900);

// --- 清理 -------------------------------------------------------------------
await cleanup();
check('清理后 getBalance=0', (await getBalance(SMOKE_USER)) === 0);

const failed = checks.filter((line) => line.startsWith('FAIL'));
console.log(failed.length === 0 ? 'SMOKE OK' : `SMOKE FAILED: ${failed.length} 项未通过`);
process.exit(failed.length === 0 ? 0 : 1);
