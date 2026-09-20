# Agent 创作模块

LV999 Dashboard 在后台骨架之上长出的核心业务模块：把「自然语言对话」转化为可沉淀、可管理的**内容资产**（Markdown / HTML / 图片）。本文档描述其架构、数据模型、流式与停止机制、资产化设计、模型注册表与 API 契约。

> 该模块已接入**真实后端**（PostgreSQL + 阿里云 OSS + Redis + 阿里云百炼），非 Mock。运行前需配置对应环境变量（见文末）。

---

## 1. 概览

- **入口**：`/dashboard/agent`（新建会话）与 `/dashboard/agent/[conversationId]`（会话页）；产出在 `/dashboard/assets`（我的资产）统一管理。
- **编排**：AI SDK v7 `ToolLoopAgent`，每请求无状态构建，上下文经闭包注入工具。
- **工具**：`createAsset`（Markdown / HTML）、`createImageAsset`（文生图 T2I）、`editImageAsset`（图生图 I2I）。
- **流式**：`resumable-stream` 可恢复 SSE，刷新 / 切回自动重连；停止走专用端点（跨实例真取消）。
- **持久化**：Drizzle ORM + PostgreSQL，三张表 `conversations` / `messages` / `assets`；图片二进制存 OSS，库里只存 `storageKey`。

---

## 2. 架构与目录

```plaintext
src/features/agent/
├── api/
│   ├── types.ts            # 类型契约（Conversation / ChatMessage / Asset / 过滤参数）
│   ├── service.ts          # 数据访问层（server-only）：会话 / 消息 / 资产的 DB + OSS 操作
│   ├── queries.ts          # TanStack Query options + 查询键工厂 agentKeys
│   ├── mutations.ts        # 会话增删改的 mutation options
│   ├── provider.ts         # resolveModel(key)：百炼直连 + 兼容模式兜底
│   ├── agent.ts            # buildAgent()、工具定义、agentValidationTools
│   ├── image-generation.ts # 图片生成通道（直连百炼 REST，T2I / I2I）
│   ├── rate-limit.ts       # 固定窗口 Redis 限流
│   └── stop-signal.ts      # 跨实例停止信号（Redis 标志 + 轮询）
├── components/
│   ├── chat/               # 对话窗口、消息项、工具 part 卡片、模型选择器
│   ├── assets/             # 资产卡片、列表、预览弹窗、资产表格
│   └── conversations/      # 会话列表
├── constants/
│   ├── models.ts           # 对话模型注册表（4 个文本模型）
│   ├── image-models.ts     # 图像模型注册表（2 个）+ 比例预设 ASPECT_PRESETS
│   ├── kinds.ts            # 资产类型元数据（markdown / html / image）
│   ├── conversation.ts     # 默认标题与标题生成
│   └── limits.ts           # 请求体上限 MAX_REQUEST_BYTES
└── lib/                    # 前端辅助（如首条消息交接）

src/app/api/agent/          # Route Handlers（REST / SSE）
src/lib/db/                 # Drizzle schema.ts 与 getDb()
src/lib/oss.ts              # OSS 客户端、对象 key、签名 URL
src/lib/redis.ts            # Redis 连接（getConnectedRedis）
src/lib/api-error.ts        # 统一错误信封 apiError()
```

**分层约定**：客户端组件 → `queries.ts` / `mutations.ts`（经 `apiClient` 调 `/api/agent/*`）→ Route Handler → `service.ts`（server-only）→ DB / OSS。客户端**不直接**引用 `service.ts`。

---

## 3. 数据模型

Drizzle schema 定义于 [`src/lib/db/schema.ts`](../src/lib/db/schema.ts)，共三张表：

### conversations（会话）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | 默认随机生成 |
| `userId` | text | Clerk userId |
| `title` | text | 会话标题（首条消息自动生成） |
| `model` | text | 会话级模型选择，默认 `deepseek-flash` |
| `activeStreamId` | text \| null | 正在进行的可恢复流 id；无活跃流时为 null |
| `createdAt` / `updatedAt` | timestamptz | |

### messages（消息）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | text PK | 与 AI SDK 消息 id 对齐 |
| `conversationId` | uuid FK → conversations | `ON DELETE CASCADE` |
| `role` | text | user / assistant 等 |
| `parts` | jsonb | 原样存储 AI SDK `UIMessage.parts` |
| `metadata` | jsonb \| null | 含 `streamId` 等 |
| `createdAt` | timestamptz | 索引：`(conversationId, createdAt)` |

### assets（资产）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid PK | 图片资产由应用层预生成 id（先转存 OSS 再入库） |
| `conversationId` | uuid FK → conversations | `ON DELETE SET NULL`（会话删除，资产保留） |
| `sourceAssetId` | uuid FK → assets（自引用） | I2I 派生资产指向源图；`ON DELETE SET NULL` |
| `userId` | text | 归属用户 |
| `source` | text | `agent`（生成）/ `upload`（导入），默认 `agent` |
| `kind` | text | `markdown` / `html` / `image` |
| `title` | text | 资产标题 |
| `status` | text | 默认 `ready` |
| `content` | text \| null | 文本资产存正文；图片资产存生成 prompt（可溯源） |
| `storageKey` | text \| null | OSS 对象 key（图片等二进制非空） |
| `mime` / `sizeBytes` | | |
| `createdAt` / `updatedAt` | timestamptz | 索引：`(userId, createdAt)`、`(conversationId)` |

> **关键判据**：判断资产是否为二进制（走 OSS）用 `storageKey` 而非 `content`——图片资产的 `content` 列存的是 prompt（非 null）。

---

## 4. 对话与流式

### 4.1 可恢复流（resumable-stream）

生成路由 [`chat/route.ts`](../src/app/api/agent/chat/route.ts) 使用 `createUIMessageStreamResponse` + `toUIMessageStream`，并把流交给 `resumable-stream`：

- 生产者在无人订阅时把流写完整（`waitUntil(after)` 保活）。
- 每开新流先生成 `streamId` 并**立即**登记到 `conversations.activeStreamId`（防止窗口期刷新重连到旧流或拿 204）。
- 客户端 `useChat({ resume: true })` 在挂载时自动 `GET /api/agent/chat/[id]/stream` 重连进行中的流（刷新 / 切回实时恢复）。
- `streamId` 随响应消息 `metadata` 下发，供客户端停止时携带最新流 id。
- **必须提供 `generateMessageId`**：否则响应消息 id 为空串，会在 `messages` 主键上跨会话冲突（历史事故：串会话 + 消息丢失）。

### 4.2 新会话首条消息交接

新建会话时前端先 `createConversation` 拿到 id，再 `router.replace` 到会话页（**真实导航**，不能用 `history.replaceState`——否则 URL 与渲染树脱节、组件被复用、状态不重置）；首条消息经一次性交接由目标页发送。

### 4.3 停止信号（跨实例真取消）

见 [`stop-signal.ts`](../src/features/agent/api/stop-signal.ts) 与 [`chat/[id]/stop/route.ts`](../src/app/api/agent/chat/[id]/stop/route.ts)。serverless 多实例下无持久执行平台时的方案：

1. stop 端点保存客户端部分快照（`onConflictDoNothing`，只插不覆盖）。
2. 向 Redis 写入 `agent:stop:{streamId}` 标志（TTL 300s）。
3. 生成路由每 2 秒轮询该标志，命中后 `abort` 底层生成（真取消）。
4. 校验后清理 `activeStreamId`（仅当仍指向同一流，避免误清之后启动的新流）。

> **离开页面 / 卸载 ≠ 停止**：离开属于断开，应保持可恢复；只有点击停止按钮才真取消。

### 4.4 消息持久化纪律

`service.ts` 的 `syncConversationMessages` 采用「按所有权更新」：仅对本轮新产生的消息（`finalMessages` 超出 `originalMessages` 的尾部）执行冲突更新，其余旧消息一律 `onConflictDoNothing`，避免用陈旧客户端视图覆盖服务端较新版本。`cleanupSupersededResponses` 在新请求开始阶段清理被取代的残留 assistant 消息（带守卫，仅当目标 user 消息仍是会话最后一条）。

---

## 5. Agent 与工具

`buildAgent()`（[`agent.ts`](../src/features/agent/api/agent.ts)）每请求构建一个 `ToolLoopAgent`：`stopWhen: isStepCount(6)`、`timeout.totalMs: 240_000`、`onStepEnd` / `onEnd` 记录 step / usage。三个工具：

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| `createAsset` | `title` / `kind`(markdown\|html) / `content` | 文本作品直接落库 `assets.content`；`≤200KB`（`MAX_ASSET_SIZE_BYTES`）|
| `createImageAsset` | `title` / `prompt` / `aspect?` | 文生图：生成 → 立即下载 → 转存 OSS → 入库图片资产 |
| `editImageAsset` | `sourceAssetId` / `title` / `instruction` / `aspect?` | 图生图（I2I）：校验源图归属/kind/`storageKey`/≤10MB → 签名 URL 直传百炼 → 产出派生资产（`sourceAssetId` 记录血缘）|

工具校验用 `agentValidationTools`（与执行工具共享同一 Zod schema），配合 `validateUIMessages` 对历史消息做进入模型前的校验（畸形历史 → 400 而非 500）。

---

## 6. 资产化

- **三类资产**：`markdown` / `html` / `image`（元数据统一在 [`constants/kinds.ts`](../src/features/agent/constants/kinds.ts)，对话卡片 / 预览弹窗 / 表格列共用）。另有第四类 `design`（设计画布产物）由设计模块写入，见 [docs/design-editor.md](./design-editor.md)。
- **文本资产**：正文直接存 `content` 列（Phase 1 决策：MVP 不引入 OSS，`storageKey` / `mime` / `sizeBytes` 字段已预留）。
- **图片资产**：应用层预生成 `assetId` → 转存 OSS → 一次性 insert 全字段；`content` 列存生成 prompt（可溯源 / 可重试）。
- **血缘**：I2I 产物通过 `sourceAssetId` 指向源图；预览弹窗展示「基于《源标题》修改」；源图删除后 `SET NULL`，派生图仍可访问。
- **下载**（[`assets/[id]/download`](../src/app/api/agent/assets/[id]/download/route.ts)）：有 `storageKey` → 302 跳转带附件名的短期签名 URL（TTL 300s）；文本资产直接返回 `content`。
- **删除**：删 DB 行的同时顺带删 OSS 对象（失败仅告警不阻塞）。

---

## 7. 模型注册表

模型注册表把 UI / DB 使用的**内部 key** 映射到底层 provider 与 model ID——未来模型改名 / 下线 / 换通道只需改一行配置，业务代码不动。

### 对话模型（[`constants/models.ts`](../src/features/agent/constants/models.ts)）

| key | label | providerModelId | 默认 |
| --- | --- | --- | --- |
| `deepseek-flash` | DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | ✅ |
| `deepseek-v4-pro` | DeepSeek V4 Pro | `deepseek-v4-pro-0813` | |
| `qwen3.8-flash` | Qwen3.8 Flash | `qwen3.8-flash` | |
| `qwen3.8-max` | Qwen3.8 Max | `qwen3.8-max` | |

`resolveModel(key)`（[`provider.ts`](../src/features/agent/api/provider.ts)）优先经 `@ai-sdk/alibaba` 解析，不支持的模型回退到百炼 OpenAI 兼容模式（`createOpenAICompatible`），所有模型共用同一 `DASHSCOPE_API_KEY`。

### 图像模型（[`constants/image-models.ts`](../src/features/agent/constants/image-models.ts)）

| key | 说明 | 默认 |
| --- | --- | --- |
| `qwen-image-3.0` | 标准版：文字渲染稳定，兼顾质量与速度 | ✅ |
| `qwen-image-3.0-pro` | 旗舰：复杂版面 / 密集小字更强（较慢较贵）| |

比例预设 `ASPECT_PRESETS`（key → `"宽*高"`，全部 1K 计费档）：`1:1` / `3:4` / `4:3` / `3:2` / `2:3` / `16:9` / `9:16`。

---

## 8. 图片生成通道

[`image-generation.ts`](../src/features/agent/api/image-generation.ts) 直连百炼 REST（不经 AI SDK provider——`@ai-sdk/alibaba` 无图像模型），不引入新依赖：

- 端点：`https://dashscope.aliyuncs.com` 的 `multimodal-generation/generation`（sync 协议）。
- T2I：`content = [{ text }]`；I2I：`content = [{ image: <公网URL> }, { text: <指令> }]`，源图用 OSS 短期签名 URL（TTL 900s）。
- **红线**：返回的图片链接 24h 有效，必须立即下载转存 OSS，任何持久化字段不得存临时 URL。
- 校验：PNG magic bytes、下载体积 ≤15MB；`enable_thinking` 显式关闭（否则耗时 3-4 倍）。
- 用户停止时 `abortSignal` 透传，同步取消进行中的请求与轮询。

---

## 9. API 端点一览

所有端点在开头 `auth()` 校验 userId；错误统一走 `apiError()` 信封。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/agent/chat` | 发起生成，返回可恢复 SSE 流（`runtime=nodejs`，`maxDuration=300`）|
| GET | `/api/agent/chat/[id]/stream` | 重连进行中的流（`resume`）|
| POST | `/api/agent/chat/[id]/stop` | 停止生成（保存快照 + 写停止信号）|
| GET | `/api/agent/conversations` | 会话列表 |
| PATCH / DELETE | `/api/agent/conversations/[id]` | 更新（标题 / 模型）/ 删除会话 |
| GET | `/api/agent/assets` | 资产列表（分页 / 搜索 / kind 筛选 / 排序）|
| POST | `/api/agent/assets` | 创建 design 资产（限流 scope `design` 30/分）——详见 design-editor.md |
| GET / DELETE | `/api/agent/assets/[id]` | 资产详情（有 `storageKey` 时附签名 previewUrl，cover image + design）/ 删除 |
| PATCH | `/api/agent/assets/[id]` | 更新 design 资产（归属且 `kind==='design'`）|
| GET | `/api/agent/assets/[id]/download` | 下载（image / design 走 302 签名 URL，文本直接返回）|
| GET | `/api/agent/assets/[id]/raw` | 资产字节同源代理（供设计画布加载图片、规避 canvas 跨域污染）|

---

## 10. 限流与错误信封

### 错误信封（API 契约硬化 v1）

服务端可预期错误一律通过 [`apiError(status, code, message, headers?)`](../src/lib/api-error.ts) 返回 `{ error: { code, message } }`；`code` 取值：`unauthorized` / `invalid_json` / `invalid_request` / `not_found` / `payload_too_large` / `too_many_requests` / `not_implemented`。客户端 `api-client.ts` 的 `ApiError` 解析信封并暴露 `status` 与 `code`。

- **路径参数**：所有 `[id]` 路由先用 [`isUuid`](../src/lib/utils.ts) 预校验，非法格式返回 404 `not_found`（避免直达 DB 产生 500）。
- **限流**：429 响应携带 `Retry-After` 头。

### 限流（固定窗口 Redis）

[`rate-limit.ts`](../src/features/agent/api/rate-limit.ts) 复用 Upstash Redis 计数；Redis 异常时 **fail-open**（放行并记录）：

| scope | 限额 | 窗口 |
| --- | --- | --- |
| `chat` | 20 次 | 60s / 用户 |
| `stop` | 60 次（从宽，保证停止始终可用）| 60s / 用户 |

请求体上限 `MAX_REQUEST_BYTES = 4MB`（chat 与 stop 共用）；chat 另限 `MAX_MESSAGES=200`、`MAX_PARTS_PER_MESSAGE=500`。

---

## 11. 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串；密码特殊字符需 URL 编码（`@`→`%40`）|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key（对话与图片模型共用）|
| `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS（私有 bucket，需为部署域名配置 CORS）|
| `REDIS_URL` | Redis 连接串（需 pub/sub 支持的 TLS 连接，推荐 Upstash）|

完整清单见 [`env.example.txt`](../env.example.txt)。

---

## 12. 本地开发与数据库迁移

```bash
# 由 schema.ts 生成迁移 SQL（无需连库）
bunx drizzle-kit generate

# 应用最新一个 .sql 到数据库（也可传入指定文件名）
bun scripts/db-apply-sql.ts
```

> 当前阿里云 RDS 实例下 `bun run db:push`（`drizzle-kit push`）会在连接阶段静默失败，因此采用确定性工作流：`drizzle-kit generate` 生成 SQL → `scripts/db-apply-sql.ts` 应用。`drizzle.config.ts` 已用 `process.loadEnvFile('.env.local')` 显式加载环境变量（drizzle-kit 不自动读取 `.env.local`）。数据库访问统一经 `getDb()` 懒加载，避免构建期缺 `DATABASE_URL` 失败。

### 冒烟脚本

`scripts/` 下保留可复跑的外部连通性 / 回归脚本：`models-smoke.ts`（对话模型）、`image-smoke.ts`（文生图）、`edit-smoke.ts`（图生图）、`oss-smoke.ts`（OSS 读写）、`resumable-smoke.ts`（流恢复）、`db-apply-sql.ts`（应用迁移 SQL）。

> 真实外部调用测试须显式设置超时，否则默认超时中断会遗留测试数据。
