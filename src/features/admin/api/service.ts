import { clerkClient } from '@clerk/nextjs/server';
import { count, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  assets,
  conversations,
  creditLedger,
  creditsAccounts,
  knowledgeChunks,
  knowledgeDocuments,
  messages
} from '@/lib/db/schema';
import { getOssClient } from '@/lib/oss';
import { getBalancesByIds } from '@/features/credits/api/service';
import type { AdminUser, AdminUserFilters, AdminUsersResponse, DeleteUserResult } from './types';

/**
 * 管理员用户管理数据访问层（server-only）。
 *
 * - 列用户：Clerk Backend API `getUserList`（分页 + 搜索 + 排序）+ 合并项目 `credits_accounts` 余额（批量查，避免 N+1）。
 * - 删用户：先 Clerk 删号断登录 → DB 事务级联清理 7 表 → OSS 对象清理（失败仅告警）。
 * - 调 Credits：不在本文件重写，路由直接复用 `features/credits` 的 grantCredits / setBalance。
 *
 * 客户端经 `/api/admin/*` Route Handlers 访问（每个端点 isAdmin 403 守卫），不直接引用本文件。
 */

/**
 * Clerk Backend `User` 的结构子集（仅取本模块用到的字段）。
 * 用结构化类型而非直接 import `@clerk/backend`：后者是 `@clerk/nextjs` 的传递依赖，不作直接依赖引入。
 */
interface ClerkUserLike {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
  /** Unix 毫秒时间戳 */
  createdAt: number;
  /** Unix 毫秒时间戳；从未登录为 null */
  lastSignInAt: number | null;
  primaryEmailAddress: { emailAddress: string } | null;
}

/** Clerk getUserList 支持的 orderBy 值（本模块仅按注册时间 / 最近登录排序） */
type UserOrderBy = '+created_at' | '-created_at' | '+last_sign_in_at' | '-last_sign_in_at';

function resolveName(user: ClerkUserLike, email: string): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.username) return user.username;
  if (email) return email.split('@')[0] ?? user.id;
  return user.id;
}

function toAdminUser(user: ClerkUserLike, balance: number): AdminUser {
  const email = user.primaryEmailAddress?.emailAddress ?? '';
  return {
    id: user.id,
    name: resolveName(user, email),
    email: email || '（无邮箱）',
    imageUrl: user.imageUrl,
    createdAt: new Date(user.createdAt).toISOString(),
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
    balance
  };
}

/**
 * 解析前端排序参数为 Clerk orderBy。
 * 与其它列表同构：`sort` 为 JSON 字符串 `[{ id, desc }]`，仅取首列；非受支持列回退默认 `-created_at`。
 */
function parseUserOrderBy(sort?: string): UserOrderBy {
  if (!sort) return '-created_at';
  try {
    const parsed = JSON.parse(sort) as { id?: string; desc?: boolean }[];
    const first = Array.isArray(parsed) ? parsed[0] : undefined;
    const sign = first?.desc === false ? '+' : '-';
    switch (first?.id) {
      case 'lastSignInAt':
        return `${sign}last_sign_in_at`;
      case 'createdAt':
        return `${sign}created_at`;
      default:
        return '-created_at';
    }
  } catch {
    return '-created_at';
  }
}

/** 用户列表：Clerk BAPI 分页 + 合并 Credits 余额（一次批量查，避免逐用户 getBalance 的 N+1） */
export async function listUsers(filters: AdminUserFilters): Promise<AdminUsersResponse> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 10));
  const query = filters.query?.trim();

  const client = await clerkClient(); // ⚠️ v7 clerkClient 为 async，必须 await
  const { data, totalCount } = await client.users.getUserList({
    offset: (page - 1) * limit,
    limit,
    orderBy: parseUserOrderBy(filters.sort),
    ...(query ? { query } : {})
  });

  const balances = await getBalancesByIds(data.map((user) => user.id));
  const users = data.map((user) => toAdminUser(user, balances.get(user.id) ?? 0));
  return { users, total: totalCount, page, limit };
}

/**
 * 级联删除用户（不可逆重操作）。顺序：先断登录，再清数据，最后清对象存储。
 *
 * 1. **Clerk 删号**：立即禁止登录，防删除过程中产生新数据；已删（404）则幂等继续（支持中断后重跑）。
 * 2. **DB 事务**：先收集 assets 的 storageKey 与预数 messages，再按 userId 删各表——
 *    `messages` 无 userId 列，靠 `conversations` 的 ON DELETE CASCADE 清理；`knowledgeChunks` 显式按 userId 删 +
 *    `knowledgeDocuments` 的 CASCADE 兜底；其余表跨表外键均 cascade / set null，无 restrict 阻塞。
 * 3. **OSS 清理**：逐个删步骤 2 收集的 storageKey，失败仅 `console.warn` 不阻塞（沿用 deleteAsset 模式）。
 */
export async function deleteUserCascade(userId: string): Promise<DeleteUserResult> {
  // 1. 先 Clerk 删号（断登录）；已删则幂等继续
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    // Clerk 404 = 账号已不存在（重跑场景）：继续清理残留 DB / OSS 数据
    if ((error as { status?: number })?.status !== 404) throw error;
    console.warn('[admin] Clerk user already deleted, continuing DB cleanup:', { userId });
  }

  // 2. DB 事务清理 + 收集 storageKey
  const db = getDb();
  const { storageKeys, counts } = await db.transaction(async (tx) => {
    const convRows = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, userId));
    const convIds = convRows.map((row) => row.id);
    const assetRows = await tx
      .select({ storageKey: assets.storageKey })
      .from(assets)
      .where(eq(assets.userId, userId));

    // messages 无 userId 列：删 conversations 前先按其 id 计数（cascade 删除本身不回传被级联行数）
    const [msgRow] =
      convIds.length > 0
        ? await tx
            .select({ value: count() })
            .from(messages)
            .where(inArray(messages.conversationId, convIds))
        : [{ value: 0 }];

    const chunks = await tx
      .delete(knowledgeChunks)
      .where(eq(knowledgeChunks.userId, userId))
      .returning({ id: knowledgeChunks.id });
    const docs = await tx
      .delete(knowledgeDocuments)
      .where(eq(knowledgeDocuments.userId, userId))
      .returning({ id: knowledgeDocuments.id });
    const assetsDel = await tx
      .delete(assets)
      .where(eq(assets.userId, userId))
      .returning({ id: assets.id });
    const convs = await tx
      .delete(conversations)
      .where(eq(conversations.userId, userId))
      .returning({ id: conversations.id });
    const ledger = await tx
      .delete(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .returning({ id: creditLedger.id });
    const accounts = await tx
      .delete(creditsAccounts)
      .where(eq(creditsAccounts.userId, userId))
      .returning({ userId: creditsAccounts.userId });

    return {
      storageKeys: assetRows
        .map((row) => row.storageKey)
        .filter((key): key is string => Boolean(key)),
      counts: {
        conversations: convs.length,
        messages: msgRow?.value ?? 0,
        assets: assetsDel.length,
        knowledgeDocuments: docs.length,
        knowledgeChunks: chunks.length,
        creditLedger: ledger.length,
        creditsAccounts: accounts.length
      }
    };
  });

  // 3. OSS 清理（失败仅告警不阻塞：DB 行已删，残留对象无访问路径）
  let ossObjects = 0;
  for (const key of storageKeys) {
    try {
      await getOssClient().delete(key);
      ossObjects += 1;
    } catch (error) {
      console.warn('[admin] failed to delete OSS object:', { key, error });
    }
  }

  return { ...counts, ossObjects };
}
