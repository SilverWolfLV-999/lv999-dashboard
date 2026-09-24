# 简化版导航 RBAC 系统

## 概述

本文档解释了导航项的完全客户端 RBAC（基于角色的访问控制）系统。

**核心理念**：导航可见性仅是 UX 层面的，而非安全层面的。我们可以使用 Clerk 的 hooks 在客户端完成所有检查！

## 架构

### 核心文件

1. **`src/hooks/use-nav.ts`** — 单个 hook 处理所有过滤逻辑（完全客户端）
2. **`src/types/index.ts`** — 类型定义，包含 `access` 属性

### 为什么选择客户端？

- **导航可见性仅是 UX** — 用户无法通过看到/隐藏导航项来绕过安全机制
- **Clerk 在客户端提供所有数据** — `useOrganization()` 提供 `membership.permissions` 和 `membership.role`
- **零服务端调用** — 即时过滤，无加载状态，无 UI 闪烁
- **更好的性能** — 无网络延迟，无异步复杂度

**注意**：对于真正的安全（API 路由、Server Actions、页面保护），始终使用服务端检查。

## 性能特征

### 所有检查都是同步的

✅ **requireOrg**：使用 `useOrganization()` 的客户端检查
✅ **permission**：使用 `membership.permissions` 数组的客户端检查
✅ **role**：使用 `membership.role` 的客户端检查
⚠️ **plan/feature**：需要服务端检查（见下文）

### 零服务端调用

- 所有导航过滤同步完成
- 无加载状态
- 无 UI 闪烁
- 即时结果

## 使用方式

### 在 `nav-config.ts` 中

```typescript
{
  title: 'Teams',
  url: '/dashboard/workspaces/team',
  icon: 'userPen',
  // 简单用法：requireOrg（客户端检查，即时）
  access: { requireOrg: true }
}

{
  title: 'Admin Panel',
  url: '/dashboard/admin',
  icon: 'settings',
  // 全部客户端检查 — 即时！
  access: {
    requireOrg: true,
    permission: 'org:admin:manage',  // 客户端检查 membership.permissions
    role: 'admin'  // 客户端检查 membership.role
}
```

### 在组件中

```typescript
import { useFilteredNavItems } from '@/hooks/use-nav';

function MyComponent() {
  const filteredItems = useFilteredNavItems(navItems);
  // filteredItems 会根据 RBAC 自动过滤
}
```

### Plan/Feature 检查

Plan 和 Feature 需要 Clerk 的 `has()` 函数，该函数仅限服务端使用。可选方案：

1. **存储在组织元数据中**（导航场景推荐）：

   ```typescript
   // 在组织设置中
   organization.publicMetadata.plan = 'pro';

   // 在 nav-config.ts 中
   access: {
     requireOrg: true,
     // 改为检查 metadata 而非 plan
   }
   ```

2. **显示项目，在页面级别保护**（当前方案）：
   - 导航项正常显示
   - 页面组件在服务端检查，必要时重定向/显示错误

3. **使用 Server Action**（确实需要时）：
   - 仅用于绝对需要 plan/feature 检查的导航项
   - 大多数导航项不需要这种方式

## 扩展性

### 添加新项

只需在 `nav-config.ts` 中添加：

```typescript
{
  title: 'New Feature',
  url: '/dashboard/new',
  icon: 'star',
  access: { plan: 'pro' }  // 就这样！
}
```

系统会自动：

- 在侧边栏中过滤
- 在 kbar 中过滤
- 按需处理异步检查
- 即时处理同步检查

### 添加新的访问类型

1. 在 `src/app/actions/rbac.ts` 的 `PermissionCheck` 接口中添加
2. 在 `checkAccess()` 函数中添加检查逻辑
3. 更新 `use-nav.ts` 以处理新类型

## 对比：重构前 vs 重构后

### 重构前（过度复杂）

- 4 个文件包含复杂逻辑
- 多个 hooks 和工具函数
- 数据流不清晰
- 潜在 bug 风险

### 重构后（简化版）

- 1 个主 hook 文件
- 清晰、线性的逻辑
- 易于理解
- 易于维护

## 最佳实践

1. **简单场景使用 `requireOrg: true`** — 即时生效，无需服务端调用
2. **尽可能组合检查** — `{ requireOrg: true, permission: '...' }` 比分开的检查更高效
3. **避免不必要的检查** — 如果项目应始终可见，不要添加 `access`

## 从旧系统迁移

旧的 `visible` 函数仍然支持，保持向后兼容：

```typescript
// 旧写法（仍然可用）
visible: (context) => !!context?.organization;

// 新写法（推荐）
access: {
  requireOrg: true;
}
```

## 未来改进方向

如有需要，可考虑的优化：

1. 缓存权限检查结果（如使用 React Query）
2. 应用加载时预取权限
3. 乐观 UI 更新

但目前，当前实现已经：

- ✅ 简单
- ✅ 快速
- ✅ 可扩展
- ✅ 易维护
