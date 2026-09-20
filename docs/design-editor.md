# 设计画布编辑器

LV999 Dashboard 的可视化创作模块：一个 Canva/Figma 式的**设计画布**，在画布上摆放文字、图形、图片（含引用 Agent 生成的图片资产），可选中/移动/缩放/旋转、撤销重做、导出 PNG，并把可编辑文档统一沉淀为 `kind='design'` 的资产。

> 基于 **Konva + react-konva**。文档模型自持有、可序列化；与「我的资产」共用同一套 assets 落库与查询体系，不新增数据库表。

---

## 1. 概览

- **入口**：`/dashboard/design`（新建空白画布）与 `/dashboard/design/[id]`（打开已存设计）；产出在 `/dashboard/assets`（我的资产）统一管理，行操作有「编辑」直达编辑器。
- **技术形态**：react-konva 纯客户端组件，经 `next/dynamic({ ssr: false })` 挂载（canvas 无法 SSR），**不走**项目的 SSR+Suspense 数据范式。
- **能力（MVP）**：加文字 / 矩形 / 圆 / 图片（从资产选）、选中/移动/缩放/旋转、删除、图层前后、撤销重做、缩放平移、文字 overlay 编辑（中文 IME 安全）、最小属性面板、保存 / 打开 / 导出 PNG / 回存资产。
- **明确延后**：本地图片上传、模板、多页、富文本排版引擎、吸附对齐、分组、复制粘贴、协作、zustand。

**核心设计原则（Konva 官方铁律）**：Konva 节点只是交互层，文档是独立的可序列化纯数据；拖拽/变换只在**操作结束**（`onDragEnd`/`onTransformEnd`）提交回 React；图片对象只存**资产引用 `assetId`**，不存图片字节。

---

## 2. 依赖与约束

- `konva@10.5.0` + `react-konva@~19.2.7`（均发布 2026-09-08，满足 bunfig 7 天冷却；`~` 锁定不跳到需要升 React 的 19.3）。
- **react-konva 主版本必须匹配 React 主版本**（React 19.2 → react-konva 19.2.x）。
- 未新增状态库；编辑器状态用 `useReducer` + Context（zustand 列为后备，面板增多/性能痛点时再平滑替换）。
- **未改数据库 schema**（复用 assets 现有列 `kind`/`content`/`storageKey`/`mime`）。

---

## 3. 数据模型（复用 assets 表，kind='design'）

design 是 assets 的第 4 类（见 [`agent/constants/kinds.ts`](../src/features/agent/constants/kinds.ts)：`markdown` / `html` / `image` / `design`）。落库约定：

| 字段 | design 资产取值 |
| --- | --- |
| `kind` | `'design'` |
| `content` | `JSON.stringify(DesignDocument)`（可编辑文档） |
| `mime` | `'application/json'` |
| `storageKey` | 导出 PNG 预览的 OSS key（用于列表缩略 / 预览 / 下载） |
| `source` | `'agent'` |

### 文档结构 `DesignDocument`

定义与 Zod 校验在 [`features/design/api/types.ts`](../src/features/design/api/types.ts)（前后端共用）：

```
DesignDocument = { version: 1, width, height, background, objects: DesignObject[] }

DesignObject（按 type 判别联合）：
  rect   : { id, x, y, rotation, width, height, fill, cornerRadius }
  circle : { id, x, y, rotation, radius, fill }
  text   : { id, x, y, rotation, text, fontSize, fill, fontStyle, width? }
  image  : { id, x, y, rotation, assetId(引用图片资产), width, height }
```

- `objects` 上限 `MAX_DOCUMENT_OBJECTS = 500`（防御性；请求体另有 4MB 上限）。
- image 对象只存 `assetId`；渲染时经 `/raw` 同源代理解析为图片（见第 5 节）。

---

## 4. 服务端与 API

design 本质是一种 asset，故复用现有资产 API 命名空间（`/api/agent/assets`），新增写入端点：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/agent/assets` | 创建 design：Zod 校验文档 → 解码预览 PNG → `createDesignAsset` → 返回 `{ id }`。限流 scope `design`（30 次/分/用户，带 `Retry-After`）|
| PATCH | `/api/agent/assets/[id]` | 更新 design：`isUuid` + 归属且 `kind==='design'` 校验 → `updateDesignAsset`。同限流 |
| GET | `/api/agent/assets/[id]/raw` | **同源图片字节代理**（见第 5 节）|

- 服务函数在 [`agent/api/service.ts`](../src/features/agent/api/service.ts)：`createDesignAsset` / `updateDesignAsset`，仿 `createImageAsset` 的「预生成 id → `putObject` 存 PNG → 一次性 insert / 按所有权 update」。
- 预览 PNG 以 base64 传入，经 [`design/lib/preview-png.ts`](../src/features/design/lib/preview-png.ts) `decodePreviewPng` 做 PNG 魔数 + 体积校验；畸形/超限按 400 处理。
- 资产详情 `GET /assets/[id]` 的 `previewUrl` 签发条件为 **`asset.storageKey` 存在**（覆盖 image + design），每次查询重新签发（3600s）。
- 下载 `GET /assets/[id]/download`：`design` 有 storageKey，走 302 签名 URL 分支，文件名扩展名映射 `design → png`。
- 客户端契约在 [`design/api/mutations.ts`](../src/features/design/api/mutations.ts)（`createDesignMutation` / `updateDesignMutation`，成功后失效 `agentKeys.assetsRoot()` + `assetRoot()`）与 [`design/api/queries.ts`](../src/features/design/api/queries.ts)（直接复用 agent 的 `assetQueryOptions` / `assetsQueryOptions`，与「我的资产」共享缓存）。

---

## 5. 图片同源代理（规避 canvas 跨域污染）

画布内引用的图片一律经 [`/api/agent/assets/[id]/raw`](../src/app/api/agent/assets/[id]/raw/route.ts) 加载：服务端用短期签名 URL（300s）拉取 OSS 对象，以**同源**流式回传字节。

- **为什么**：`stage.toDataURL()` 导出时，若画布含跨域图片且未正确 CORS，canvas 会被 taint 而无法导出。经同源代理后画布不被污染，**无需为 OSS 桶配置 CORS**。
- 客户端 [`hooks/use-asset-image.ts`](../src/features/design/hooks/use-asset-image.ts) 经 `/raw` 加载（`crossOrigin='anonymous'`）。
- 图片资产内容不可变（编辑产出新资产、新 id），故 `/raw` 响应可做浏览器私有缓存（`Cache-Control: private, max-age=3600`）。

---

## 6. 编辑器前端 `src/features/design/`

- `lib/editor-context.tsx`：`EditorProvider` —— 组合 reducer + 相机（zoom/position）+ 文字编辑态 + save/export；用 latest-ref 保持回调引用稳定。
- `hooks/use-editor-reducer.ts`：`{ past, present(document), future, selectedId, tool }`；**一次完整操作提交一条历史**（非每次指针移动）。
- `lib/document.ts`：对象工厂 / reorder（图层前后）/ `parseDesignDocument`（读库 JSON，损坏则回退空白）。
- `lib/export.ts`：`exportStageToDataURL` —— 导出前隐藏 Transformer、临时把相机归一并将 Stage 尺寸设为文档尺寸，`pixelRatio` 按最长边上限折算（默认 maxDimension 2560、maxPixelRatio 2），产出稳定尺寸，`finally` 恢复视图。
- `constants/canvas.ts`：画布尺寸预设 `CANVAS_PRESETS`、默认画布、填充色 `FILL_SWATCHES`、字号预设、缩放范围、`createEmptyDocument()`。
- 组件：
  - `design-editor-island.tsx`（`next/dynamic(ssr:false)` 包装，客户端边界）
  - `design-editor.tsx`（根组件：Provider + 布局，根 div 带 `flex-1 min-w-0`）
  - `editor-canvas.tsx`（`<Stage><Layer>` + 遍历 objects，空白处点击取消选中）
  - `editable-object.tsx`（按 type 渲染 + 选中挂 `Transformer`；`onTransformEnd` 把 scale 折算回宽高/半径/字号；`memo` 化）
  - `editor-toolbar.tsx`（加图形/文字/图片、撤销/重做、缩放、保存、导出）
  - `properties-panel.tsx`（选中对象属性 + 删除 + 图层前后；含**图层镜像列表**用于 canvas 可达性）
  - `asset-image-picker.tsx`（从「我的资产」image 资产选图，插入为 image 对象存 `assetId`）
  - `text-overlay.tsx`（双击文字 → 覆盖原生 `<textarea>` 编辑、失焦提交；保证中文 IME）

---

## 7. 页面路由

- [`app/dashboard/design/page.tsx`](../src/app/dashboard/design/page.tsx)（server）：渲染空白画布（`assetId=null`）；首次保存时 `createDesignMutation` → `router.replace('/dashboard/design/[id]')`（沿用 agent 新建会话的真实导航范式，非 `history.replaceState`）。
- [`app/dashboard/design/[id]/page.tsx`](../src/app/dashboard/design/[id]/page.tsx)（server）：`auth` + `isUuid` + 归属且 `kind==='design'` 校验（否则 `notFound()`），把 `parseDesignDocument(content)` 作为初始文档传入客户端编辑器（`key={asset.id}`）。
- [`app/dashboard/design/loading.tsx`](../src/app/dashboard/design/loading.tsx)：骨架。
- 导航：[`config/nav-config.ts`](../src/config/nav-config.ts) 「概览」组新增「设计画布」（`icon: 'palette'`）。
- 我的资产：预览弹窗对 `design` 展示导出 PNG + 「编辑」入口；表格行操作对 design 显示「编辑」。

---

## 8. Konva 官方最佳实践（本模块遵循项）

1. 文档数据与 Konva 节点分离；读值只在拖拽/变换结束时。
2. Transformer 用改变 scale 缩放——提交前把 scale 折算回对象自身的 width/height/radius/fontSize。
3. 历史边界：一次完整用户操作记一条 undo。
4. 导出前隐藏 Transformer；有相机变换时归一相机与 Stage 尺寸再导出，`pixelRatio` 归一。
5. 跨域图片会污染画布——本模块用同源 `/raw` 代理规避。
6. 可达性：canvas 内部对辅助技术不可见，属性面板提供图层镜像列表。
7. 图片只存资产引用，绝不放进历史数组。

官方文档参考：react-konva 入口 <https://konvajs.org/docs/react/index.html>、Canvas Editor 范式 <https://konvajs.org/docs/sandbox/Canvas_Editor.html>、高质量导出 <https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html>。

---

## 9. 手动验收清单

新建 → 拖拽/缩放/旋转 → 加资产图片 → 改文字（中文输入法）→ 撤销重做 → 保存 → 在「我的资产」见 design 预览 → 点「编辑」重新打开 → 导出 PNG。
