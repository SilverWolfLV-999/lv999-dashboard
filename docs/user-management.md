# 用户管理（管理员后台）

LV999 Dashboard 的**平台管理员后台**：管理员在 `/dashboard/admin/users` 列出全部用户、调整其 Credits、级联删除账号。取代原先「只能靠 CLI 发 Credits」的方式，配合 [Credits 消耗系统](./credits.md) 形成完整的成本管控闭环。

> 本模块伴随一次「**从多租户骨架 → 单管理员后台**」的重心转移：项目核心业务全部按 `userId` 隔离、无任何 `orgId` 依赖，故**移除了 Clerk Organizations 多租户功能**（工作区 / 团队 / OrgSwitcher），改为单管理员模型。**零新增 npm 依赖**（Clerk Backend API 来自已装的 `@clerk/nextjs`）、**无 DB 迁移**（复用现有 7 表）。

---

## 1. 概览

- **入口**：账号下拉菜单「用户管理」项（**仅管理员可见**，`isAdmin` 由服务端注入）；页面 `/dashboard/admin/users`。
- **能力**：列出全部用户（Clerk 身份 + Credits 余额）、调整 Credits（加/设）、级联删除账号。
- **鉴权**：`ADMIN_USER_IDS` env 白名单 + 服务端 `isAdmin` 强制校验（页面 `notFound()`、端点 403 `forbidden`）。
- **管理员同走积分**：无 `unlimited` 特权；能运行 CLI / 在白名单内即为管理员。

---

## 2. 组织功能移除（多租户 → 单管理员）

经代码核实：`src/features` 与 `src/app/api` 全量搜索 `orgId`/`organization` **0 匹配**，`proxy.ts`（clerkMiddleware）与 `dashboard/layout.tsx`（`auth.protect()`）均不强制组织——组织功能零业务依赖，移除无损失。已移除：

| 移除项 | 说明 |
| --- | --- |
| `nav-config.ts` 的「工作区」「团队」菜单 | 多租户入口 |
| `dashboard/workspaces/page.tsx`、`workspaces/team/[[...rest]]/page.tsx` | `OrganizationList` / `OrganizationProfile` |
| `components/org-switcher.tsx` | 侧边栏组织切换器 |
| `config/infoconfig.ts` | 整文件删除（仅 workspaces/team 的 Infobar 文案，无其他引用）|

- **SidebarHeader 改为项目标识**：[`app-sidebar.tsx`](../src/components/layout/app-sidebar.tsx) 顶部换成 Logo +「LV999 Dashboard / 管理后台」（链接 `/dashboard/overview`），比组织切换器更贴合单人使用。
- **保留 `use-nav` 的 RBAC 框架**：`useOrganization` 在无组织时返回空，`access` 过滤对无 access 项全通过，零副作用；`NavItem.access` 类型保留（未来加权限菜单可复用）。
- Clerk Dashboard 的 Organizations 可选关闭（见 [`docs/clerk_setup.md`](./clerk_setup.md)）。

---

## 3. 管理员鉴权（[`src/lib/admin.ts`](../src/lib/admin.ts)，server-only）

```ts
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS ?? '';         // 逗号分隔的 Clerk userId
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(userId);
}
```

- **安全默认**：`ADMIN_USER_IDS` 未配置 / 配错 → `isAdmin` 恒 false → 管理页对所有人不可达、admin 端点一律 403。
- **服务端强制是唯一底线**：
  - 页面 [`dashboard/admin/users/page.tsx`](../src/app/dashboard/admin/users/page.tsx)：`auth()` 后 `!isAdmin → notFound()`。
  - 每个 `/api/admin/*` 端点：`auth()` → `!isAdmin → apiError(403, 'forbidden', …)`（[`api-error.ts`](../src/lib/api-error.ts) 新增 `forbidden` code）。
- **入口可见性（仅 UX）**：[`dashboard/layout.tsx`](../src/app/dashboard/layout.tsx)（server）`const { userId } = await auth.protect(); const admin = isAdmin(userId);` → `<AppSidebar isAdmin={admin} />` → 下拉「用户管理」项按 `isAdmin` 渲染。客户端可见性不作为权限依据。

---

## 4. 数据访问（[`features/admin/api/service.ts`](../src/features/admin/api/service.ts)，server-only）

### 4.1 列用户（Clerk BAPI + 合并余额）

```ts
const client = await clerkClient();                     // ⚠️ v7 clerkClient() 是 async，必须 await
const { data, totalCount } = await client.users.getUserList({
  offset: (page - 1) * limit, limit, orderBy, ...(query ? { query } : {})
});
const balances = await getBalancesByIds(data.map((u) => u.id)); // 批量查，避免 N+1
```

- `getUserList` 支持分页（`offset`/`limit`）、搜索（`query` 透传，按邮箱/名/用户名）、排序（`orderBy`：`±created_at` / `±last_sign_in_at`，由前端 `sort` JSON 解析）。
- **余额合并**：复用 credits 的 [`getBalancesByIds`](../src/features/credits/api/service.ts)（一次 `select … where userId in (…)` 返回 `Map`），无账户行的用户按 0（与懒创建约定一致）。
- `AdminUser` = `{ id, name, email, imageUrl, createdAt, lastSignInAt, balance }`；`name` 由 firstName+lastName → username → 邮箱前缀 → userId 逐级回退。
- **`ClerkUserLike` 结构化类型**：仅取用到的字段，不直接 `import @clerk/backend`（它是 `@clerk/nextjs` 的传递依赖，不作直接依赖）。

---

## 5. 级联删除用户（`deleteUserCascade`，不可逆重操作）

顺序：**先断登录 → 再清数据 → 最后清对象存储**。

1. **Clerk 删号**：`await (await clerkClient()).users.deleteUser(userId)`——立即禁止登录，防删除过程中产生新数据。**404（已删）幂等继续**（支持中断后重跑）。
2. **DB 事务**（`getDb().transaction`，全部 `where userId=`）：
   - 先收集 `assets.storageKey`（供步骤 3）与**预数 `messages`**——`messages` 无 `userId` 列，靠 `conversations` 的 `ON DELETE CASCADE` 清理，而 cascade 不回传被级联行数，故删 `conversations` 前先按其 id `count(messages)`。
   - 依次删：`knowledgeChunks`(by userId，显式) → `knowledgeDocuments`(cascade 兜底 chunks) → `assets` → `conversations`(cascade messages) → `creditLedger` → `creditsAccounts`。跨表外键均 cascade/set null，无 restrict 阻塞。
3. **OSS 清理**：逐个 `getOssClient().delete(storageKey)`，失败仅 `console.warn` 不阻塞（沿用 `deleteAsset` 模式；DB 行已删，残留对象无访问路径）。
- **返回** `DeleteUserResult`：各表删除行数（conversations/messages/assets/knowledgeDocuments/knowledgeChunks/creditLedger/creditsAccounts）+ `ossObjects`，供前端 toast 展示清理明细。
- **防自删**：端点层拒绝 `id === 当前管理员 userId`（400），避免删自己后立即断登录、失去管理入口。

---

## 6. 调整 Credits（复用 Credits 服务）

不在 admin 重写发放逻辑，直接复用 [`features/credits/api/service.ts`](../src/features/credits/api/service.ts) 的 `grantCredits`（余额 += amount）/ `setBalance`（余额 = amount），两者均写 `credit_ledger` 流水。请求体 `adjustCreditsSchema`：`{ mode:'grant'|'set', amount:int, note? }`，refine 校验 grant 需正整数、set 需非负整数。

---

## 7. API 端点（`/api/admin/*`，全部 `auth()` + `isAdmin` 403 + 限流 scope `admin` 30/分）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users` | 用户列表（分页 `page`/`limit` + `query` 搜索 + `sort` 排序）+ 合并余额 |
| POST | `/api/admin/users/[id]/credits` | 调 Credits：body `{ mode, amount, note? }`（Zod 校验）→ grantCredits/setBalance → 返回新余额 |
| DELETE | `/api/admin/users/[id]` | 级联删除用户（`maxDuration=60`，长操作：Clerk + 7 表事务 + 逐个 OSS）；拒绝删自己 |

- 复用 `apiError` 信封；Clerk userId 非 uuid，校验非空即可（不用 `isUuid`）。
- 限流复用 agent 的 `checkRateLimit`，scope `admin`（防误操作刷写）。

---

## 8. 前端（`features/admin/components/`）

- **入口**：[`app-sidebar.tsx`](../src/components/layout/app-sidebar.tsx) 的 `SidebarFooter` 下拉，`isAdmin` 时显示「用户管理」`DropdownMenuItem` → `/dashboard/admin/users`（与 Credits 余额项并列）。
- **页面** `dashboard/admin/users/page.tsx`（server）：`isAdmin` 校验 → `UsersListing`（服务端预取 + `Suspense`）。
- **列表** `users-table/*`：client data-table（复用 `useDataTable` + `usersQueryOptions` + nuqs URL 状态）；列 = 用户（头像+名+邮箱）/ 注册时间 / 最近登录 / **Credits 余额** / 操作；支持搜索 + 分页 + 排序。
- **调 Credits 对话框** `adjust-credits-dialog.tsx`：TanStack Form（mode 加/设 + amount + note）；`amount` 字段用 **string** 类型（避免 number 与 undefined 的类型摩擦），提交时转 number → `POST …/credits` → 成功失效 `adminKeys.users` + credits 域。
- **删除对话框** `delete-user-dialog.tsx`：**二次确认**（输入用户邮箱/名匹配才可提交）+ 危险样式 → `DELETE …/[id]` → 成功失效列表 + toast 展示清理明细。

---

## 9. 关键约束与取舍

- **服务端鉴权是唯一安全底线**：客户端下拉可见性仅 UX；页面 `notFound()`、端点 403 才是真拦截。
- **`clerkClient()` 必须 await**（v7 改异步，漏写 typecheck 报错）。
- **`messages` 无 userId 列**：删用户消息只能经 `conversations` 的 cascade，不能直接 `delete messages where userId`。
- **删除不可逆**：先 Clerk 删号断登录；DB 事务；OSS 失败仅告警；二次确认 + 防自删兜底。
- **余额批量查**：`getBalancesByIds`（`where userId in`）避免逐用户 N+1。
- **幂等**：Clerk 删号 404 继续清理，支持中断后重跑。

---

## 10. 明确延后（未实现）

停用 / 冻结（软删除，Clerk ban）、批量调 Credits / 批量删除、用户角色权限、复杂筛选、「用户管理」进主导航（当前仅账号下拉入口；如需可用 `NavItem.access` 扩展 + `use-nav` 支持 isAdmin）、移除 CLI `credit-admin.ts`（保留为应急后备，与 Web 共用同一 service）。

---

## 11. 手动验收清单

- **鉴权**：非管理员访问 `/dashboard/admin/users` → notFound；调 admin 端点 → 403；账号下拉**不见**「用户管理」。`ADMIN_USER_IDS` 未配 → 所有人不可达。
- **列表**：管理员进入 → 全部用户 + 正确余额；搜索 / 分页 / 排序可用。
- **调 Credits**：给某用户 grant 500 → 余额 +500 + `credit_ledger` 有 grant 流水；set → 余额被设定；该用户下次对话可用额度相应变化。
- **删除**：删某测试号 → Clerk 无账号（无法登录）、7 表无其数据、OSS 无其图片/视频对象、列表移除、toast 显示清理计数；删自己 → 被拒（400）。
- **组织移除**：工作区/团队菜单与页面消失、OrgSwitcher 消失、SidebarHeader 显示「LV999 Dashboard」；Agent/资产/知识库/设计/Credits 等功能不受影响。
